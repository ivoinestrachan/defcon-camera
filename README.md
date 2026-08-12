<div align="center">

# 📸 DEFCON&nbsp;/&nbsp;CAMERA

### 1-bit photos, pulled straight off a hacked DEF CON 34 badge — developed onto a live polaroid wall.

<!-- Drop a hero gif/screenshot at assets/hero.gif for the full look:
<img src="assets/hero.gif" width="720" alt="badge → gallery demo"> -->

<p align="center">
  <a href="https://defcon-polaroid.vercel.app"><img src="https://img.shields.io/badge/Live_Gallery-online-ff2d55?style=for-the-badge" alt="Live Gallery"></a>
  <a href="#the-badge-firmware"><img src="https://img.shields.io/badge/DEF_CON-34-000000?style=for-the-badge" alt="DEF CON 34"></a>
  <img src="https://img.shields.io/badge/SoC-Baochip_bao1x-6e40c9?style=for-the-badge" alt="Baochip bao1x">
  <img src="https://img.shields.io/badge/OS-Xous-2b7489?style=for-the-badge" alt="Xous">
  <img src="https://img.shields.io/badge/Gallery-Next.js_16-000000?style=for-the-badge&logo=next.js" alt="Next.js 16">
</p>

</div>

> 🎉 **Point the badge, press the camera button, and watch your shot develop onto the wall.** The
> badge's on-board camera dumps a frame over USB serial, a host bridge cleans it up, and it appears
> on a hosted gallery in seconds.

* * *

## Overview

**DEFCON/CAMERA** turns the DEF CON 34 badge into a wireless-ish polaroid camera. Three pieces:

```
  badge firmware              host bridge            web gallery
┌───────────────────────┐   ┌────────────┐        ┌──────────────────┐
│ bao-video service      │   │ capture.py │        │ Next.js gallery   │
│ dumps a frame as       │USB│ enhances + │ HTTPS  │ + Cloudinary/Blob │
│ PHOTOSTART/PHOTO/PHOTOEND├─▶│ uploads PNG├───────▶│ polaroid wall     │
│ + a custom LED show    │ser└────────────┘        └──────────────────┘
└───────────────────────┘
```

1. **Badge firmware** — we added a camera-capture command and a custom LED show to the badge.
2. **Host bridge** ([`capture.py`](./capture.py)) — reads the frame off serial, sharpens it, uploads it.
3. **Gallery** ([`app/`](./app)) — a live polaroid wall with lightbox, download, and curate/delete.

| Path | What it is |
|------|-----------|
| [`firmware/`](./firmware) | Our badge firmware edits (camera + lights) — see [below](#the-badge-firmware). |
| [`capture.py`](./capture.py) | Host bridge: serial → enhance → upload. |
| [`app/`](./app) · [`lib/photos.ts`](./lib/photos.ts) | Next.js gallery + storage layer (Cloudinary → Vercel Blob → local). |
| [`app/api/photos/route.ts`](./app/api/photos/route.ts) | Photo API — `GET` list, `POST` upload, `DELETE` curate. |
| [`deploy/`](./deploy) | launchd config to keep the bridge always-on (macOS). |

* * *

## Quick Start in 5 Minutes

**1. Gallery** — run the web app (pick one storage provider in `.env.local`; falls back to local disk):

```bash
npm install
cp .env.example .env.local     # fill in Cloudinary *or* Vercel Blob creds
npm run dev                     # http://localhost:3000
```

Deploy it on [Vercel](https://vercel.com/new) and set the same env vars there for a public wall.

**2. Bridge** — connect the badge over a **data** USB-C cable, then:

```bash
python3 -m pip install pyserial Pillow certifi
GALLERY_URL=https://your-gallery.vercel.app python3 capture.py
# waiting for the badge → connected on /dev/cu.usbmodemXXXX → listening
```

**3. Shoot** — press the badge's **camera button** (or run `test photo` on the badge console). The
LEDs freeze, a frame streams over serial, and your photo lands on the wall. 📷

<details>
<summary><b>Environment variables</b></summary>

| Variable | Side | Purpose |
|----------|------|---------|
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | gallery | Cloudinary storage (option 1) |
| `BLOB_READ_WRITE_TOKEN` | gallery | Vercel Blob storage (option 2) |
| `UPLOAD_TOKEN` | gallery | Shared secret; uploads must send matching `x-upload-token` |
| `ADMIN_TOKEN` | gallery | Gates photo deletion ("Curate" mode) |
| `CLOUDINARY_DISPLAY_TX` | gallery | On-the-fly display transform (default: AI restore) |
| `GALLERY_URL` | bridge | Where `capture.py` uploads (default `http://localhost:3000`) |
| `BADGE_PORT` | bridge | Force a serial port instead of auto-detect |
| `BADGE_UPLOAD_TOKEN` | bridge | Must match the gallery's `UPLOAD_TOKEN` |

</details>

* * *

## The Badge Firmware

The badge is bunnie's **DEF CON 34 Baochip `bao1x`** board (RISC-V `riscv32imac`) running
**[Xous OS](https://github.com/betrusted-io/xous-core)**, with an on-board **GC2145** camera and an
LED ring. Our edits live in [`firmware/`](./firmware) and are diffs on top of these upstream repos:

```bash
git clone https://github.com/bunnie/dc34-console
git clone https://github.com/bunnie/dc34-api
git clone -b dev https://github.com/betrusted-io/xous-core
```

### What we changed

**📷 Camera** — a new `GfxOpcode::CapturePhoto` wired end to end:

- `xous-core/libs/ux-api/src/service/api.rs` — added the `CapturePhoto` opcode.
- `dc34-console/src/cmds/test.rs` — `test photo` sends `CapturePhoto` to the video service.
- `xous-core/services/bao-video/src/main.rs` — on capture, streams one settled frame (downsampled 2×)
  as `PHOTOSTART / PHOTO <hex> / PHOTOEND` over the serial log — exactly what `capture.py` parses.
- `xous-core/libs/bao1x-hal/src/gc2145/gc2145.rs` — GC2145 sensor bring-up.

**💡 Lights** — a custom LED show:

- `dc34-console/src/leds.rs` — registers the LED server and drives the `Lightgenes` generative animation.
- `dc34-console/src/motion.rs` — a dot races the ring, then the whole ring flashes, on repeat; a
  `MOTION_PAUSE` flag **freezes the LEDs during a capture** so glare doesn't pollute the frame.

### Build & flash

```bash
cd xous-core && cargo xtask install-toolkit         # installs the riscv32imac-unknown-xous-elf toolchain
cd ../dc34-console && cargo build --release \
  --target riscv32imac-unknown-xous-elf \
  --features board-baosec --features oem-baosec-lite --features bao1x --features utralib/bao1x \
  --features misc-test                              # enables the `test photo` command
cd ../xous-core && cargo xtask baosec-lite \
  ../dc34-console/target/riscv32imac-unknown-xous-elf/release/dc34-console~flash \
  ../dc34-vault/target/riscv32imac-unknown-xous-elf/release/dc34-vault
```

This produces `loader.uf2`, `xous.uf2`, and `apps.uf2`. Flashing goes through the badge's **boot
mode** — the `boot1` ROM bootloader — which exposes a `BAOCHIP` USB drive over the same USB-C port.

> ⚠️ `cargo xtask …` runs build tooling from the cloned `xous-core` repo — only run it if you trust
> the source you cloned.

### Entering boot mode (the "bootloader dance")

> 🔑 **Batteries must be OUT.** With the batteries in, the PMIC stays latched and the badge reboots
> straight into normal Xous on every replug — you'll never reach boot mode.

1. **Remove the batteries** and unplug the badge. Wait ~10s until it's fully off (screen dark).
2. **Press and hold the button nearest the USB-C port** — hold firmly.
3. **Plug in the USB-C cable while still holding**, and keep holding ~4–5s.
4. A **`BAOCHIP`** drive mounts → you're in boot mode.

Tell which mode you're in:

```bash
ls /Volumes/ | grep -i BAOCHIP   # mounted  → BOOT MODE (ready to flash)
ls /dev/cu.usbmodem*             # present but no BAOCHIP → booted normal Xous (retry the dance)
```

Entry can be finicky — use a short **data** USB-C cable and retry if `BAOCHIP` doesn't appear. The
ROM bootloader is always reachable even if firmware wedges, so a bad flash is recoverable, **not** a
brick. (Details: `xous-core/bao1x-boot/BOOTCHAIN.md`.)

### Flash

With `BAOCHIP` mounted, copy the UF2s and eject cleanly:

```bash
cp loader.uf2 xous.uf2 apps.uf2 /Volumes/BAOCHIP/   # first flash: copy all three
sync && diskutil eject BAOCHIP
```

On later updates, if the loader/kernel are unchanged you can copy just `apps.uf2`. To boot
**normally** afterwards: batteries in, plug USB, and **don't** hold any button.

* * *

## Acknowledgements

Built on the incredible work of **[bunnie Huang](https://github.com/bunnie)** (the DC34 badge apps),
the **[betrusted-io](https://github.com/betrusted-io)** team (**Xous OS** + `bao1x` HAL), and
**[Baochip](https://github.com/baochip)**. Gallery powered by
[Next.js](https://nextjs.org), [Cloudinary](https://cloudinary.com), and [Vercel](https://vercel.com).

The firmware in [`firmware/`](./firmware) is derived from the upstream repos above and remains under
their respective licenses.

## License

The gallery + bridge in this repo are released under the [MIT License](./LICENSE). Firmware edits
inherit the licenses of their upstream projects (see above).

<div align="center">

*shot on a hacked Baochip badge* 🔋

</div>
