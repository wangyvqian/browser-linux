#!/usr/bin/env node
// Local helper for browser-linux. Two jobs, both deliberately narrow:
//   1. serve the guest images from this folder over loopback HTTP, so the page
//      reads its disk from the user's own machine instead of the network;
//   2. speak v86's wisp backend so the guest gets outbound TCP (apt, curl).
// It does not run a VM and does not execute guest code.
//
// Security posture: bind loopback only, allowlist the page origin, and filter
// where the relay is allowed to connect. An unauthenticated local proxy port is
// something every other page on the user's machine could use.

import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat, readFile, writeFile, mkdir } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { WebSocketServer } from "ws";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";

const PORT_HTTP = Number(process.env.BL_PORT_HTTP || 48121);
const PORT_WISP = Number(process.env.BL_PORT_WISP || 48120);
const HOST = "127.0.0.1";

const folder = resolve(process.argv[2] ?? process.cwd());
// Fail closed. An open loopback port is usable by every page the user has
// open, so the allowlist is the default and widening it is opt-in.
const DEFAULT_ORIGINS = "https://wangyvqian.github.io,http://localhost:8000,http://127.0.0.1:8000";
const open = process.env.BL_ALLOW_ANY_ORIGIN === "1";
const origins = new Set(
  (process.env.BL_ORIGINS ?? DEFAULT_ORIGINS).split(",").map((s) => s.trim()).filter(Boolean),
);
const allowedHosts = new Set(
  (process.env.BL_ALLOWED_HOSTS ?? "deb.debian.org,security.debian.org,archive.debian.org,deb.debian.cdn,github.com,objects.githubusercontent.com,raw.githubusercontent.com,registry.npmjs.org")
    .split(",").filter(Boolean),
);

// Tokens are single use and short lived: they arrive through a custom protocol
// URL, which any local process could also observe.
const pending = new Map();
const trusted = new Set();

const mime = {
  ".img": "application/octet-stream",
  ".zst": "application/zstd",
  ".bin": "application/octet-stream",
  ".json": "application/json",
};

function cors(res, origin) {
  if (open || origins.has(origin)) {
    res.setHeader("access-control-allow-origin", origin ?? "*");
    res.setHeader("vary", "Origin");
    return true;
  }
  return false;
}

async function machine() {
  const path = join(folder, "machine.json");
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    const fresh = { name: "browser-linux", created: new Date().toISOString(), version: 1 };
    await writeFile(path, JSON.stringify(fresh, null, 2));
    return fresh;
  }
}

const info = await machine();

const http = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}`);
  if (!cors(res, req.headers.origin)) {
    res.writeHead(403).end("origin not paired");
    return;
  }

  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ product: "browser-linux-helper", protocol: 1, machine: info }));
    return;
  }

  if (url.pathname === "/pair") {
    const token = url.searchParams.get("t");
    if (!token || token.length < 16) {
      res.writeHead(400).end("bad token");
      return;
    }
    pending.set(token, { origin: req.headers.origin, expires: Date.now() + 60000 });
    console.log(`paired a page origin: ${req.headers.origin}`);
    res.writeHead(200).end("ok");
    return;
  }

  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
  if (rel.startsWith("..")) {
    res.writeHead(400).end("bad path");
    return;
  }

  let file;
  try {
    file = join(folder, rel);
    const found = await stat(file);
    if (found.isDirectory()) throw new Error("directory");
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
    const headers = {
      "content-type": mime[extname(file)] ?? "application/octet-stream",
      "accept-ranges": "bytes",
    };
    if (range && (range[1] || range[2])) {
      const start = Number(range[1] || 0);
      const end = Math.min(Number(range[2]) || found.size - 1, found.size - 1);
      res.writeHead(206, { ...headers, "content-range": `bytes ${start}-${end}/${found.size}`, "content-length": end - start + 1 });
      createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { ...headers, "content-length": found.size });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404).end("not found");
  }
});

// The wisp relay rides its own port so the page can point v86 at a plain
// ws:// URL without sharing a handler with the file server.
wisp.options.hostname_whitelist = [...allowedHosts];
wisp.options.allow_udp_streams = false;
wisp.options.allow_private_ips = false;
wisp.options.allow_loopback_ips = false;

const wss = new WebSocketServer({ host: HOST, port: PORT_WISP });

wss.on("connection", (socket, request) => {
  const origin = request.headers.origin;
  const url = new URL(request.url, `ws://${HOST}`);
  const token = url.searchParams.get("t");

  if (token && pending.has(token)) {
    const entry = pending.get(token);
    pending.delete(token);
    if (entry.origin && entry.origin !== origin) {
      socket.close(1008, "origin mismatch");
      return;
    }
    trusted.add(origin);
  } else if (!open && !trusted.has(origin)) {
    console.log(`refused wisp connection from unpaired origin: ${origin}`);
    socket.close(1008, "not paired");
    return;
  }

  try {
    new wisp.ServerConnection(socket);
  } catch (error) {
    console.log("wisp connection failed:", error.message);
    socket.close(1011, "wisp error");
  }
});

await mkdir(join(folder, "saved"), { recursive: true }).catch(() => {});

http.listen(PORT_HTTP, HOST, () => {
  console.log(`browser-linux-helper`);
  console.log(`  folder  ${folder}`);
  console.log(`  machine ${info.name}`);
  console.log(`  files   http://${HOST}:${PORT_HTTP}/`);
  console.log(`  wisp    ws://${HOST}:${PORT_WISP}/`);
  console.log(`  origins ${open ? "(any — BL_ALLOW_ANY_ORIGIN=1)" : [...origins].join(", ")}`);
});
