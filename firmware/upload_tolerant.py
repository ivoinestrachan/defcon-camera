#!/usr/bin/env python3
"""Tolerant image uploader for the DC34 badge: reuses send_image packing,
but ignores interleaved async log lines ([console] echo, INFO:/WARN: spam)."""
import sys, time, base64, importlib.util, serial

SI = "/private/tmp/claude-501/-Users-ivoinestrachan/5617a64a-d55c-4d98-9419-40e73989487a/scratchpad/dc34/dc34-image/dc34_image/send_image.py"
spec = importlib.util.spec_from_file_location("send_image", SI)
si = importlib.util.module_from_spec(spec); spec.loader.exec_module(si)
from PIL import Image

PORT = "/dev/cu.usbmodemS5NA273"
img_path = sys.argv[1]
force = "--noforce" not in sys.argv

img = si.force_convert(img_path) if force else Image.open(img_path)
bitmap = si.image_to_bytes(img)
assert len(bitmap) == si.TOTAL_BYTES
chunks = [bitmap[i:i+si.CHUNK_DATA_SIZE] for i in range(0, si.TOTAL_BYTES, si.CHUNK_DATA_SIZE)]

ser = serial.Serial()
ser.port = PORT; ser.baudrate = 115200; ser.timeout = 0.25
ser.dsrdtr = False; ser.rtscts = False; ser.dtr = False; ser.rts = False
ser.open()

def read_token(budget=5.0):
    """Read lines until we see OK/SUCCESS/ERR, ignoring echo + log spam."""
    end = time.time() + budget
    buf = b""
    while time.time() < end:
        buf += ser.read(256)
        while b"\n" in buf:
            line, buf = buf.split(b"\n", 1)
            t = line.decode("ascii", "replace").strip()
            if not t:
                continue
            # strip a leading "[console]" prompt if glued on
            if t.startswith("[console]"):
                t = t[len("[console]"):].strip()
            if t in ("OK", "SUCCESS", "ERR"):
                return t
            # else: echo of our command or INFO:/WARN: log — ignore
    return None

def drain(sec=1.0):
    end = time.time() + sec
    while time.time() < end:
        ser.read(4096)

drain(1.0)
ok = False
for idx, cd in enumerate(chunks):
    wire = si.make_chunk(idx, cd)
    line = ("image " + base64.b64encode(wire).decode() + "\n").encode()
    for attempt in range(6):
        ser.write(line); ser.flush()
        tok = read_token(5.0)
        if tok == "SUCCESS":
            print(f"[OK] chunk {idx+1}/32 -> SUCCESS complete"); ok = True; break
        if tok == "OK":
            print(f"[OK] chunk {idx+1}/32"); break
        print(f"[retry] chunk {idx+1}/32 got {tok!r} (attempt {attempt+1})")
        time.sleep(0.3)
    else:
        print(f"[FAIL] chunk {idx+1}/32 no OK"); break
    if ok: break
    time.sleep(0.15)
ser.close()
print("DONE" if ok else "INCOMPLETE")
