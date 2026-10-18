#!/usr/bin/env python3
"""Private owner-enrollment bridge; no credentials are printed or persisted.

jig intentionally disables TCP forwarding. Remote mode uses the existing SSH
command route to perform a fixed loopback HTTP request. It changes no SSH policy.
Password/MFA entry remains an owner action in the local browser.
"""
import argparse
import base64
import http.client
import http.server
import json
import shlex
import subprocess
from pathlib import Path

LOCAL_HOST = '127.0.0.1:8765'
LOCAL_ORIGIN = 'http://' + LOCAL_HOST
REMOTE_HTTP = '''import sys,json,base64,http.client
v=json.load(sys.stdin)
c=http.client.HTTPConnection('127.0.0.1',8765,timeout=20)
c.request(v['method'],v['path'],base64.b64decode(v['body']),v['headers'])
r=c.getresponse()
b=r.read(2*1024*1024+1)
if len(b)>2*1024*1024: raise RuntimeError('Response too large')
print(json.dumps({'status':r.status,'headers':r.getheaders(),'body':base64.b64encode(b).decode()}))
c.close()
'''
SSH_OPTIONS = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', 'jig']


def main():
    parser = argparse.ArgumentParser(description='Private first-owner enrollment')
    parser.add_argument('--local', action='store_true', help='Use a local development service on port 18765')
    parser.add_argument('--state-dir', default='backoffice/.state')
    args = parser.parse_args()

    class Handler(http.server.BaseHTTPRequestHandler):
        server_version = 'PrivateEnrollment'

        def log_message(self, *_):
            pass

        def proxy(self):
            if self.headers.get('Host') != LOCAL_HOST or self.headers.get('Origin') not in (None, LOCAL_ORIGIN):
                self.send_error(403)
                return
            setup = self.path.split('?')[0] == '/backoffice/api/setup'
            if '/api/' in self.path and not setup and not args.local:
                self.send_error(404)
                return
            if self.command != 'GET' and not (self.command == 'POST' and setup) and not args.local:
                self.send_error(405)
                return
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if length < 0 or length > 96 * 1024:
                    self.send_error(413)
                    return
                body = self.rfile.read(length) if length else b''
                headers = {'Host': LOCAL_HOST}
                for name in ('Content-Type', 'Origin', 'Cookie', 'X-CSRF-Token', 'Accept'):
                    if self.headers.get(name):
                        headers[name] = self.headers[name]
                if setup:
                    headers['X-Setup-Token'] = self.server.bootstrap_token
                if args.local:
                    connection = http.client.HTTPConnection('127.0.0.1', 18765, timeout=20)
                    try:
                        connection.request(self.command, self.path, body, headers)
                        response = connection.getresponse()
                        status, response_headers, response_body = response.status, response.getheaders(), response.read()
                    finally:
                        connection.close()
                else:
                    payload = {'method': self.command, 'path': self.path, 'headers': headers, 'body': base64.b64encode(body).decode()}
                    result = subprocess.run(SSH_OPTIONS + ['python3 -c ' + shlex.quote(REMOTE_HTTP)], input=json.dumps(payload).encode(), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=30, check=True)
                    response = json.loads(result.stdout)
                    status, response_headers, response_body = response['status'], response['headers'], base64.b64decode(response['body'])
                self.send_response(status)
                for name, value in response_headers:
                    if name.lower() not in ('connection', 'transfer-encoding', 'content-length'):
                        self.send_header(name, value)
                self.send_header('Content-Length', str(len(response_body)))
                self.end_headers()
                self.wfile.write(response_body)
            except (OSError, ValueError, http.client.HTTPException, subprocess.SubprocessError):
                self.send_error(502)

        do_GET = proxy
        do_POST = proxy
        do_PUT = proxy

    server = http.server.HTTPServer(('127.0.0.1', 8765), Handler)
    server.timeout = 20
    server.bootstrap_token = (Path(args.state_dir) / 'bootstrap.token').read_text().strip() if args.local else subprocess.check_output(SSH_OPTIONS + ['cat /var/lib/ai-kundetypeassistent/bootstrap.token'], stderr=subprocess.DEVNULL, timeout=15).decode().strip()
    if len(server.bootstrap_token) < 40:
        raise RuntimeError('Owner enrollment unavailable')
    try:
        print('Private owner setup: http://127.0.0.1:8765/backoffice/?setup=1', flush=True)
        print('Complete enrollment in your browser, then close this helper with Ctrl+C.', flush=True)
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.bootstrap_token = ''
        server.server_close()


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError):
        raise SystemExit('Private setup could not start. Check the existing SSH route, local port and enrollment availability.') from None
