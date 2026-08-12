# DEF CON 34 Badge Firmware — Camera + Lights Setup

How to build and flash the modified **DEF CON 34 badge** firmware that adds a **camera-capture
command** and **custom LED show** to the badge. The camera dumps photos over the USB serial
console, where [`capture.py`](./capture.py) picks them up and posts them to the web gallery
(see [`SETUP.md`](./SETUP.md) for the host bridge + gallery side).

> **This is the on-badge firmware side.** The badge → bridge → gallery pipeline:
>
> ```
> badge firmware (this doc)         host bridge          web gallery (SETUP.md)
> ┌─────────────────────────┐      ┌────────────┐       ┌──────────────────┐
> │ bao-video service dumps │ USB  │ capture.py │ HTTPS │ Next.js gallery   │
> │ PHOTOSTART/PHOTO/PHOTOEND├─────▶│  (bridge)  ├──────▶│ + Cloudinary/Blob │
> │ + LED ring show         │serial└────────────┘       └──────────────────┘
> └─────────────────────────┘
> ```

---

## The hardware

- **DEF CON 34 badge** — bunnie Huang's **Baochip `bao1x`** SoC (RISC-V, `riscv32imac`), running
  **[Xous OS](https://github.com/betrusted-io/xous-core)**.
- On-board **GC2145** camera sensor (I²C control @ `0x3C`, driven by `bao1x-hal`).
- An **LED ring** (10 LEDs; 18 on "uber" badges) driven by a dedicated LED server.

Reference docs: <https://baochip.github.io/baochip-1x/> · SoC repo:
<https://github.com/baochip/baochip-1x>

---

## Source layout

The firmware is **two upstream repos** plus our edits. Neither is vendored into this repo — clone
them side by side:

```bash
mkdir dc34 && cd dc34
# The badge application (LEDs, shell commands, UX) — bunnie's DC34 badge apps
git clone https://github.com/bunnie/dc34-console
git clone https://github.com/bunnie/dc34-api
git clone https://github.com/bunnie/dc34-core-hw     # (hardware defs, if needed)
# The OS: Xous + bao1x HAL + the camera/video service
git clone -b dev https://github.com/betrusted-io/xous-core
```

Resulting tree (only the files we touched are listed):

```
dc34/
├── dc34-console/
│   └── src/
│       ├── cmds/test.rs          # `test photo` → triggers a capture (GfxOpcode::CapturePhoto)
│       ├── leds.rs               # LED ring show + MOTION_PAUSE (freeze lights during capture)
│       ├── bio/lightgenes/       # generative LED animation ("Lightgenes")
│       ├── fxcore.rs             # LED effect core
│       └── motion.rs             # motion-driven LED behavior
├── dc34-api/
│   └── src/lib.rs                # shared API (LED_SERVER name, badge types, etc.)
└── xous-core/
    ├── services/bao-video/
    │   └── src/main.rs           # camera service; emits PHOTOSTART/PHOTO/PHOTOEND
    └── libs/
        ├── bao1x-hal/src/gc2145/gc2145.rs   # GC2145 camera sensor driver
        └── ux-api/src/service/api.rs         # added GfxOpcode::CapturePhoto
```

> ⚠️ **Our modified copies of these files are not currently checked into any repo.** They were
> edited in a working tree under `/tmp` that got wiped on reboot. The edits are preserved in
> Claude Code's file-history and can be restored — see [Restoring our edits](#restoring-our-edits).

---

## What we changed

### 1. Camera capture over serial

We added a **`CapturePhoto` graphics opcode** and wired it end to end so a single command dumps one
frame as ASCII-hex over the serial console:

- **`ux-api/src/service/api.rs`** — added `GfxOpcode::CapturePhoto`.
- **`dc34-console/src/cmds/test.rs`** — `test photo` sends `GfxOpcode::CapturePhoto` to the gfx/video
  service. (The `test cam poke <adr> <data>` subcommand also exists for raw GC2145 register pokes.)
- **`xous-core/services/bao-video/src/main.rs`** — handles `CapturePhoto` by setting `photo_req`,
  then, once the next frame settles, streams it (downsampled 2×) as hex:

  ```rust
  if photo_req {
      photo_req = false;
      log::info!("PHOTOSTART {} {}", IMAGE_WIDTH / 2, IMAGE_HEIGHT / 2);
      let mut lineb = String::with_capacity(IMAGE_WIDTH);
      for y in (0..IMAGE_HEIGHT).step_by(2) {
          lineb.clear();
          for x in (0..IMAGE_WIDTH).step_by(2) {
              lineb.push_str(&format!("{:02x}", frame[y * IMAGE_WIDTH + x]));
          }
          log::info!("PHOTO {}", lineb);
      }
      log::info!("PHOTOEND");
  }
  ```

  This is exactly the `PHOTOSTART / PHOTO <hex> / PHOTOEND` framing that [`capture.py`](./capture.py)
  parses on the host.

- **`bao1x-hal/src/gc2145/gc2145.rs`** — GC2145 sensor bring-up / configuration used by the service.

### 2. The LED show ("the lights")

- **`dc34-console/src/leds.rs`** — `led_show()`: a dot races around the ring, then the whole ring
  flashes, on repeat. Pure LED driver (it deliberately does **not** touch the accelerometer — that
  belongs to the power manager; sharing it broke sleep/wake).
- **`dc34-console/src/bio/lightgenes/`** — `Lightgenes`, a generative animation system that renders
  "phenotypes" to the `LED_SERVER` (`LED_COUNT = 10`, or `18` with the `uber` feature).
- **`fxcore.rs` / `motion.rs`** — effect core and motion-reactive behavior.
- **`MOTION_PAUSE`** (in `leds.rs`) — a shared flag that **freezes the LED pattern during a camera
  scan** so LED glare doesn't pollute the captured frame. `set_pause(true)` before capture,
  `set_pause(false)` after.

---

## Toolchain

The badge uses a **custom Rust target** (`riscv32imac-unknown-xous-elf`) from the betrusted-io fork.
The easiest install is xous-core's own xtask:

```bash
cd dc34/xous-core
cargo xtask install-toolkit          # installs the riscv32imac-unknown-xous-elf toolchain
```

> **Heads up (authorization):** `cargo xtask …` runs build tooling **from the cloned `xous-core`
> repo**. That's expected for this project, but it does execute third-party build code — only run it
> if you trust the source you cloned. (In our earlier session this step was intentionally gated
> until reviewed.)

If you'd rather not run xtask, the toolchain is also published here:
`https://github.com/betrusted-io/rust/releases` (e.g. `riscv32imac-unknown-xous_1.93.0.zip`).

---

## Build

The DC34 badge target is **`baosec-lite`**. Build the console app and the OS services against the
`bao1x` / `board-baosec` features:

```bash
# 1) Build the badge console app (dc34-console)
cd dc34/dc34-console
cargo build --release \
  --target riscv32imac-unknown-xous-elf \
  --features board-baosec \
  --features oem-baosec-lite \
  --features bao1x \
  --features utralib/bao1x
# add `--features misc-test` if you want the `test photo` / `test cam` shell commands

# 2) Build + package the full image (loader + kernel + apps) via xous-core's xtask
cd ../xous-core
cargo xtask baosec-lite \
  ../dc34-console/target/riscv32imac-unknown-xous-elf/release/dc34-console~flash \
  ../dc34-vault/target/riscv32imac-unknown-xous-elf/release/dc34-vault
```

The build emits **UF2** artifacts under
`target/riscv32imac-unknown-[xous|none]-elf/release/`:

- `loader.uf2` — bootloader
- `xous.uf2` — kernel
- `apps.uf2` — applications (the badge console)

---

## Flash

The badge exposes a **UF2 mass-storage bootloader** (like a lot of RP2040-style boards):

1. Put the badge in bootloader mode and mount it as a USB drive.
2. **First flash:** copy **all three** UF2s (`loader.uf2`, `xous.uf2`, `apps.uf2`) so the loader,
   kernel, and apps are all at the same revision.
3. **Later updates:** if you only changed app code (and loader/kernel are unchanged), copying just
   `apps.uf2` is enough.

The badge reboots into the new firmware.

---

## Use it

1. Flash the firmware (above). The LED ring show starts automatically.
2. On the host, start the bridge and gallery — see [`SETUP.md`](./SETUP.md):
   ```bash
   GALLERY_URL=https://your-gallery.vercel.app python3 capture.py
   ```
3. Trigger a capture, either way:
   - Press the badge's **camera button**, **or**
   - From the badge serial console, run `test photo` (needs the `misc-test` feature build).
4. `bao-video` freezes the LEDs, grabs a settled frame, and streams `PHOTOSTART/PHOTO/PHOTOEND`.
   `capture.py` reads it, enhances it, and uploads the PNG. Refresh the gallery.

---

## Restoring our edits

Because the modified working tree lived under `/tmp` and was wiped on reboot, the current on-disk
state is **only the upstream repos** — our camera/LED edits are not in them yet. They are preserved
in Claude Code's file-history for the firmware session:

```
~/.claude/file-history/5617a64a-d55c-4d98-9419-40e73989487a/
```

Key snapshots (latest version wins):

| File we edited | Snapshot hash |
|----------------|---------------|
| `xous-core/services/bao-video/src/main.rs` | `09b50f907d829460@v8` |
| `dc34-console/src/cmds/test.rs` | `1e82cb4538859dd1@v4` |
| `dc34-console/src/leds.rs` | `4a64a6b8574e10f7@v15` |
| `dc34-console/src/bio/lightgenes/…` | `60ca7dd46811d3c7@v2` |
| host bridge `capture.py` | `71f161df358201a4@v10` (already restored in this repo) |

The full session transcript (every edit, in order) is at
`~/.claude/projects/-Users-ivoinestrachan/5617a64a-d55c-4d98-9419-40e73989487a.jsonl`.

To make this repo self-contained and buildable by others, the modified firmware files should be
recovered from those snapshots and committed (e.g. as a `firmware/` directory or a patch set against
the upstream repos). Ask Claude to "restore the badge firmware edits from file-history" to do this.
