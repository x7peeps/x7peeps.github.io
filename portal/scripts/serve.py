#!/usr/bin/env python3
"""门户站本地预览：HTTP/1.1 + 多线程 + no-store。

用 python3 -m http.server 会在并发拉 CSS/图片时随机 RST，且默认 HTTP/1.0；
端口被占时它还会静默不监听、那个 URL 照样返回 200（于是你截到别人的站）。
所以这里自己起：先确认端口真的属于自己。
"""

import http.server
import os
import socket
import socketserver
import sys


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main() -> int:
    root = sys.argv[1] if len(sys.argv) > 1 else "portal-public"
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8801

    with socket.socket() as probe:
        if probe.connect_ex(("127.0.0.1", port)) == 0:
            print(f"端口 {port} 已被占用，换一个再试", file=sys.stderr)
            return 1

    os.chdir(root)
    with Server(("127.0.0.1", port), Handler) as httpd:
        print(f"serving {os.getcwd()} on http://127.0.0.1:{port}/", flush=True)
        httpd.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
