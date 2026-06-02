import re

with open('hugo-src/static/css/custom.css', 'r') as f:
    css = f.read()

# 1. Fix the mask-image to be 90% instead of 70%
css = re.sub(r'linear-gradient\(to right, rgba\(0,0,0,1\) 70%, rgba\(0,0,0,0\) 100%\)', 
             r'linear-gradient(to right, rgba(0,0,0,1) 92%, rgba(0,0,0,0) 100%)', css)

# 2. Fix the horizontal scroll and max-content width
css = re.sub(r'overflow-x: auto !important;', r'overflow-x: hidden !important;', css)
css = re.sub(r'min-width: max-content !important; /\* Allow width to grow with text \*/', 
             r'/* Removed min-width: max-content to prevent horizontal dragging */', css)
css = re.sub(r'width: max-content !important;', r'/* Removed width: max-content */', css)

with open('hugo-src/static/css/custom.css', 'w') as f:
    f.write(css)
