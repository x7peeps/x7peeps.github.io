import os
import glob

files = glob.glob('content/**/_index.md', recursive=True)
count = 0

for f in files:
    with open(f, 'r') as file:
        content = file.read()
    
    if '{{% article_cards %}}' in content:
        new_content = content.replace('{{% article_cards %}}', '{{% children type="card" depth="2" %}}')
        with open(f, 'w') as file:
            file.write(new_content)
        print(f"Restored {f}")
        count += 1

print(f"Total restored: {count}")
