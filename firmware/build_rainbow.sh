#!/usr/bin/env bash
# Builds the DC34 rainbow firmware. COMPILE ONLY — does not flash anything.
# Run:  bash build_rainbow.sh
set -euo pipefail

ROOT="/private/tmp/claude-501/-Users-ivoinestrachan/5617a64a-d55c-4d98-9419-40e73989487a/scratchpad/dc34"
TT="riscv32imac-unknown-xous-elf"
cd "$ROOT/xous-core"

# no git tags in this clone -> git-describe version stamp fails; use the signer's CI fallback
export CI=true
export GITHUB_SHA=5d5bbbfa95c0dcef26fe1fe9b496b7f6f31d191b

echo "===== [1/4] install Xous toolkit (idempotent) ====="
cargo xtask install-toolkit

echo "===== [2/4] build console (rainbow cmd + misc-test toolbox) ====="
( cd "$ROOT/dc34-console" && cargo build --release --target "$TT" \
    --features board-baosec --features oem-baosec-lite --features bao1x \
    --features utralib/bao1x --features misc-test )

echo "===== [3/4] build vault ====="
( cd "$ROOT/dc34-vault" && cargo build --release --target "$TT" --features board-baosec )

echo "===== [4/4] package baosec-lite image ====="
cargo xtask baosec-lite \
    "$ROOT/dc34-console/target/$TT/release/dc34-console~flash" \
    "$ROOT/dc34-vault/target/$TT/release/dc34-vault" \
    --no-timestamp --feature usb --kernel-feature debug-proc --no-verify

echo "===== locating output UF2s ====="
find "$ROOT/xous-core" -maxdepth 4 -name '*.uf2' -print 2>/dev/null | sort
echo "===== BUILD DONE (nothing flashed) ====="
