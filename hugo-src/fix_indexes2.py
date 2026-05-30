import os
import glob

files = glob.glob('content/**/_index.md', recursive=True)
count = 0

for f in files:
    with open(f, 'r') as file:
        content = file.read()
    
    if '{{% children type="card" depth="2" %}}' in content:
        new_content = content.replace('{{% children type="card" depth="2" %}}', '{{% article_cards %}}')
        with open(f, 'w') as file:
            file.write(new_content)
        print(f"Updated {f}")
        count += 1

print(f"Total updated: {count}")
