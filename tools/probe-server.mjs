import { createServer } from "node:http";
import { WebSocketServer } from "ws";

// Stands in for the future helper: proves a browser page can reach a loopback
// listener at all. Loopback only — never bind 0.0.0.0 here.
const WS_PORT = 48120;
const HTTP_PORT = 48121;

createServer((req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end(`pong from probe-server ${new Date().toISOString()}\n`);
}).listen(HTTP_PORT, "127.0.0.1", () => console.log(`http  http://127.0.0.1:${HTTP_PORT}/ping`));

const wss = new WebSocketServer({ server: undefined, host: "127.0.0.1", port: WS_PORT });
wss.on("connection", (socket, request) => {
  console.log("ws connection from", request.headers.origin ?? "unknown origin");
  socket.send(`hello from probe-server; your origin is ${request.headers.origin ?? "none"}`);
  socket.on("message", (data) => socket.send(`echo: ${data}`));
});
console.log(`ws   ws://127.0.0.1:${WS_PORT}/probe`);
