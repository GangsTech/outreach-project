from PIL import Image
import os

def resize(size, out_filename):
    src = "public/logo.png"
    if not os.path.exists(src):
        return
    img = Image.open(src)
    # Ensure square resize
    img = img.resize((size, size), Image.Resampling.LANCZOS)
    img.save(f"public/{out_filename}")

resize(192, "pwa-192x192.png")
resize(512, "pwa-512x512.png")
resize(512, "maskable-icon-512x512.png")
resize(512, "logo.webp")
