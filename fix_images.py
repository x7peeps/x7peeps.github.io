import os
import re
import shutil
import urllib.parse

CONTENT_DIR = "hugo-src/content"
STATIC_DIR = "hugo-src/static"
RECOVERED_IMAGES_DIR = "hugo-src/static/images/recovered"
OBSIDIAN_VAULT = "/Users/pwndazhang/Library/Mobile Documents/iCloud~md~obsidian/Documents/00 我的知识库"

# Pre-index all files in the Obsidian vault for fast lookup
obsidian_files = {}
print("Indexing Obsidian vault...")
for root, _, files in os.walk(OBSIDIAN_VAULT):
    for f in files:
        if f.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp')):
            obsidian_files[f] = os.path.join(root, f)

print(f"Indexed {len(obsidian_files)} images in Obsidian.")

os.makedirs(RECOVERED_IMAGES_DIR, exist_ok=True)

md_image_regex = re.compile(r'!\[([^\]]*)\]\(([^)]+)\)')
html_image_regex = re.compile(r'<img[^>]+src=["\']([^"\'\>]+)["\'][^>]*>')
obsidian_img_regex = re.compile(r'!\[\[(.*?)\]\]')

def check_and_fix_images(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    dir_name = os.path.dirname(file_path)

    # 1. Replace Obsidian image links ![[image.png]] with ![image.png](image.png)
    def obs_replacer(match):
        img_name = match.group(1)
        return f"![{img_name}]({img_name})"
        
    content = obsidian_img_regex.sub(obs_replacer, content)

    # 2. Find standard MD images and fix missing
    def replacer(match):
        alt = match.group(1)
        src = match.group(2)
        
        # Clean up src (remove query params, fragments, etc if any)
        clean_src = urllib.parse.unquote(src.split(' ')[0]) # handle `![alt](url "title")` roughly
        
        # Check if local
        if clean_src.startswith('http://') or clean_src.startswith('https://') or clean_src.startswith('data:'):
            return match.group(0) # Remote or inline, skip
            
        # Determine expected local path
        if clean_src.startswith('/'):
            expected_path = os.path.join(STATIC_DIR, clean_src.lstrip('/'))
        else:
            expected_path = os.path.join(dir_name, clean_src)
            
        if not os.path.exists(expected_path):
            filename = os.path.basename(clean_src)
            # Try to find it in Obsidian
            if filename in obsidian_files:
                obsidian_path = obsidian_files[filename]
                # Recover it
                dest_path = os.path.join(RECOVERED_IMAGES_DIR, filename)
                if not os.path.exists(dest_path):
                    shutil.copy2(obsidian_path, dest_path)
                    print(f"Recovered: {filename}")
                # Update link to absolute static path
                new_src = "/images/recovered/" + urllib.parse.quote(filename)
                
                # reconstruct with title if existed
                parts = src.split(' ', 1)
                if len(parts) > 1:
                    new_src += " " + parts[1]
                    
                return f"![{alt}]({new_src})"
            else:
                # print(f"Missing and not found in Obsidian: {clean_src} in {file_path}")
                pass
                
        return match.group(0)

    new_content = md_image_regex.sub(replacer, content)
    
    if new_content != original_content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Fixed links in: {file_path}")

for root, _, files in os.walk(CONTENT_DIR):
    for f in files:
        if f.endswith('.md'):
            check_and_fix_images(os.path.join(root, f))
