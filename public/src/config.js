// Boot profiles. `screen` renders the emulated VGA/framebuffer display;
// `serial` wires xterm.js to ttyS0.
//
// v86 has no long mode, so every image here must be a 32-bit x86 kernel.
// The stock `i.copy.sh/buildroot-bzimage68.bin` is 64-bit and hangs silently.
export const PROFILES = {
  "test-vga": {
    label: "v86 测试镜像 (i686 内核, VGA 控制台)",
    memory_size: 128 * 1024 * 1024,
    console: "screen",
    bios: { url: "/bios/seabios.bin" },
    vga_bios: { url: "/bios/vgabios.bin" },
    cdrom: { url: "/images/linux.iso" },
  },
  terminal: {
    label: "Debian i386 (串口终端)",
    memory_size: 256 * 1024 * 1024,
    console: "serial",
    bzimage: { url: "/images/debian-bzImage", async: false },
    initrd: { url: "/images/debian-initrd", async: false },
    cmdline: "console=ttyS0,115200 tsc=reliable mitigations=off",
  },
  desktop: {
    label: "Debian i386 桌面 (X11 + openbox)",
    memory_size: 512 * 1024 * 1024,
    console: "screen",
    bzimage: { url: "/images/debian-bzImage", async: false },
    initrd: { url: "/images/debian-initrd", async: false },
    cmdline: "console=ttyS0,115200 tsc=reliable mitigations=off browserlinux.desktop",
  },
};

const requested = new URLSearchParams(location.search).get("profile");
export const ACTIVE = PROFILES[requested] ?? PROFILES["test-vga"];
