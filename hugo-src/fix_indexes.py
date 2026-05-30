import os
import glob

files = glob.glob('content/**/_index.md', recursive=True)
count = 0

for f in files:
    if f == 'content/_index.md':
        continue
    with open(f, 'r') as file:
        content = file.read()
    
    # If the file only has frontmatter (starts with ---, has another ---, and then only whitespace)
    parts = content.split('---')
    if len(parts) >= 3:
        body = '---'.join(parts[2:]).strip()
        if not body:
            # Add the shortcode
            new_content = content.rstrip() + '\n\n{{% children type="card" depth="2" %}}\n'
            with open(f, 'w') as file:
                file.write(new_content)
            print(f"Updated {f}")
            count += 1
        elif 'children' in body and 'card' not in body:
            pass # Maybe modify it if needed, but let's just do the empty ones first.

print(f"Total updated: {count}")
