import { V86 } from "/vendor/libv86.mjs";
import { ACTIVE, PROFILES } from "/src/config.js";

const el = (id) => document.getElementById(id);
const ui = {
  boot: el("boot"),
  bootTitle: el("boot-title"),
  progress: el("progress"),
  progressFill: el("progress-fill"),
  fileLabel: el("file-label"),
  status: el("status"),
  metrics: el("metrics"),
  terminal: el("terminal"),
  screen: el("screen"),
  btnBoot: el("btn-boot"),
  btnRun: el("btn-run"),
  btnReset: el("btn-reset"),
};

ui.bootTitle.textContent = ACTIVE.label;

function setStatus(text, kind = "") {
  ui.status.textContent = text;
  ui.status.dataset.kind = kind;
}

const term = new window.Terminal({
  cursorBlink: true,
  fontSize: 14,
  fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
  scrollback: 8000,
  theme: { background: "#0b0f14", foreground: "#d5dee8" },
});
term.open(ui.terminal);

function sizeTerminal() {
  const cols = Math.max(20, Math.floor(ui.terminal.clientWidth / 8.6));
  const rows = Math.max(6, Math.floor(ui.terminal.clientHeight / 19));
  if (ui.terminal.classList.contains("hidden")) return;
  term.resize(cols, rows);
}
new ResizeObserver(sizeTerminal).observe(ui.terminal);

let emulator = null;
let counters = { ipc: 0, at: 0 };

setInterval(() => {
  if (!emulator || !emulator.is_running()) return;
  const ipc = emulator.get_instruction_counter();
  const now = performance.now();
  const mips = ((ipc - counters.ipc) / (now - counters.at)) * 1000 / 1e6;
  counters = { ipc, at: now };
  ui.metrics.textContent = `${mips.toFixed(1)} MIPS`;
}, 1000);

ui.btnBoot.addEventListener("click", () => {
  ui.boot.hidden = true;
  boot();
});

ui.btnRun.addEventListener("click", async () => {
  if (!emulator) return;
  if (emulator.is_running()) {
    await emulator.stop();
    ui.btnRun.textContent = "继续";
    setStatus("已暂停", "warn");
  } else {
    await emulator.run();
    ui.btnRun.textContent = "暂停";
    setStatus("运行中", "ok");
    focusConsole();
  }
});

ui.btnReset.addEventListener("click", async () => {
  if (!emulator) return;
  await emulator.destroy();
  emulator = null;
  ui.btnReset.disabled = true;
  ui.btnRun.disabled = true;
  ui.metrics.textContent = "";
  term.clear();
  ui.screen.hidden = true;
  ui.terminal.classList.remove("hidden");
  ui.boot.hidden = false;
  setStatus("已停止");
});

function focusConsole() {
  if (ACTIVE.console === "screen") ui.screen.focus();
  else term.focus();
}

async function boot() {
  const useScreen = ACTIVE.console === "screen";
  ui.terminal.classList.toggle("hidden", useScreen);
  ui.screen.hidden = !useScreen;
  setStatus("下载镜像");

  const options = {
    wasm_path: "/vendor/v86.wasm",
    memory_size: ACTIVE.memory_size,
    autostart: true,
    disable_speaker: true,
    ...(ACTIVE.bzimage ? { bzimage: ACTIVE.bzimage } : {}),
    ...(ACTIVE.cdrom ? { cdrom: ACTIVE.cdrom } : {}),
    ...(ACTIVE.bios ? { bios: ACTIVE.bios } : {}),
    ...(ACTIVE.vga_bios ? { vga_bios: ACTIVE.vga_bios } : {}),
    ...(ACTIVE.filesystem ? { filesystem: ACTIVE.filesystem } : {}),
    ...(ACTIVE.cmdline ? { cmdline: ACTIVE.cmdline } : {}),
    ...(useScreen ? { screen: { container: ui.screen } } : {}),
  };

  emulator = new V86(options);

  if (!useScreen) {
    term.onData((data) => emulator.serial0_send(data));
    emulator.add_listener("serial0-output-byte", (byte) => term.write(Uint8Array.of(byte)));
  }

  emulator.add_listener("download-progress", (p) => {
    ui.fileLabel.textContent = p.file_name;
    if (p.lengthComputable) {
      const pct = (p.loaded / p.total) * 100;
      ui.progressFill.style.width = `${pct.toFixed(1)}%`;
      setStatus(`下载 ${pct.toFixed(0)}%`);
    }
  });

  emulator.add_listener("download-error", (p) => setStatus(`下载失败: ${p.file_name}`, "bad"));

  emulator.add_listener("emulator-started", () => {
    ui.progress.hidden = true;
    ui.fileLabel.textContent = "";
    setStatus("启动中", "ok");
    ui.btnRun.disabled = false;
    ui.btnReset.disabled = false;
    ui.btnRun.textContent = "暂停";
    counters = { ipc: emulator.get_instruction_counter(), at: performance.now() };
    focusConsole();
  });

  try {
    await emulator.run();
  } catch (error) {
    setStatus(`启动失败: ${error.message}`, "bad");
    console.error(error);
  }
}

window.browserLinux = { get emulator() { return emulator; }, term, profiles: PROFILES };
