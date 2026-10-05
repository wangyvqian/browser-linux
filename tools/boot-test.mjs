import { fileURLToPath } from "node:url";
import path from "node:path";
import { V86 } from "../public/vendor/libv86.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROFILE = process.argv[2] ?? "vga";
const TIMEOUT_MS = Number(process.argv[3] ?? 120000);

const PROFILES = {
  vga: {
    image: "linux.iso",
    options: {
      bios: { url: path.join(root, "public/bios/seabios.bin") },
      vga_bios: { url: path.join(root, "public/bios/vgabios.bin") },
      cdrom: { url: path.join(root, "public/images/linux.iso") },
    },
  },
  // Enable once .github/workflows/build-image.yml has produced a 32-bit
  // Debian kernel + rootfs; asserts the xterm/serial path end to end.
  debian: {
    image: "debian-bzImage",
    options: {
      bzimage: { url: path.join(root, "public/images/debian-bzImage"), async: false },
      initrd: { url: path.join(root, "public/images/debian-initrd"), async: false },
      cmdline: "console=ttyS0,115200 rw",
    },
  },
};

const IMAGE = PROFILES[PROFILE].image;

let pending = "";
let seen = "";
const onByte = (byte) => {
  const char = String.fromCharCode(byte);
  if (char < " " && char !== "\n") return;
  pending += char;
  seen = (seen + char).slice(-20000);
};
setInterval(() => {
  process.stdout.write(pending.replace(/\r/g, ""));
  pending = "";
}, 500).unref();

const emulator = new V86({
  wasm_path: path.join(root, "public/vendor/v86.wasm"),
  memory_size: 128 * 1024 * 1024,
  autostart: true,
  disable_speaker: true,
  ...PROFILES[PROFILE].options,
});

emulator.add_listener("serial0-output-byte", onByte);

const vga = new Map();
let vgaSize = [80, 25];
emulator.add_listener("screen-set-size", ([w, h]) => { vgaSize = [w || 80, h || 25]; });
emulator.add_listener("screen-put-char", ([row, col, chr]) => { vga.set(`${row},${col}`, String.fromCharCode(chr)); });

const dumpVga = () => {
  const [, rows] = vgaSize;
  const lines = [];
  for (let r = 0; r < rows; r++) {
    let line = "";
    for (let c = 0; c < 80; c++) line += vga.get(`${r},${c}`) ?? " ";
    if (line.trim()) lines.push(line.trimEnd());
  }
  return lines;
};

const fail = (reason) => {
  console.error(`\nFAIL [${PROFILE}]: ${reason} (image: ${IMAGE})`);
  const lines = dumpVga();
  console.error(`--- VGA text (${lines.length} lines) ---`);
  console.error(lines.slice(-20).join("\n") || "(empty)");
  console.error("--- serial text ---");
  console.error(seen.replace(/\r/g, "").slice(-1500) || "(empty)");
  emulator.destroy().finally(() => process.exit(1));
};

const timer = setTimeout(() => fail(`no shell prompt within ${TIMEOUT_MS}ms`), TIMEOUT_MS);

const screenText = () => dumpVga().join("\n");
const outputText = () => (PROFILE === "serial" ? seen.replace(/\r/g, "") : screenText());
const typeText = (text) => (PROFILE === "serial" ? emulator.serial0_send(text) : emulator.keyboard_send_text(text));
let sent = false;
const promptReady = (text) => /[%#$]\s*$/.test(text.split("\n").pop() ?? "");

const watch = setInterval(() => {
  const text = outputText();
  if (!sent && promptReady(text)) {
    sent = true;
    typeText("echo BOOT_OK; uname -a; head -3 /etc/os-release 2>/dev/null\n");
  }
  if (text.includes("BOOT_OK")) {
    clearTimeout(timer);
    clearInterval(watch);
    setTimeout(() => {
      process.stdout.write(pending.replace(/\r/g, ""));
      console.log(`\nPASS [${PROFILE}]: ${IMAGE} booted to a usable shell`);
      console.log(outputText().split("\n").slice(-8).join("\n"));
      emulator.destroy().finally(() => process.exit(0));
    }, 2000);
  }
}, 400);
