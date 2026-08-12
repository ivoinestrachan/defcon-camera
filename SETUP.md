# DEFCON Camera — Setup Guide

Pull 1-bit photos straight off a hacked **Baochip DEF CON badge** and post them to a live
polaroid-style web gallery.

This guide takes you from a bare clone to badge → bridge → hosted gallery.

```
┌────────────┐   USB serial    ┌──────────────┐    HTTPS POST    ┌─────────────────┐
│  Badge     │  PHOTOSTART …   │  capture.py  │  PNG /api/photos │  Next.js gallery │
│  (camera)  │ ───────────────▶│  (host       │ ────────────────▶│  + Cloudinary /  │
│            │  PHOTO <hex> …  │   bridge)    │                  │    Vercel Blob   │
└────────────┘  PHOTOEND       └──────────────┘                  └─────────────────┘
```

The badge emits a grayscale frame over its serial console. `capture.py` reads it, cleans it
up, and uploads a PNG. The gallery lists every shot, newest first, at your deploy URL.

---

## What's in this repo

| Path | What it is |
|------|-----------|
| `capture.py` | Host-side bridge: reads the badge over USB serial, enhances the frame, uploads a PNG. |
| `app/` | Next.js 16 gallery (App Router). `page.tsx` renders the wall, `Gallery.tsx` is the client UI. |
| `app/api/photos/route.ts` | Photo API — `GET` lists, `POST` stores a PNG, `DELETE` removes one. |
| `lib/photos.ts` | Storage layer. Picks Cloudinary → Vercel Blob → local `public/photos`. |
| `deploy/com.ivoine.defcon-polaroid.plist` | macOS launchd config to keep the bridge always-on. |
| `.env.example` | Every environment variable, documented. |

> **Note on firmware:** the badge's camera firmware is **not** in this repo. This guide assumes
> the badge already runs the software that prints `PHOTOSTART / PHOTO <hex> / PHOTOEND` frames on
> its USB serial console and accepts a `test photo` command. `capture.py` is only the host bridge.

---

## Prerequisites

- **Node.js 18+** and npm (for the gallery web app)
- **Python 3.11+** (for the `capture.py` bridge)
- The **badge**, connected over USB, exposing a serial console
- (Optional, for a public gallery) a **Cloudinary** or **Vercel Blob** account, plus **Vercel** to host

---

## 1. Clone

```bash
git clone https://github.com/ivoinestrachan/defcon-camera.git
cd defcon-camera
```

---

## 2. Gallery web app

### Install & configure

```bash
npm install
cp .env.example .env.local
```

Pick **one** storage provider and fill in `.env.local`. The app checks them in this order and uses
the first that's configured:

1. **Cloudinary** — set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
   (from your Cloudinary dashboard).
2. **Vercel Blob** — set `BLOB_READ_WRITE_TOKEN` (Vercel → Storage → create a Blob store).
3. **Neither** — the app falls back to reading/writing `public/photos/` on the local disk. Great for
   trying it out, but this **won't work on Vercel** (its filesystem is read-only).

### Run it locally

```bash
npm run dev
```

Open <http://localhost:3000>. With no photos yet you'll see an empty-state prompt.

### Deploy (Vercel)

```bash
npm run build        # sanity-check the production build
```

Push to GitHub and import the repo at [vercel.com/new](https://vercel.com/new), **or** run `vercel`.
Then add the same environment variables under **Vercel → Settings → Environment Variables**
(use a real storage provider — the local-disk fallback does not work in production).

Your gallery is now live at something like `https://your-project.vercel.app`.

---

## 3. The badge bridge (`capture.py`)

### Install Python deps

```bash
python3 -m pip install pyserial Pillow certifi
```

- **pyserial** — talks to the badge over USB serial
- **Pillow** — crops, upscales, and sharpens each frame
- **certifi** — CA bundle so HTTPS uploads to your hosted gallery don't fail with
  `CERTIFICATE_VERIFY_FAILED` (python.org's Python ships without a system CA bundle)

### Point it at your gallery

```bash
export GALLERY_URL="https://your-project.vercel.app"   # omit to use http://localhost:3000
```

### Run it

**Listen mode** (recommended) — leave it running; every time you press the badge's camera button
(or run a capture), the photo auto-saves and uploads:

```bash
python3 capture.py
# waiting for the badge — plug it into USB (Ctrl+C to stop)...
# connected on /dev/cu.usbmodemXXXX -> uploading to https://your-project.vercel.app
# listening — press the badge's camera button to take a photo
```

**One-shot mode** — trigger a single capture over serial (sends the `test photo` command) and exit:

```bash
python3 capture.py --snap
```

It waits for the badge to appear on USB (survives being started before the badge is plugged in),
and **auto-reconnects** if the USB-CDC port glitches mid-session. Refresh the gallery to see the shot.

### Finding the serial port

`capture.py` auto-detects the port by globbing `/dev/cu.usbmodemS5NA27*`, then any
`/dev/cu.usbmodem*` (macOS naming). If your badge shows up elsewhere — or you're on **Linux**
(`/dev/ttyACM0`, `/dev/ttyUSB0`) — set it explicitly:

```bash
export BADGE_PORT="/dev/ttyACM0"
```

Find your device with `ls /dev/cu.usbmodem*` (macOS) or `ls /dev/ttyACM* /dev/ttyUSB*` (Linux).

---

## 4. Environment variables

### Gallery (`.env.local` / Vercel)

| Variable | Required? | Purpose |
|----------|-----------|---------|
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | one provider | Cloudinary storage (option 1) |
| `BLOB_READ_WRITE_TOKEN` | one provider | Vercel Blob storage (option 2) |
| `UPLOAD_TOKEN` | optional | Shared secret. If set, uploads must send a matching `x-upload-token` header, so randos can't spam your gallery. |
| `ADMIN_TOKEN` | optional | Gates photo deletion. If set, the "Curate" delete button prompts for it. Set it in production so only you can remove shots. |
| `CLOUDINARY_DISPLAY_TX` | optional | On-the-fly display transform. Default `e_gen_restore,e_improve,e_sharpen:40,q_auto` (AI restore). Set to `""` to show raw uploads, or `e_upscale` for AI super-res. Only affects display, not the download. |

### Bridge (`capture.py`)

| Variable | Required? | Purpose |
|----------|-----------|---------|
| `GALLERY_URL` | optional | Where to upload. Defaults to `http://localhost:3000`. |
| `BADGE_PORT` | optional | Force a specific serial port instead of auto-detecting. |
| `BADGE_UPLOAD_TOKEN` | optional | Must match the gallery's `UPLOAD_TOKEN` when that's set. |
| `BADGE_DEBUG_LOG` | optional | If set to a file path, tees every raw serial line there (handy for debugging). |

> If the gallery is unreachable, `capture.py` falls back to saving the PNG locally in
> `public/photos/` so you never lose a shot.

---

## 5. Keep the bridge always-on (macOS, optional)

`deploy/com.ivoine.defcon-polaroid.plist` runs `capture.py` at login and restarts it if it ever
exits, so the badge just works whenever it's plugged in.

**Before installing, edit the plist** to match your machine — the paths are hard-coded:

- the `python3` path (`ProgramArguments[0]`)
- the `capture.py` path and `WorkingDirectory`
- your `GALLERY_URL`
- the `StandardOutPath` / `StandardErrorPath` log path

Then:

```bash
cp deploy/com.ivoine.defcon-polaroid.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.ivoine.defcon-polaroid.plist

# check it's running and watch the log
launchctl list | grep polaroid
tail -f capture.log
```

To stop it:

```bash
launchctl unload ~/Library/LaunchAgents/com.ivoine.defcon-polaroid.plist
```

> **Heads up:** only one process can own the serial port. If the launchd bridge is running, don't
> also start `python3 capture.py --snap` by hand — unload the agent first, then reload it after.

---

## 6. Using the gallery

- **View** — tap any polaroid to open it full-size in a lightbox (Esc or click outside to close).
- **Download** — the ↓ button saves the full-resolution PNG (not the display-enhanced version).
- **Curate** — toggle "Curate" to reveal ✕ delete buttons. If `ADMIN_TOKEN` is set, you'll be
  prompted for it once; it's remembered in the browser.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `waiting for the badge — plug it into USB` | The bridge is up and healthy; just connect the badge. It'll grab the port automatically. |
| `no frame received — camera missed its bring-up` (`--snap`) | Run it again — the camera occasionally misses its startup. |
| `CERTIFICATE_VERIFY_FAILED` on upload | `pip install certifi` — `capture.py` uses it automatically once installed. |
| Uploads return `401 unauthorized` | `UPLOAD_TOKEN` is set on the gallery but `BADGE_UPLOAD_TOKEN` doesn't match (or isn't set). |
| Port keeps disconnecting | Normal USB-CDC glitching — the bridge auto-reconnects. If it's constant, try a different cable/port. |
| Photos save locally but never appear online | `GALLERY_URL` is unset/wrong, or the gallery has no storage provider configured (it's on the local-disk fallback). |
| Gallery empty on Vercel | You're relying on the local-disk fallback, which is read-only in production — configure Cloudinary or Vercel Blob. |
| Wrong serial port picked | Set `BADGE_PORT` explicitly. |

---

## How a frame becomes a photo

1. Badge prints `PHOTOSTART <width> <height>`, then rows of `PHOTO <hex>`, then `PHOTOEND`.
2. `capture.py` assembles the grayscale bytes into an image.
3. **Enhance:** center-crop to square → `autocontrast` → upscale to ≥512px with LANCZOS →
   unsharp-mask (heavier on tiny frames). It never downscales a large capture.
4. `POST` the PNG to `/api/photos`.
5. The gallery stores it (Cloudinary/Blob/local) and shows it, newest first, with an on-the-fly
   display transform.
