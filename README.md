<div align="center">

# 📸 DEFCON&nbsp;/&nbsp;CAMERA

### Turn a DEF CON 34 badge into a camera — 1-bit photos, streamed off the badge to a live polaroid wall.

<img src="https://placehold.co/1000x360/0d0f1e/ff2d55/png?text=HERO+PHOTO" alt="hero photo — replace me" width="720" /><br/>
<sub>📸 <b>Shot to take:</b> the badge in-hand with its LED ring lit + a few 1-bit prints fanned beside it (a short gif of a photo developing on the wall is even better).</sub>
<!-- Replace the src above with assets/hero.png or assets/hero.gif once you've taken it. -->

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

```mermaid
flowchart LR
    subgraph CAM ["🎥 defcon-camera · this repo"]
        direction LR
        A("📷 <b>Badge firmware</b><br/>bao-video dumps a frame<br/>PHOTOSTART · PHOTO · PHOTOEND<br/>+ a custom LED show")
        B("🔌 <b>Host bridge</b><br/>capture.py<br/>enhances + uploads PNG")
        A -->|"USB · serial"| B
    end
    B ==>|"HTTPS"| C("🖼️ <b>Web gallery</b><br/>Next.js polaroid wall<br/>defcon-polaroid ↗")

    classDef badge fill:#1b1030,stroke:#6e40c9,stroke-width:2px,color:#e9ebf6
    classDef bridge fill:#101a2e,stroke:#5aa2ff,stroke-width:2px,color:#e9ebf6
    classDef gallery fill:#2a0f1a,stroke:#ff2d55,stroke-width:2px,color:#e9ebf6
    class A badge
    class B bridge
    class C gallery
    style CAM fill:#0d0f1e,stroke:#2b2f45,color:#c3c8dd
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

<div align="center">
<img src="https://placehold.co/900x300/0d0f1e/5aa2ff/png?text=BOOT+MODE" alt="boot mode photo — replace me" width="640" /><br/>
<sub>📸 <b>Shot to take:</b> the <code>BAOCHIP</code> drive mounted on your desktop with the badge plugged in — proof it's in boot mode.</sub>
</div>
<!-- Replace the src with assets/boot-mode.png -->

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

<div align="center">
<img src="https://placehold.co/900x300/0d0f1e/39d98a/png?text=SAMPLE+SHOTS" alt="sample captures — replace me" width="640" /><br/>
<sub>📸 <b>Shot to take:</b> a grid of a few 1-bit photos the badge actually took — screenshot the gallery wall, or drop in the PNGs.</sub>
</div>
<!-- Replace the src with assets/samples.png -->

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

<div align="center">
<img src="https://placehold.co/900x300/0d0f1e/ff9e40/png?text=LED+RING" alt="LED show photo — replace me" width="640" /><br/>
<sub>📸 <b>Shot to take:</b> the LED ring mid-show — the racing dot / rainbow chase (a gif is even better).</sub>
</div>
<!-- Replace the src with assets/leds.gif or assets/leds.png -->

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
