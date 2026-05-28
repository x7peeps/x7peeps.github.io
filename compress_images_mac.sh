#!/bin/bash
echo "Finding images larger than 1MB and converting to JPG..."
find hugo-src/content -type f -size +1M \( -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" \) | while read img; do
    echo "Processing: $img"
    # Get the file extension
    ext="${img##*.}"
    # Target file name (replace extension with jpg)
    target="${img%.*}.jpg"
    
    # Use sips (built-in macOS tool) to resize if wider than 1920px and convert to JPEG
    # We set compression quality to 'normal'
    sips -Z 1920 -s format jpeg -s formatOptions normal "$img" --out "$target" > /dev/null
    
    if [ "$img" != "$target" ]; then
        rm "$img"
        echo "  -> Converted to $target and compressed"
    else
        echo "  -> Compressed in place"
    fi
done
echo "Done compressing images!"
