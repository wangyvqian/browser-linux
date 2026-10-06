import { V86 } from "../vendor/libv86.mjs";
import { ACTIVE, BASE, PROFILES } from "./config.js";

// v86 drives its CPU loop from requestAnimationFrame, and browsers stop feeding
// frames to tabs they consider hidden or occluded — the guest then crawls at a
// fraction of a MIPS and looks hung. A timer keeps the loop running when the
// user switches away, which is the whole point of a machine you leave open.
window.requestAnimationFrame = (callback) =>
  setTimeout(() => callback(performance.now()), 0);
window.cancelAnimationFrame = (handle) => clearTimeout(handle);

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

const fit = new window.FitAddon.FitAddon();
term.loadAddon(fit);

function sizeTerminal() {
  if (ui.terminal.classList.contains("hidden")) return;
  try {
    fit.fit();
  } catch {
    // The container can be measured as zero during a layout flip; the next
    // resize event will get it.
  }
}
new ResizeObserver(sizeTerminal).observe(ui.terminal);
window.addEventListener("resize", sizeTerminal);

let emulator = null;
let counters = { ipc: 0, at: 0 };

setInterval(() => {
  if (!emulator || !emulator.is_running()) return;
  const ipc = emulator.get_instruction_counter();
  const now = performance.now();
  const mips = ((ipc - counters.ipc) / (now - counters.at)) * 1000 / 1e6;
  counters = { ipc, at: now };
  // A guest parked at a prompt is idle, not throttled — only blame the browser
  // when it really has the page hidden.
  const note = mips >= 5 ? "" : document.hidden ? " · 页面在后台" : " · 空闲或被限速";
  ui.metrics.textContent = `${mips.toFixed(1)} MIPS${note}`;
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
    ...(useScreen
      ? {
          // Graphical text mode puts the console on a canvas, which the browser
          // can then scale to the window; the DOM text renderer cannot.
          screen: { container: ui.screen, use_graphical_text: true },
        }
      : {}),
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
    const summary = panel.querySelector("summary");
    let lastByteAt = Date.now();
    let pendingBytes = "";
    emulator.add_listener("serial0-output-byte", (byte) => {
      lastByteAt = Date.now();
      pendingBytes += String.fromCharCode(byte);
    });
    // One DOM write per flush: a byte at a time re-lays out the panel hundreds
    // of times a second and is what makes the view feel frozen.
    setInterval(() => {
      if (!pendingBytes) return;
      log.textContent += pendingBytes;
      pendingBytes = "";
      if (log.textContent.length > 120000) log.textContent = log.textContent.slice(-60000);
      log.scrollTop = log.scrollHeight;
    }, 120);
    // A quiet serial line and a dead page look identical from the outside.
    setInterval(() => {
      const idle = Math.round((Date.now() - lastByteAt) / 1000);
      summary.textContent = `启动日志(串口镜像) · ${idle < 3 ? "正在输出" : `已静默 ${idle}s`}`;
    }, 1000);
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
    sizeTerminal();
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
