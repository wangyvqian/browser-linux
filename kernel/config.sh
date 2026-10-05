#!/bin/sh
# Kernel config tweaks. Starts from the upstream i386 defconfig and then turns
# the emulator-relevant drivers on as built-ins, because the rootfs ships as an
# initrd with no module tree to fall back on.
set -eu

conf() { ./scripts/config "$@"; }

# 32-bit, and not PAE: v86 emulates a Pentium-4 class CPU without PAE page
# tables, which is also why the Debian 686 (non-PAE) flavour was chosen first.
conf --disable CONFIG_X86_PAE
conf --enable CONFIG_X86_PSE36

# No modules at all. This is what lets the image drop /lib/modules.
conf --disable CONFIG_MODULES
conf --disable CONFIG_BLOCK_LEGACY_AUTOLOAD

# Boot straight to a serial line, no splash, no waiting for devices we lack.
conf --enable CONFIG_SERIAL_8250
conf --enable CONFIG_SERIAL_8250_CONSOLE
conf --enable CONFIG_HW_CONSOLE
conf --enable CONFIG_VT_CONSOLE
conf --disable CONFIG_LEGACY_PTYS

# Filesystems: initramfs is unpacked by the kernel, the writable layer is tmpfs.
conf --enable CONFIG_TMPFS
conf --enable CONFIG_DEVTMPFS
conf --enable CONFIG_DEVTMPFS_MOUNT
conf --enable CONFIG_9P_FS
conf --enable CONFIG_NET_9P_VIRTIO
conf --enable CONFIG_EXT4_FS
conf --enable CONFIG_FS_MBCACHE

# virtio block/consloe, and the IDE/ATA path v86 exposes for a raw disk.
conf --enable CONFIG_VIRTIO_PCI
conf --enable CONFIG_VIRTIO_BLK
conf --enable CONFIG_VIRTIO_NET
conf --enable CONFIG_VIRTIO_BALLOON
conf --enable CONFIG_PATA_ISAPNP
conf --enable CONFIG_ATA
conf --enable CONFIG_ATA_PIIX
conf --enable CONFIG_PATA_CS5520
conf --enable CONFIG_BLK_DEV_IDECD

# Framebuffer: needed the moment a desktop is rendered into the VGA screen.
conf --enable CONFIG_FB
conf --enable CONFIG_FB_VESA
conf --enable CONFIG_FB_BOOT_VESA_SUPPORT
conf --enable CONFIG_VGA_CONSOLE
conf --enable CONFIG_DUMMY_CONSOLE
conf --enable CONFIG_FB_DEFERRED_IO
conf --enable CONFIG_DRM
conf --enable CONFIG_FB_SIMPLE

# Input, so X gets a keyboard and the emulated PS/2 mouse.
conf --enable CONFIG_INPUT_MOUSEDEV
conf --enable CONFIG_INPUT_KEYBOARD
conf --enable CONFIG_SERIO_I8042
conf --enable CONFIG_MOUSE_PS2

# Strip what the emulator does not have.
for unwanted in \
  CONFIG_SND CONFIG_SOUND CONFIG_USB CONFIG_USB_SUPPORT CONFIG_BT CONFIG_WLAN \
  CONFIG_MD CONFIG_XFS_FS CONFIG_BTRFS_FS CONFIG_F2FS_FS CONFIG_NFS_FS \
  CONFIG_SCSI_MULTI_LUN CONFIG_MMC CONFIG_MEDIA_SUPPORT CONFIG_HWMON \
  CONFIG_INPUT_JOYSTICK CONFIG_PRINTER CONFIG_SERIAL_NONSTANDARD CONFIG_KVM
do
  conf --disable "$unwanted" 2>/dev/null || true
done

# Smaller, and nothing here needs debugging symbols.
conf --disable CONFIG_DEBUG_KERNEL
conf --disable CONFIG_DEBUG_INFO
conf --disable CONFIG_FRAME_POINTER
conf --disable CONFIG_KALLSYMS
conf --enable CONFIG_CC_OPTIMIZE_FOR_SIZE
conf --disable CONFIG_IKCONFIG_PROC
