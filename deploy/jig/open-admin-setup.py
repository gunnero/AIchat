#!/usr/bin/env python3
"""Private owner-enrollment bridge. Never prints or persists credentials.

Uses the existing root SSH route to jig; does not change SSH configuration.
The server-only bootstrap token is held in memory and attached only to setup
requests. The owner enters their password and authenticator in their browser.
"""
import http.client
import http.server
import socket
import subprocess
import time
import argparse
from pathlib import Path

PUBLIC_LOCAL = '127.0.0.1:8765'
FORWARD = 18765
ORIGIN = 'http://' + PUBLIC_LOCAL


def main():
    parser=argparse.ArgumentParser(description='Open private first-owner enrollment without exposing its token')
    parser.add_argument('--local',action='store_true',help='Use a local development service on port 18765 instead of jig')
    parser.add_argument('--state-dir',default='backoffice/.state',help='Local development state directory')
    args=parser.parse_args()
    # Binding first prevents fetching privileged material if the port is occupied.
    class Handler(http.server.BaseHTTPRequestHandler):
        server_version = 'PrivateEnrollment'

        def log_message(self, *_):
            pass  # No query strings, cookies or secrets in logs.

        def proxy(self):
            if self.headers.get('Host') != PUBLIC_LOCAL:
                self.send_error(403)
                return
            if self.headers.get('Origin') not in (None, ORIGIN):
                self.send_error(403)
                return
            setup = self.path.split('?')[0] == '/backoffice/api/setup'
            if '/api/' in self.path and not setup and not args.local:
                self.send_error(404)
                return
            if self.command != 'GET' and not (self.command == 'POST' and setup) and not args.local:
                self.send_error(405)
                return
            length = int(self.headers.get('Content-Length', '0'))
            if length < 0 or length > 96 * 1024:
                self.send_error(413)
                return
            headers = {'Host': PUBLIC_LOCAL}
            for name in ('Content-Type', 'Origin', 'Cookie', 'X-CSRF-Token', 'Accept'):
                if self.headers.get(name):
                    headers[name] = self.headers[name]
            if setup:
                headers['X-Setup-Token'] = self.server.bootstrap_token
            connection = http.client.HTTPConnection('127.0.0.1', FORWARD, timeout=20)
            try:
                connection.request(self.command, self.path, self.rfile.read(length) if length else None, headers)
                response = connection.getresponse()
                body = response.read()
                self.send_response(response.status)
                for name, value in response.getheaders():
                    if name.lower() not in ('connection', 'transfer-encoding', 'content-length'):
                        self.send_header(name, value)
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except (OSError, http.client.HTTPException):
                self.send_error(502)
            finally:
                connection.close()

        do_GET = proxy
        do_POST = proxy
        do_PUT = proxy

    server = http.server.HTTPServer(('127.0.0.1', 8765), Handler)
    server.bootstrap_token = (Path(args.state_dir)/'bootstrap.token').read_text().strip() if args.local else subprocess.check_output([
        'ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', 'jig',
        'cat /var/lib/ai-kundetypeassistent/bootstrap.token',
    ], stderr=subprocess.DEVNULL, timeout=15).decode().strip()
    if len(server.bootstrap_token) < 40:
        raise RuntimeError('Owner enrollment is unavailable')
    tunnel = None if args.local else subprocess.Popen([
        'ssh', '-o', 'BatchMode=yes', '-o', 'ExitOnForwardFailure=yes',
        '-o', 'ServerAliveInterval=30', '-N', '-L',
        f'127.0.0.1:{FORWARD}:127.0.0.1:8765', 'jig',
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        deadline = time.monotonic() + 15
        while True:
            if (tunnel is not None and tunnel.poll() is not None) or time.monotonic() > deadline:
                raise RuntimeError('The private SSH route could not be opened')
            try:
                with socket.create_connection(('127.0.0.1', FORWARD), timeout=1):
                    break
            except OSError:
                time.sleep(.2)
        print('Private owner setup: http://127.0.0.1:8765/backoffice/?setup=1', flush=True)
        print('Complete enrollment in your browser, then close this helper with Ctrl+C.', flush=True)
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.bootstrap_token = ''
        server.server_close()
        if tunnel is not None:
            tunnel.terminate()
            try:
                tunnel.wait(timeout=5)
            except subprocess.TimeoutExpired:
                tunnel.kill()


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError):
        raise SystemExit('Private setup could not start. Check the existing SSH route, local ports and enrollment availability.') from None
