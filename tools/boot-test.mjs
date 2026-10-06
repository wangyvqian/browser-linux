import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROFILE = process.argv[2] ?? "vga";
const TIMEOUT_MS = Number(process.argv[3] ?? 120000);

// V86_DEBUG=1 runs the assertions build, which aborts loudly on instructions
// and devices v86 does not implement instead of spinning silently.
// V86_DIR overrides which build directory to load, for bisecting emulator
// regressions across published v86 versions.
const debug = process.env.V86_DEBUG === "1";
const dir = process.env.V86_DIR;
const libFile = debug ? "libv86-debug.mjs" : "libv86.mjs";
const libPath = dir
  ? path.join(dir, libFile)
  : path.join(root, debug ? "node_modules/v86/build" : "public/vendor", libFile);
const wasm = dir
  ? path.join(dir, debug ? "v86-debug.wasm" : "v86.wasm")
  : path.join(root, "node_modules/v86/build", debug ? "v86-debug.wasm" : "v86.wasm");
const { V86 } = await import(pathToFileURL(libPath).href);

const bios = {
  bios: { url: path.join(root, "public/bios/seabios.bin") },
  vga_bios: { url: path.join(root, "public/bios/vgabios.bin") },
};

const PROFILES = {
  vga: {
    image: "linux.iso (stock v86 demo)",
    console: "vga",
    options: { ...bios, cdrom: { url: path.join(root, "public/images/linux.iso") } },
    stages: [{ expect: /[%#$]\s*$/, send: "echo BOOT_OK; uname -a\n" }],
  },
  debian: {
    image: "Debian i386 terminal (initrd root)",
    console: "serial",
    options: {
      ...bios,
      bzimage: { url: path.join(root, "public/images/debian-bzImage"), async: false },
      initrd: { url: path.join(root, "public/images/debian-initrd"), async: false },
      cmdline: "console=ttyS0,115200 noapic nolapic",
    },
    stages: [{ expect: /[%#$]\s*$/, send: "echo BOOT_OK; uname -r; head -2 /etc/os-release\n" }],
  },
  desktop: {
    image: "Debian i386 desktop (ext4 disk, chunked)",
    console: "serial",
    // Served over HTTP through the same use_parts path the page uses, so this
    // exercises the loader the browser will use rather than a local shortcut.
    options: {
      ...bios,
      bzimage: { url: path.join(root, "public/images/debian-bzImage"), async: false },
      // v86's Node build resolves `url` as a filesystem path, not HTTP, so this
      // reads the same chunk files the browser fetches over HTTP.
      hda: {
        url: "public/images/desktop-chunks/chunk.zst",
        async: true,
        use_parts: true,
        fixed_chunk_size: 128 * 1024,
        size: 2 * 1024 * 1024 * 1024,
      },
      cmdline: "root=/dev/sda rw console=ttyS0,115200 noapic nolapic",
    },
    // The desktop claim is only real if X came up, so ask for it by name.
    stages: [
      { expect: /login:\s*$/, send: "root\n" },
      { expect: /assword:\s*$/, send: "\n" },
      {
        expect: /[%#$]\s*$/,
        send: "echo BOOT_OK; uname -r; pgrep -a Xorg || echo NO_XORG; ls /tmp/.X11-unix 2>&1|head -3\n",
      },
    ],
  },
};

const active = PROFILES[PROFILE];
if (!active) {
  console.error(`unknown profile ${PROFILE}; have: ${Object.keys(PROFILES).join(", ")}`);
  process.exit(2);
}

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
  wasm_path: wasm,
  memory_size: 512 * 1024 * 1024,
  autostart: true,
  disable_speaker: true,
  ...(debug ? { log_level: Number(process.env.V86_LOG ?? (0x1 | 0x4000)) } : {}),
  ...active.options,
});

emulator.add_listener("serial0-output-byte", onByte);

const vga = new Map();
let vgaRows = 25;
emulator.add_listener("screen-set-size", ([, h]) => { vgaRows = h || 25; });
emulator.add_listener("screen-put-char", ([row, col, chr]) => vga.set(`${row},${col}`, String.fromCharCode(chr)));

const vgaText = () => {
  const lines = [];
  for (let r = 0; r < vgaRows; r++) {
    let line = "";
    for (let c = 0; c < 80; c++) line += vga.get(`${r},${c}`) ?? " ";
    if (line.trim()) lines.push(line.trimEnd());
  }
  return lines.join("\n");
};
const outputText = () => (active.console === "serial" ? seen.replace(/\r/g, "") : vgaText());
const typeText = (text) =>
  active.console === "serial" ? emulator.serial0_send(text) : emulator.keyboard_send_text(text);

let stage = 0;

const fail = (reason) => {
  console.error(`\nFAIL [${PROFILE}]: ${reason}`);
  console.error(`--- serial ---\n${seen.replace(/\r/g, "").slice(-1500) || "(empty)"}`);
  console.error(`--- vga ---\n${vgaText().split("\n").slice(-15).join("\n") || "(empty)"}`);
  emulator.destroy().finally(() => process.exit(1));
};

const timer = setTimeout(() => fail(`stalled at stage ${stage} after ${TIMEOUT_MS}ms`), TIMEOUT_MS);

const watch = setInterval(() => {
  const text = outputText();
  const current = active.stages[stage];
  if (current && current.expect.test(text.split("\n").pop() ?? "")) {
    console.log(`\n[stage ${stage}] matched -> ${current.send.trim()}`);
    typeText(current.send);
    stage++;
  }
  if (text.includes("BOOT_OK")) {
    clearTimeout(timer);
    clearInterval(watch);
    setTimeout(() => {
      process.stdout.write(pending.replace(/\r/g, ""));
      console.log(`\nPASS [${PROFILE}]: ${active.image}`);
      console.log(outputText().split("\n").slice(-10).join("\n"));
      emulator.destroy().finally(() => process.exit(0));
    }, 3000);
  }
}, 400);
