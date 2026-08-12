#!/usr/bin/env python3
import sys, qrcode
from qrcode.constants import ERROR_CORRECT_M
from PIL import Image

url = sys.argv[1]
out = sys.argv[2]
SIZE = 128

qr = qrcode.QRCode(error_correction=ERROR_CORRECT_M, box_size=1, border=2)
qr.add_data(url)
qr.make(fit=True)
mods = qr.get_matrix()
n = len(mods)                      # module count incl border
box = max(1, SIZE // n)            # integer scale to stay crisp
qr_px = n * box
img = Image.new("1", (qr_px, qr_px), 1)
px = img.load()
for y in range(n):
    for x in range(n):
        if mods[y][x]:
            for dy in range(box):
                for dx in range(box):
                    px[x*box+dx, y*box+dy] = 0
# center on 128x128 white canvas
canvas = Image.new("1", (SIZE, SIZE), 1)
off = ((SIZE-qr_px)//2, (SIZE-qr_px)//2)
canvas.paste(img, off)
canvas.save(out)
print(f"modules(incl border)={n} box={box} qr_px={qr_px} -> {out}")
