import { V86 } from "../vendor/libv86.mjs";
import { ACTIVE, BASE, PROFILES } from "./config.js";

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

const select = el("profile");
for (const [key, profile] of Object.entries(PROFILES)) {
  const option = document.createElement("option");
  option.value = key;
  option.textContent = profile.label;
  select.append(option);
}
select.value = new URLSearchParams(location.search).get("profile") ?? "desktop";
select.addEventListener("change", () => location.assign(`${location.pathname}?profile=${select.value}`));

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

  // Everything in the profile except our own UI fields is a v86 option.
  const images = { ...ACTIVE };
  delete images.label;
  delete images.console;
  delete images.memory_size;

  emulator = new V86({
    wasm_path: `${BASE}vendor/v86.wasm`,
    memory_size: ACTIVE.memory_size,
    autostart: true,
    disable_speaker: true,
    ...images,
    ...(useScreen ? { screen: { container: ui.screen } } : {}),
  });

  if (useScreen) {
    // The guest only sees a relative pointer once the browser hands it over.
    ui.screen.addEventListener("click", () => emulator.lock_mouse());

    // The screen shows the framebuffer, so without this mirror a guest that
    // logs only to ttyS0 looks identical to a guest that has hung.
    const panel = el("bootlog-panel");
    const log = el("bootlog");
    panel.hidden = false;
    panel.open = true;
    emulator.add_listener("serial0-output-byte", (byte) => {
      log.textContent += String.fromCharCode(byte);
      if (log.textContent.length > 120000) log.textContent = log.textContent.slice(-60000);
      // The <pre> only scrolls once it is actually overflowing; the panel
      // itself can also be the scroller depending on how much is open.
      log.scrollTop = log.scrollHeight;
      panel.scrollTop = panel.scrollHeight;
    });
  } else {
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
