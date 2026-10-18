#!/usr/bin/env python3
"""Rehearse the vhost's header boundary on loopback, without the real app.

Run as an unprivileged site user on an Apache host. No public listener, real
credentials, email, database or application requests are used.
"""
import http.client
import http.server
import json
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import threading
import time


class Backend(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        body = json.dumps(self.headers.get_all("X-Forwarded-For")).encode()
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass


with tempfile.TemporaryDirectory(prefix="ai-proxy-boundary-") as folder:
    root = Path(folder)
    backend = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Backend)
    threading.Thread(target=backend.serve_forever, daemon=True).start()
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    include = Path(sys.argv[1]).read_text().replace(
        "127.0.0.1:8765", f"127.0.0.1:{backend.server_port}"
    )
    modules = ["mpm_event", "authz_core", "headers", "proxy", "proxy_http", "alias"]
    config = root / "apache.conf"
    config.write_text(f'ServerRoot /etc/apache2\nServerName synthetic.example.test\n'
                      f'DefaultRuntimeDir "{root}"\nPidFile "{root}/pid"\n'
                      f'ErrorLog "{root}/error.log"\nLogLevel warn\n'
                      + "".join(f'LoadModule {m}_module /usr/lib/apache2/modules/mod_{m}.so\n' for m in modules)
                      + f'Listen 127.0.0.1:{port}\n<VirtualHost 127.0.0.1:{port}>\n'
                      + include + '\n</VirtualHost>\n')
    subprocess.run(["/usr/sbin/apache2", "-t", "-f", str(config)], check=True)
    process = subprocess.Popen(["/usr/sbin/apache2", "-X", "-f", str(config)])
    try:
        for _ in range(50):
            try:
                with socket.create_connection(("127.0.0.1", port), .1):
                    break
            except OSError:
                time.sleep(.1)
        checks = 0
        for peer in ["127.0.0.2", "127.0.0.3"]:
            connection = http.client.HTTPConnection("127.0.0.1", port, source_address=(peer, 0), timeout=5)
            for path in ["/", "/backoffice/health.json"]:
                connection.putrequest("GET", path)
                connection.putheader("X-Forwarded-For", "198.51.100.1")
                connection.putheader("x-FORWARDED-for", "203.0.113.1, 198.51.100.2")
                connection.putheader("Forwarded", "for=198.51.100.3")
                connection.endheaders()
                response = connection.getresponse()
                assert response.status == 200
                assert json.loads(response.read()) == [peer]
                checks += 1
            connection.request("GET", "/backoffice/api/setup")
            response = connection.getresponse()
            assert response.status == 403
            response.read()
            connection.close()
            checks += 1
        print(json.dumps({"proxyBoundaryChecks": checks, "status": "passed"}))
    finally:
        process.terminate()
        process.wait(timeout=10)
        backend.shutdown()
