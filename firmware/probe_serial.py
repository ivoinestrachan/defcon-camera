#!/usr/bin/env python3
"""Read-only probe of the DC34 badge USB console. Does NOT toggle reset lines."""
import sys, time, serial

PORT = "/dev/cu.usbmodemS5NA273"
BAUD = int(sys.argv[1]) if len(sys.argv) > 1 else 115200

try:
    # dsrdtr/rtscts off; do not assert DTR (some boards reset on DTR)
    ser = serial.Serial()
    ser.port = PORT
    ser.baudrate = BAUD
    ser.timeout = 0.3
    ser.dsrdtr = False
    ser.rtscts = False
    ser.dtr = False
    ser.rts = False
    ser.open()
except Exception as e:
    print(f"OPEN-FAIL @ {BAUD}: {e}")
    sys.exit(1)

def drain(seconds):
    out = b""
    end = time.time() + seconds
    while time.time() < end:
        chunk = ser.read(4096)
        if chunk:
            out += chunk
    return out

# grab any banner already waiting
banner = drain(0.6)
# nudge the REPL: newline then help
for cmd in (b"\r\n", b"help\r\n", b"?\r\n"):
    ser.write(cmd)
    ser.flush()
    time.sleep(0.4)
resp = drain(2.0)
ser.close()

raw = banner + resp
print(f"=== BAUD {BAUD} | {len(raw)} bytes ===")
# printable-safe dump
try:
    print(raw.decode("utf-8", "replace"))
except Exception:
    print(repr(raw))
