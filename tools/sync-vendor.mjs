import { copyFile, mkdir, rm } from "node:fs/promises";

const targets = [
  ["node_modules/v86/build/libv86.mjs", "public/vendor/libv86.mjs"],
  ["node_modules/v86/build/v86.wasm", "public/vendor/v86.wasm"],
  ["node_modules/v86/build/v86-fallback.wasm", "public/vendor/v86-fallback.wasm"],
  ["node_modules/@xterm/xterm/lib/xterm.js", "public/vendor/xterm.js"],
  ["node_modules/@xterm/xterm/css/xterm.css", "public/vendor/xterm.css"],
  ["node_modules/@xterm/addon-fit/lib/addon-fit.js", "public/vendor/addon-fit.js"],
];

await mkdir("public/vendor", { recursive: true });

for (const [from, to] of targets) {
  try {
    await copyFile(from, to);
    console.log("copied", to);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    if (to.endsWith("fallback.wasm")) {
      await rm(to, { force: true });
      continue;
    }
    throw error;
  }
}
