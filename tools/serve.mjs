import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

const root = join(process.cwd(), "public");
const port = Number(process.env.PORT || 8000);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".bin": "application/octet-stream",
  ".iso": "application/octet-stream",
  ".img": "application/octet-stream",
  ".svg": "image/svg+xml",
};

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  // Resolve inside root only; ".." segments are normalised away before joining.
  const target = join(root, normalize(path === "/" ? "/index.html" : path));
  if (!target.startsWith(root)) {
    res.writeHead(403).end("forbidden");
    return;
  }

  let info;
  try {
    info = await stat(target);
    if (info.isDirectory()) info = await stat(target += "/index.html");
  } catch {
    res.writeHead(404).end("not found");
    return;
  }

  res.writeHead(200, {
    "content-type": mime[extname(target)] ?? "application/octet-stream",
    "content-length": info.size,
    "cache-control": "no-store",
  });
  createReadStream(target).pipe(res);
}).listen(port, () => console.log(`http://localhost:${port}/`));
