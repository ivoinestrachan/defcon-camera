# Contributing to DEFCON / CAMERA

Thanks for wanting to hack on this! 📸 This repo is the **badge side** of the project — the DC34
badge firmware edits and the host bridge. The web gallery is a separate project at
**[defcon-polaroid](https://github.com/ivoinestrachan/defcon-polaroid)** — open gallery issues/PRs
there, not here.

## What lives where

| Area | Path | Language |
|------|------|----------|
| Badge firmware edits (camera + lights) | [`firmware/dc34/`](./firmware/dc34) | Rust (Xous / `bao1x`) |
| Host bridge (serial → upload) | [`capture.py`](./capture.py) | Python |
| Always-on service | [`deploy/`](./deploy) | launchd (macOS) |
| Session tools (build/serial helpers) | `firmware/*.sh`, `firmware/*.py` | Bash / Python |

## Before you start

- Read the [README](./README.md) end-to-end — it has the full build → **boot mode** → flash → bridge flow.
- The firmware files here are **diffs on top of upstream** ([`bunnie/dc34-console`](https://github.com/bunnie/dc34-console),
  [`betrusted-io/xous-core`](https://github.com/betrusted-io/xous-core)). Clone those, copy our
  `firmware/dc34/` files over, and build from there.
- You'll need the badge hardware to meaningfully test firmware changes.

## Development setup

**Bridge (Python):**
```bash
python3 -m pip install pyserial Pillow certifi
GALLERY_URL=https://your-gallery.vercel.app python3 capture.py
```

**Firmware (Rust):** see the [Build](./README.md#2--build) and
[Boot mode & flash](./README.md#3--enter-boot-mode--flash) steps in the README.

## Making changes

1. **Fork** and branch off `main` (`feat/…`, `fix/…`, `docs/…`).
2. Keep changes focused; match the surrounding style.
   - **Rust:** run `cargo fmt` on files you touch.
   - **Python:** keep it stdlib-only where possible (the bridge intentionally has minimal deps).
3. **Test what you changed:**
   - Firmware → build cleanly, flash, and confirm on-badge behavior (camera capture / LED show).
   - Bridge → run it against a badge (or note if you couldn't test on hardware).
4. Use **[Conventional Commits](https://www.conventionalcommits.org/)** — `feat:`, `fix:`, `docs:`,
   `refactor:`, `chore:`.
5. Open a PR using the template. Say what you tested and on which badge/OS.

## Reporting bugs & ideas

Use the [issue templates](https://github.com/ivoinestrachan/defcon-camera/issues/new/choose). For
firmware/flash bugs, include your badge state (serial device present? `BAOCHIP` mounted?), the
`capture.log` tail, cable, and macOS/Python versions — it saves a ton of back-and-forth.

## A note on licensing

Firmware in `firmware/` derives from the upstream projects and stays under **their** licenses — check
each upstream repo before redistributing. The bridge and docs here are free to use.

## Be cool

This is a DEF CON badge hack for fun. Be respectful, assume good faith, and don't use it to mess with
anyone's stuff without consent.
