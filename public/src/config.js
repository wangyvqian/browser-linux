// Boot profiles. `screen` renders the emulated VGA/framebuffer display;
// `serial` wires xterm.js to ttyS0.
//
// v86 has no long mode, so every image here must be a 32-bit x86 kernel.
// The stock `i.copy.sh/buildroot-bzimage68.bin` is 64-bit and hangs silently.

// Project Pages sites live under /<repo>/, so nothing here may be rooted at /.
export const BASE = location.pathname.replace(/\/[^/?]*$/, "/");
const at = (p) => `${BASE}${p}`;

export const PROFILES = {
  "test-vga": {
    label: "v86 测试镜像 (i686 内核, VGA 控制台)",
    memory_size: 128 * 1024 * 1024,
    console: "screen",
    bios: { url: at("bios/seabios.bin") },
    vga_bios: { url: at("bios/vgabios.bin") },
    cdrom: { url: at("images/linux.iso") },
  },
  terminal: {
    label: "Debian i386 (串口终端)",
    memory_size: 256 * 1024 * 1024,
    console: "serial",
    bios: { url: at("bios/seabios.bin") },
    vga_bios: { url: at("bios/vgabios.bin") },
    bzimage: { url: at("images/debian-bzImage"), async: false },
    initrd: { url: at("images/debian-initrd"), async: false },
    cmdline: "console=ttyS0,115200 noapic nolapic tsc=reliable mitigations=off",
  },
  desktop: {
    label: "Debian i386 桌面 (X11 + openbox)",
    memory_size: 512 * 1024 * 1024,
    console: "screen",
    bios: { url: at("bios/seabios.bin") },
    vga_bios: { url: at("bios/vgabios.bin") },
    bzimage: { url: at("images/debian-bzImage"), async: false },
    // A real disk, not an initrd: it is what makes the desktop persist, and
    // chunking keeps every request small enough for static hosting.
    hda: {
      url: at("images/desktop-chunks/chunk.zst"),
      async: true,
      use_parts: true,
      fixed_chunk_size: 128 * 1024,
      size: 2 * 1024 * 1024 * 1024,
    },
    cmdline: "root=/dev/sda rw console=ttyS0,115200 noapic nolapic tsc=reliable mitigations=off",
  },
};

const requested = new URLSearchParams(location.search).get("profile");
export const ACTIVE = PROFILES[requested] ?? PROFILES["test-vga"];
