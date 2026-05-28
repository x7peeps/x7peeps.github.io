import os
import sys
from PIL import Image

def compress_images_in_dir(directory, max_size_mb=1.0):
    max_size_bytes = max_size_mb * 1024 * 1024
    compressed_count = 0
    
    for root, _, files in os.walk(directory):
        if '.git' in root or 'public' in root:
            continue
            
        for file in files:
            if not file.lower().endswith(('.png', '.jpg', '.jpeg')):
                continue
                
            file_path = os.path.join(root, file)
            try:
                file_size = os.path.getsize(file_path)
                if file_size > max_size_bytes:
                    print(f"Compressing: {file_path} ({file_size/1024/1024:.2f} MB)")
                    
                    with Image.open(file_path) as img:
                        # Convert RGBA to RGB for JPEG compatibility or just to save space
                        if img.mode in ('RGBA', 'P'):
                            img = img.convert('RGB')
                        
                        # Resize if image is extremely large (width > 1920)
                        if img.width > 1920:
                            ratio = 1920.0 / img.width
                            new_size = (1920, int(img.height * ratio))
                            img = img.resize(new_size, Image.Resampling.LANCZOS)
                        
                        # Save as JPEG with 80% quality to significantly reduce size
                        new_file_path = os.path.splitext(file_path)[0] + '.jpg'
                        img.save(new_file_path, 'JPEG', quality=80, optimize=True)
                        
                        if new_file_path != file_path:
                            os.remove(file_path)
                            print(f"  -> Converted to JPG and compressed")
                        else:
                            print(f"  -> Compressed in place")
                        compressed_count += 1
            except Exception as e:
                print(f"Error processing {file_path}: {e}")
                
    print(f"\nDone! Compressed {compressed_count} images.")

if __name__ == "__main__":
    import importlib.util
    if importlib.util.find_spec("PIL") is None:
        print("Pillow library not found. Please install it first: pip install Pillow")
        sys.exit(1)
        
    target_dir = "./hugo-src/content"
    if os.path.exists(target_dir):
        compress_images_in_dir(target_dir)
    else:
        print(f"Directory {target_dir} not found.")
