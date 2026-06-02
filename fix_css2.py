import re

with open('hugo-src/static/css/custom.css', 'r') as f:
    css = f.read()

css = re.sub(r'white-space: nowrap !important; /\* Keep text on one line \*/', 
             r'white-space: normal !important; /* Allow text to wrap cleanly */', css)

with open('hugo-src/static/css/custom.css', 'w') as f:
    f.write(css)
