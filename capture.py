#!/usr/bin/env python3
"""Save badge photos into the gallery.

  python capture.py           # LISTEN: press the badge's camera button, photos auto-save (Ctrl+C to stop)
  python capture.py --snap    # trigger one capture over serial and save it

Reads the frame the video service dumps to the serial log
(PHOTOSTART / PHOTO <hex> / PHOTOEND) and writes a PNG into public/photos/.
Resilient to the USB-CDC port glitching (it reconnects).
"""
import glob
import io
import json
import os
import re
import ssl
import sys
import time
import urllib.request

import serial
from PIL import Image, ImageFilter, ImageOps

# python.org's Python ships with no system CA bundle, so HTTPS to the hosted API fails with
# CERTIFICATE_VERIFY_FAILED. Use certifi's bundle when available so uploads to Vercel work.
try:
    import certifi

    _SSL_CTX: "ssl.SSLContext | None" = ssl.create_default_context(cafile=certifi.where())
except Exception:  # noqa: BLE001
    _SSL_CTX = ssl.create_default_context()

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public", "photos")
GALLERY_URL = os.environ.get("GALLERY_URL", "http://localhost:3000").rstrip("/")
DEBUG_LOG = os.environ.get("BADGE_DEBUG_LOG")  # if set, tee every serial line here
RE_START = re.compile(r"PHOTOSTART (\d+) (\d+)")
RE_ROW = re.compile(r"PHOTO ([0-9a-fA-F]{8,})")


def _debug(line: str) -> None:
    if not DEBUG_LOG:
        return
    try:
        with open(DEBUG_LOG, "a") as fh:
            fh.write(line + "\n")
    except Exception:  # noqa: BLE001
        pass


def find_port() -> str:
    env = os.environ.get("BADGE_PORT")
    if env:
        return env
    for pat in ("/dev/cu.usbmodemS5NA27*", "/dev/cu.usbmodem*"):
        hits = sorted(glob.glob(pat))
        if hits:
            return hits[0]
    return "/dev/cu.usbmodemS5NA273"


def open_serial() -> serial.Serial:
    ser = serial.Serial()
    ser.port = find_port()
    ser.baudrate = 115200
    ser.timeout = 0.3
    ser.dsrdtr = ser.rtscts = False
    ser.dtr = ser.rts = False
    ser.open()
    return ser


def enhance(img: Image.Image) -> Image.Image:
    """Squeeze the most clarity out of the badge's tiny, soft grayscale frame.

    The sensor dump is only ~128x120 and low-contrast, so: center-crop square, stretch the
    tonal range (autocontrast), upscale smoothly (LANCZOS beats blocky NEAREST for a photo),
    then unsharp-mask to bring back edge definition. Can't add detail that isn't there, but
    this reads a lot 'clearer' than a raw upscale.
    """
    side = min(img.size)
    left, top = (img.width - side) // 2, (img.height - side) // 2
    img = img.crop((left, top, left + side, top + side))
    img = ImageOps.autocontrast(img, cutoff=1)
    # upscale tiny frames for legibility, but NEVER downscale a big capture -- keep the real detail
    target = max(512, side)
    if img.width != target:
        img = img.resize((target, target), Image.LANCZOS)
    # heavy sharpening helps the tiny sources; lighter on big ones (unsharp haloes high-res badly)
    percent = 160 if side < 400 else 90
    img = img.filter(ImageFilter.UnsharpMask(radius=2, percent=percent, threshold=2))
    return img


def save_frame(width: int, rows: list[bytes]) -> str:
    img = Image.frombytes("L", (width, len(rows)), b"".join(r[:width] for r in rows))
    img = enhance(img)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    data = buf.getvalue()
    # upload to the gallery API (works locally and against a hosted URL via GALLERY_URL)
    headers = {"Content-Type": "image/png"}
    token = os.environ.get("BADGE_UPLOAD_TOKEN")
    if token:
        headers["x-upload-token"] = token
    try:
        req = urllib.request.Request(
            f"{GALLERY_URL}/api/photos",
            data=data,
            method="POST",
            headers=headers,
        )
        with urllib.request.urlopen(req, timeout=10, context=_SSL_CTX) as resp:
            name = json.load(resp).get("name", "uploaded")
        return f"uploaded {name} -> {GALLERY_URL}"
    except Exception as exc:  # noqa: BLE001 -- server down? fall back to a local file
        os.makedirs(OUT, exist_ok=True)
        n = len([f for f in os.listdir(OUT) if f.startswith("cam_")]) + 1
        path = os.path.join(OUT, f"cam_{n:03d}.png")
        img.save(path)
        return f"{path} (local fallback; API unreachable: {exc})"


def trigger(ser: serial.Serial) -> None:
    end = time.time() + 2.5
    while time.time() < end:
        ser.read(8192)
    ser.write(b"\r\n")
    ser.flush()
    time.sleep(0.4)
    while ser.in_waiting:
        ser.read(8192)
    print("aim the badge — triggering camera...", flush=True)
    ser.write(b"test photo\r\n")
    ser.flush()


def open_serial_blocking() -> serial.Serial:
    """Wait for the badge to appear on USB, then open it. Survives being launched before the
    badge is plugged in (or while it's rebooting)."""
    announced = False
    while True:
        try:
            return open_serial()
        except (serial.SerialException, FileNotFoundError, OSError):
            if not announced:
                print("waiting for the badge — plug it into USB (Ctrl+C to stop)...", flush=True)
                announced = True
            time.sleep(1.5)


def run(snap: bool) -> int:
    ser = open_serial_blocking()
    print(f"connected on {ser.port} -> uploading to {GALLERY_URL}", flush=True)
    if snap:
        trigger(ser)
    else:
        print("listening — press the badge's camera button to take a photo (Ctrl+C to stop)", flush=True)

    width = None
    rows: list[bytes] = []
    capturing = False
    buf = b""
    deadline = time.time() + 30 if snap else None
    try:
        while True:
            if deadline and time.time() > deadline:
                print("no frame received — camera missed its bring-up. run it again.", flush=True)
                return 1
            try:
                chunk = ser.read(4096)
            except serial.SerialException:
                # USB-CDC glitched (reset/contention) — reconnect and keep listening
                try:
                    ser.close()
                except Exception:  # noqa: BLE001
                    pass
                time.sleep(0.6)
                try:
                    ser = open_serial()
                except Exception:  # noqa: BLE001
                    time.sleep(1.0)
                buf = b""
                continue
            buf += chunk
            while b"\n" in buf:
                raw, buf = buf.split(b"\n", 1)
                line = raw.decode("utf-8", "replace").strip()
                if line:
                    _debug(line)
                m = RE_START.search(line)
                if m:
                    width = int(m.group(1))
                    rows, capturing = [], True
                    print(f"receiving {width}x{m.group(2)} ...", flush=True)
                    continue
                if "PHOTOEND" in line and capturing:
                    capturing = False
                    if rows and width:
                        print(f"saved {save_frame(width, rows)} — refresh the gallery", flush=True)
                        if snap:
                            return 0
                    continue
                m = RE_ROW.search(line)
                if m and capturing and width:
                    rows.append(bytes.fromhex(m.group(1)))
    except KeyboardInterrupt:
        print("\nstopped.", flush=True)
        return 0
    finally:
        try:
            ser.close()
        except Exception:  # noqa: BLE001
            pass


if __name__ == "__main__":
    sys.exit(run(snap="--snap" in sys.argv))
