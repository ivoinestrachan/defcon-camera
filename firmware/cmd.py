#!/usr/bin/env python3
"""Send one console command to the badge and print the reply. Read-only friendly.
Usage: cmd.py "test hue"   (omit trailing newline; we add CRLF)
"""
import sys, time, serial

PORT = "/dev/cu.usbmodemS5NA273"
BAUD = 115200
line = sys.argv[1] if len(sys.argv) > 1 else ""

ser = serial.Serial()
ser.port = PORT; ser.baudrate = BAUD; ser.timeout = 0.3
ser.dsrdtr = False; ser.rtscts = False; ser.dtr = False; ser.rts = False
ser.open()

def drain(sec):
    out = b""; end = time.time() + sec
    while time.time() < end:
        c = ser.read(4096)
        if c: out += c
    return out

drain(0.4)                      # clear banner
ser.write((line + "\r\n").encode()); ser.flush()
resp = drain(1.8)
ser.close()
print(f"--- sent: {line!r} ---")
print(resp.decode("utf-8", "replace"))
