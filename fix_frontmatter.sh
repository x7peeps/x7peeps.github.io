#!/bin/bash
FILE="安全/应急响应/0x03取证分析/页面篡改分析/页面篡改分析-两次js加密案例/index.md"
if ! grep -q "^---" "$FILE"; then
    echo "Adding Front Matter..."
    cat << 'FM' > temp.md
---
title: "页面篡改分析-两次js加密案例"
parent: "0x03取证分析"
---
FM
    cat "$FILE" >> temp.md
    mv temp.md "$FILE"
fi
