import re

with open('hugo-src/static/css/custom.css', 'r') as f:
    css = f.read()

# Remove the overflow-x hidden constraint which broke perfect-scrollbar and mobile touch
css = re.sub(r'overflow-y: auto !important;\n  overflow-x: hidden !important;', 
             r'overflow-y: auto !important;\n  overflow-x: auto !important;', css)

# Make sure we didn't break pointer events
css = re.sub(r'white-space: normal !important; /\* Allow text to wrap cleanly \*/', 
             r'white-space: normal !important; /* Allow text to wrap cleanly */\n  word-break: break-word !important;', css)

with open('hugo-src/static/css/custom.css', 'w') as f:
    f.write(css)
