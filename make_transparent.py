import sys
from PIL import Image

def remove_white_background(input_path, output_path, tolerance=50):
    try:
        img = Image.open(input_path).convert("RGBA")
        datas = img.getdata()
        newData = []
        for item in datas:
            # item is (R, G, B, A)
            if item[0] >= 255 - tolerance and item[1] >= 255 - tolerance and item[2] >= 255 - tolerance:
                newData.append((255, 255, 255, 0)) # transparent
            else:
                newData.append(item)
        img.putdata(newData)
        # crop to bounding box to remove extra padding
        bbox = img.getbbox()
        if bbox:
            img = img.crop(bbox)
        img.save(output_path, "PNG")
        print(f"Saved {output_path}")
    except Exception as e:
        print(f"Error processing {input_path}: {e}")

images = [
    ("/Users/medaka/Downloads/無題23_20251024113904.PNG", "/Users/medaka/.gemini/antigravity/scratch/medaka-sim/src/assets/wild_medaka.png"),
    ("/Users/medaka/Downloads/無題35_20251104110730.PNG", "/Users/medaka/.gemini/antigravity/scratch/medaka-sim/src/assets/domestic_black.png"),
    ("/Users/medaka/Downloads/IMG_7001.jpg", "/Users/medaka/.gemini/antigravity/scratch/medaka-sim/src/assets/domestic_red.png"),
    ("/Users/medaka/Downloads/IMG_7031.jpg", "/Users/medaka/.gemini/antigravity/scratch/medaka-sim/src/assets/domestic_blue.png")
]

for in_path, out_path in images:
    remove_white_background(in_path, out_path, tolerance=35)

