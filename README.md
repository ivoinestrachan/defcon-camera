<div align="center">

# 📸 DEFCON&nbsp;/&nbsp;CAMERA

### Turn a DEF CON 34 badge into a camera — 1-bit photos, streamed off the badge to a live polaroid wall.

<!-- Drop a hero gif/screenshot at assets/hero.gif for the full look:
<img src="assets/hero.gif" width="720" alt="badge → gallery demo"> -->

<p align="center">
  <a href="https://defcon-polaroid.vercel.app"><img src="https://img.shields.io/badge/Live_Gallery-online-ff2d55?style=for-the-badge" alt="Live Gallery"></a>
  <a href="https://github.com/ivoinestrachan/defcon-polaroid"><img src="https://img.shields.io/badge/Gallery_code-defcon--polaroid-000000?style=for-the-badge&logo=github" alt="Gallery repo"></a>
  <img src="https://img.shields.io/badge/DEF_CON-34-000000?style=for-the-badge" alt="DEF CON 34">
  <img src="https://img.shields.io/badge/SoC-Baochip_bao1x-6e40c9?style=for-the-badge" alt="Baochip bao1x">
  <img src="https://img.shields.io/badge/OS-Xous-2b7489?style=for-the-badge" alt="Xous">
</p>

</div>

> 🎉 **Point the badge, press the camera button, and watch your shot develop onto the wall.** This
> repo is the **badge side** — the firmware edits that add a camera + a custom LED show, plus the
> host bridge that streams shots off the badge. The web gallery is a separate project →
> **[defcon-polaroid](https://github.com/ivoinestrachan/defcon-polaroid)** ([live wall](https://defcon-polaroid.vercel.app)).

* * *

## Overview

```
  badge firmware (this repo)        host bridge (this repo)     web gallery (defcon-polaroid)
┌───────────────────────────┐      ┌────────────┐              ┌──────────────────┐
│ bao-video service dumps a  │ USB  │ capture.py │   HTTPS      │ Next.js polaroid  │
│ frame: PHOTOSTART/PHOTO/… ├──────▶│ enhances + ├─────────────▶│ wall (linked out) │
│ + a custom LED show        │serial│ uploads PNG│              └──────────────────┘
└───────────────────────────┘      └────────────┘
```

| Path | What it is |
|------|-----------|
| [`firmware/`](./firmware) | Our badge firmware edits — camera capture + the LED show. |
| [`capture.py`](./capture.py) | Host bridge: reads a frame off serial, sharpens it, uploads it to the gallery. |
| [`deploy/`](./deploy) | launchd config to keep the bridge always-on (macOS). |
| **Gallery** | Lives at **[defcon-polaroid](https://github.com/ivoinestrachan/defcon-polaroid)** — deploy your own from there. |

* * *

## Step-by-step

### 1 · Get the firmware

Our edits in [`firmware/`](./firmware) are diffs on top of these upstream repos — clone them side by side:

```bash
git clone https://github.com/bunnie/dc34-console
git clone https://github.com/bunnie/dc34-api
git clone -b dev https://github.com/betrusted-io/xous-core
```

Then copy our modified files from [`firmware/dc34/`](./firmware/dc34) over the matching paths in the clones.

### 2 · Build

```bash
cd xous-core && cargo xtask install-toolkit          # installs the riscv32imac-unknown-xous-elf toolchain
cd ../dc34-console && cargo build --release \
  --target riscv32imac-unknown-xous-elf \
  --features board-baosec --features oem-baosec-lite --features bao1x --features utralib/bao1x \
  --features misc-test                               # enables the `test photo` command
cd ../xous-core && cargo xtask baosec-lite \
  ../dc34-console/target/riscv32imac-unknown-xous-elf/release/dc34-console~flash \
  ../dc34-vault/target/riscv32imac-unknown-xous-elf/release/dc34-vault
```

This produces `loader.uf2`, `xous.uf2`, and `apps.uf2`.

> ⚠️ `cargo xtask …` runs build tooling from the cloned `xous-core` repo — only run it if you trust
> the source you cloned.

### 3 · Enter boot mode & flash

Flashing goes through the badge's **boot mode** — the `boot1` ROM bootloader — which exposes a
`BAOCHIP` USB drive over the same USB-C port.

> 🔑 **Batteries must be OUT.** With batteries in, the PMIC stays latched and the badge reboots
> straight into normal Xous on every replug — you'll never reach boot mode.

**The "bootloader dance":**

1. **Remove the batteries** and unplug the badge. Wait ~10s until it's fully off (screen dark).
2. **Press and hold the button nearest the USB-C port** — hold firmly.
3. **Plug in the USB-C cable while still holding**, and keep holding ~4–5s.
4. A **`BAOCHIP`** drive mounts → you're in boot mode.

```bash
ls /Volumes/ | grep -i BAOCHIP    # mounted → BOOT MODE (ready to flash)
ls /dev/cu.usbmodem*              # present but no BAOCHIP → booted normal Xous (retry the dance)
```

Copy the UF2s and eject cleanly:

```bash
cp loader.uf2 xous.uf2 apps.uf2 /Volumes/BAOCHIP/   # first flash: copy all three
sync && diskutil eject BAOCHIP
```

On later updates, if the loader/kernel are unchanged you can copy just `apps.uf2`. To boot
**normally** afterwards: batteries in, plug USB, and **don't** hold any button. Entry can be finicky —
use a short **data** USB-C cable and retry. The ROM bootloader is always reachable, so a bad flash is
recoverable, **not** a brick.

### 4 · Run the bridge

Connect the badge over a **data** USB-C cable, then:

```bash
python3 -m pip install pyserial Pillow certifi
GALLERY_URL=https://your-gallery.vercel.app python3 capture.py
# waiting for the badge → connected on /dev/cu.usbmodemXXXX → listening
```

| Env var | Purpose |
|---------|---------|
| `GALLERY_URL` | Where to upload (default `http://localhost:3000`). Point it at your deployed gallery. |
| `BADGE_PORT` | Force a serial port instead of auto-detect. |
| `BADGE_UPLOAD_TOKEN` | Must match the gallery's `UPLOAD_TOKEN`, if set. |

Keep it always-on with the launchd config in [`deploy/`](./deploy) (edit the paths + `GALLERY_URL` first).

### 5 · Shoot 📷

Press the badge's **camera button** (or run `test photo` on the badge console). The LEDs freeze, a
frame streams over serial, `capture.py` uploads it, and it lands on your
**[gallery wall](https://defcon-polaroid.vercel.app)**.

* * *

## What we changed

**📷 Camera** — a new `GfxOpcode::CapturePhoto`, wired end to end:

- `ux-api/src/service/api.rs` — added the `CapturePhoto` opcode.
- `dc34-console/src/cmds/test.rs` — `test photo` sends `CapturePhoto` to the video service.
- `xous-core/services/bao-video/src/main.rs` — streams one settled frame (downsampled 2×) as
  `PHOTOSTART / PHOTO <hex> / PHOTOEND` over serial — exactly what `capture.py` parses.
- `bao1x-hal/src/gc2145/gc2145.rs` — GC2145 sensor bring-up.

**💡 Lights** — a custom LED show:

- `dc34-console/src/leds.rs` — registers the LED server and drives the `Lightgenes` generative animation.
- `dc34-console/src/motion.rs` — a dot races the ring, then it flashes, on repeat; a `MOTION_PAUSE`
  flag **freezes the LEDs during a capture** so glare doesn't pollute the frame.

## The gallery

The web wall is its own project: **[github.com/ivoinestrachan/defcon-polaroid](https://github.com/ivoinestrachan/defcon-polaroid)**
(live at **[defcon-polaroid.vercel.app](https://defcon-polaroid.vercel.app)**). It's a Next.js app that
stores shots in Cloudinary / Vercel Blob and renders the polaroid wall with lightbox, download, and a
curate/delete mode. Deploy your own and point `GALLERY_URL` at it.

## Acknowledgements

Built on the work of **[bunnie Huang](https://github.com/bunnie)** (the DC34 badge apps), the
**[betrusted-io](https://github.com/betrusted-io)** team (**Xous OS** + `bao1x` HAL), and
**[Baochip](https://github.com/baochip)**.

## License

The bridge (`capture.py`) and docs here are free to use. The firmware in [`firmware/`](./firmware) is
**derived from the upstream repos above and remains under their respective licenses** — check each
project before redistributing.

<div align="center">

*shot on a hacked Baochip badge* 🔋

</div>
