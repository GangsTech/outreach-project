from PIL import Image, ImageDraw, ImageFont

def make_icon(size, filename):
    img = Image.new('RGB', (size, size), color = (0, 0, 0))
    d = ImageDraw.Draw(img)
    # create a simple white circle and L text
    d.ellipse([(size*0.1, size*0.1), (size*0.9, size*0.9)], outline=(255,255,255), width=max(1, size//20))
    img.save(f"public/{filename}")

make_icon(192, "pwa-192x192.png")
make_icon(512, "pwa-512x512.png")
make_icon(512, "maskable-icon-512x512.png")
