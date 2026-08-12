#!/usr/bin/env bash
# Package the already-built console+vault into UF2s. Logs everything to package.log.
set -uo pipefail
ROOT="/private/tmp/claude-501/-Users-ivoinestrachan/5617a64a-d55c-4d98-9419-40e73989487a/scratchpad/dc34"
LOG="/private/tmp/claude-501/-Users-ivoinestrachan/5617a64a-d55c-4d98-9419-40e73989487a/scratchpad/package.log"
TT="riscv32imac-unknown-xous-elf"
cd "$ROOT/xous-core"

# No git tags in this clone -> `git describe` fails -> version stamp errors.
# The signer has a CI fallback (v0.0.0-0-g<sha>) gated on CI=true. Use it.
export CI=true
export GITHUB_SHA=5d5bbbfa95c0dcef26fe1fe9b496b7f6f31d191b

echo "===== packaging baosec-lite image =====" | tee "$LOG"
cargo xtask baosec-lite \
    "$ROOT/dc34-console/target/$TT/release/dc34-console~flash" \
    "$ROOT/dc34-vault/target/$TT/release/dc34-vault" \
    --no-timestamp --feature usb --kernel-feature debug-proc --no-verify 2>&1 | tee -a "$LOG"
echo "===== exit: ${PIPESTATUS[1]:-0} =====" | tee -a "$LOG"

echo "===== searching for produced UF2s =====" | tee -a "$LOG"
find "$ROOT/xous-core" -name '*.uf2' -newermt "2026-08-06 11:15" 2>/dev/null -exec ls -la {} \; | tee -a "$LOG"
echo "===== done =====" | tee -a "$LOG"
