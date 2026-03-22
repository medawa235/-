import sys
from PIL import Image

# increase recursion limit just in case, though we use iterative stack
sys.setrecursionlimit(1000000)

def remove_outer_white_background(input_path, output_path, tolerance=50):
    try:
        img = Image.open(input_path).convert("RGBA")
        width, height = img.size
        pixels = img.load()
        
        # Keep track of visited pixels to avoid infinite loops
        visited = set()
        stack = []
        
        # Add all border pixels to stack to start the generic floodfill from the edges
        for x in range(width):
            stack.append((x, 0))
            stack.append((x, height - 1))
        for y in range(height):
            stack.append((0, y))
            stack.append((width - 1, y))
            
        def is_white(r, g, b):
            return r >= 255 - tolerance and g >= 255 - tolerance and b >= 255 - tolerance

        # Iterative Flood fill for all outer white pixels
        while stack:
            x, y = stack.pop()
            
            if (x, y) in visited:
                continue
            if x < 0 or x >= width or y < 0 or y >= height:
                continue
                
            visited.add((x, y))
            
            # extract RGBA
            r, g, b, a = pixels[x, y]
            
            if is_white(r, g, b):
                # If it's a white pixel connected to an edge, make it transparent
                pixels[x, y] = (255, 255, 255, 0)
                # Add valid neighbors to check
                stack.append((x + 1, y))
                stack.append((x - 1, y))
                stack.append((x, y + 1))
                stack.append((x, y - 1))

        # crop the image to remove transparent padding
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

# Set a slightly more strict tolerance (e.g. 50 allows near-white off-whites to be clipped)
for in_path, out_path in set(images):
    remove_outer_white_background(in_path, out_path, tolerance=60)
