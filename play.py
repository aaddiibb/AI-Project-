#!/usr/bin/env python3
"""Algo Fighter launcher.

Serves the *project root* (the game loads art from ../art), prints the address a
phone on the same Wi-Fi can open, and opens the game in the PC browser.

Double-click "Play Algo Fighter.bat", or run:  python play.py
Optional environment variables:
  ALGO_FIGHTER_PORT=8766        port to listen on
  ALGO_FIGHTER_NO_BROWSER=1     do not open the PC browser
"""
from __future__ import annotations

import errno
import functools
import http.server
import os
import socket
import sys
import threading
import time
import urllib.request
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = "/game/index.html"
PORT = int(os.environ.get("ALGO_FIGHTER_PORT", "8766"))
HOST = "0.0.0.0"
OPEN_BROWSER = os.environ.get("ALGO_FIGHTER_NO_BROWSER", "") == ""


def url(host: str) -> str:
    return f"http://{host}:{PORT}{GAME}"


def lan_ip() -> str | None:
    """The address of the adapter that carries the default route (normally Wi-Fi)."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.settimeout(0.3)
            s.connect(("8.8.8.8", 80))  # a UDP "connect" only picks a route; nothing is sent
            ip = s.getsockname()[0]
        if ip and not ip.startswith("127."):
            return ip
    except OSError:
        pass
    try:
        for ip in socket.gethostbyname_ex(socket.gethostname())[2]:
            if not ip.startswith(("127.", "169.254.")):
                return ip
    except OSError:
        pass
    return None


def already_running() -> bool:
    """True when the port is already serving this game (e.g. the launcher was opened twice)."""
    try:
        with urllib.request.urlopen(url("127.0.0.1"), timeout=0.8) as r:
            return r.status == 200 and b"Algo Fighter" in r.read(8192)
    except Exception:
        return False


def banner(ip: str | None, note: str | None = None) -> None:
    print()
    print("  ============================================================")
    print("   ALGO FIGHTER")
    print("  ============================================================")
    print(f"   This PC : {url('127.0.0.1')}")
    if ip:
        print(f"   Phone   : {url(ip)}")
    else:
        print("   Phone   : (no Wi-Fi address found - is this PC online?)")
    print("  ------------------------------------------------------------")
    print("   Put your phone on the same Wi-Fi and open the Phone link.")
    print("   Keep this window open while playing.  Ctrl+C stops the server.")
    if note:
        print()
        print(f"   {note}")
    print("  ============================================================")
    print(flush=True)


def open_game_later() -> None:
    time.sleep(0.8)
    try:
        webbrowser.open(url("127.0.0.1"))
    except Exception:
        pass


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"  # keep-alive: many small asset requests load faster

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")  # edits show up on the next reload
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # keep the banner visible; errors still surface as browser errors


def main() -> int:
    if not os.path.isfile(os.path.join(HERE, "game", "index.html")):
        print("\n   game/index.html was not found next to play.py.")
        print("   Keep play.py and 'Play Algo Fighter.bat' in the project root.\n")
        return 1

    ip = lan_ip()
    if already_running():
        banner(ip, "The server is already running." + (" Opening the game." if OPEN_BROWSER else ""))
        if OPEN_BROWSER:
            threading.Thread(target=open_game_later, daemon=True).start()
            time.sleep(1.2)
        return 0

    handler = functools.partial(Handler, directory=HERE)
    try:
        httpd = http.server.ThreadingHTTPServer((HOST, PORT), handler)
    except OSError as e:
        if e.errno in (errno.EADDRINUSE, 10048):
            print(f"\n   Port {PORT} is already in use by another program.")
            print(f"   Close it, or run:  set ALGO_FIGHTER_PORT=8767  then start the .bat again.\n")
        else:
            print(f"\n   Could not start the server: {e}\n")
        return 1

    banner(ip)
    if OPEN_BROWSER:
        threading.Thread(target=open_game_later, daemon=True).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n   Server stopped.")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
