// Boot profiles. `screen` renders the emulated VGA/framebuffer display;
// `serial` wires xterm.js to ttyS0.
//
// v86 has no long mode, so every image here must be a 32-bit x86 kernel.
// One disk backs both Debian profiles; the desktop is opt-in through the
// kernel cmdline so the terminal does not pay for X.

// Project Pages sites live under /<repo>/, so nothing here may be rooted at /.
export const BASE = location.pathname.replace(/\/[^/?]*$/, "/");
const at = (p) => `${BASE}${p}`;

// A real disk, not an initrd: it is what makes the guest persist, and chunking
// keeps every request small enough for static hosting.
const common = {
  bios: { url: at("bios/seabios.bin") },
  vga_bios: { url: at("bios/vgabios.bin") },
  bzimage: { url: at("images/debian-bzImage"), async: false },
  hda: {
    url: at("images/guest-chunks/chunk.zst"),
    async: true,
    use_parts: true,
    // 1MB, not v86's 128KB example default: booting touches thousands of
    // chunks and the cost is one HTTPS round trip each, not the bytes.
    fixed_chunk_size: 1024 * 1024,
    size: 2 * 1024 * 1024 * 1024,
  },
};

export const PROFILES = {
  desktop: {
    label: "Debian i386 桌面 (X11 + openbox)",
    memory_size: 512 * 1024 * 1024,
    console: "screen",
    ...common,
    // tty0 first so the screen shows boot progress instead of staying black.
    cmdline: "root=/dev/sda rw console=tty0 console=ttyS0,115200 noapic nolapic tsc=reliable mitigations=off browserlinux.desktop",
  },
  terminal: {
    label: "Debian i386 (串口终端)",
    memory_size: 256 * 1024 * 1024,
    console: "serial",
    ...common,
    cmdline: "root=/dev/sda rw console=ttyS0,115200 noapic nolapic tsc=reliable mitigations=off",
  },
  "test-vga": {
    label: "v86 测试镜像 (i686 内核, VGA 控制台)",
    memory_size: 128 * 1024 * 1024,
    console: "screen",
    bios: { url: at("bios/seabios.bin") },
    vga_bios: { url: at("bios/vgabios.bin") },
    cdrom: { url: at("images/linux.iso") },
  },
};

const requested = new URLSearchParams(location.search).get("profile");
export const ACTIVE = PROFILES[requested] ?? PROFILES.desktop;
