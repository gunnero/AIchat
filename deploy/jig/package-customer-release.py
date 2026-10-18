"""Package reviewed build outputs only; never include private runtime state."""
from pathlib import Path
import hashlib
import json
import subprocess
import tarfile
from datetime import datetime, timezone

root = Path(__file__).resolve().parents[2]
if subprocess.check_output(["git", "status", "--porcelain"], cwd=root).strip():
    raise SystemExit("Commit reviewed changes before packaging")
revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
output = root / "output" / "releases" / revision
output.mkdir(parents=True, exist_ok=True)
metadata = {"revision": revision, "builtAt": datetime.now(timezone.utc).isoformat()}
backoffice = root / "backoffice"
demo = root / "app/dist/client"
if "/demo/assets/" not in (demo / "index.html").read_text():
    raise SystemExit("Build the demonstration with npm run build:jig-demo first")

def package(name, files, stage):
    contents = {path: source.read_bytes() for path, source in files.items()}
    contents["release.json"] = (json.dumps({**metadata, "stage": stage}, indent=2) + "\n").encode()
    contents["release.sha256"] = "".join(
        hashlib.sha256(data).hexdigest() + "  " + path + "\n"
        for path, data in sorted(contents.items())
    ).encode()
    import io
    archive = output / (name + ".tar.gz")
    with tarfile.open(archive, "w:gz") as target:
        for path, data in sorted(contents.items()):
            info = tarfile.TarInfo(path)
            info.size = len(data)
            info.mode = 0o644
            target.addfile(info, io.BytesIO(data))
    checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
    (output / (name + ".sha256")).write_text(checksum + "  " + archive.name + "\n")
    return {"files": len(contents), "sha256": checksum, "archive": str(archive)}

server_sources = [backoffice / "package.json", backoffice / "package-lock.json"]
server_sources += list((backoffice / "server").glob("*.mjs")) + [backoffice / "server/schema.sql"]
server_sources += [p for p in (backoffice / "dist").rglob("*") if p.is_file()]
server = package("customer", {str(p.relative_to(backoffice)): p for p in server_sources}, "customer-workspace")
synthetic = package("demo", {str(p.relative_to(demo)): p for p in demo.rglob("*") if p.is_file()}, "synthetic-demo")
(output / "packages.json").write_text(json.dumps({**metadata, "customer": server, "demo": synthetic}, indent=2) + "\n")
print(json.dumps({"revision": revision, "customer": server, "demo": synthetic}))
