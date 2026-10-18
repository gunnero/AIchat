#!/usr/bin/env python3
"""Private, scoped backup/monitor jobs. Never accepts request or chat input."""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import socket
import ssl
import stat
import subprocess
import tempfile
import time
import uuid
import urllib.request

UTC = dt.timezone.utc
APP = "https://ai.igurl.dk"


class Failure(Exception):
    pass


def command(args, **kwargs):
    try:
        return subprocess.run(args, check=True, capture_output=True, timeout=240, **kwargs).stdout
    except (subprocess.SubprocessError, OSError):
        raise Failure("command_failed") from None


def atomic_json(path, value):
    path = Path(path)
    temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    try:
        with temporary.open("x") as stream:
            os.chmod(temporary, 0o600)
            json.dump(value, stream, separators=(",", ":"))
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    finally:
        temporary.unlink(missing_ok=True)


def sha256(path):
    value = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def private_read(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "rb") as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077:
            raise Failure("unsafe_private_file")
        return stream.read()


def snapshot_journal(source, target):
    raw = private_read(source)
    if raw and not raw.endswith(b"\n"):
        raise Failure("incomplete_deletion_journal")
    for line in raw.splitlines():
        row = json.loads(line)
        if set(row) != {"conversationId", "customerId", "projectId", "deletedAt"}:
            raise Failure("invalid_deletion_journal")
        if any(not isinstance(row[k], str) or not re.fullmatch(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", row[k]) for k in ["conversationId", "customerId", "projectId"]):
            raise Failure("invalid_deletion_journal")
        if type(row["deletedAt"]) is not int or row["deletedAt"] < 0:
            raise Failure("invalid_deletion_journal")
    Path(target).write_bytes(raw)
    os.chmod(target, 0o600)


def require_volume(config):
    data = json.loads(command(["/usr/bin/findmnt", "--json", "--target", config["mount"], "--output", "TARGET,UUID"]))["filesystems"][0]
    if data["target"] != config["mount"] or data["uuid"] != config["mountUuid"]:
        raise Failure("backup_volume_unavailable")
    usage = shutil.disk_usage(config["mount"])
    if usage.free < 10 * 1024**3 or usage.used / usage.total >= .90:
        raise Failure("backup_volume_space_low")


def encrypt_archive(source, files, destination, recipient, age="/usr/bin/age"):
    partial = Path(str(destination) + ".partial")
    tar = subprocess.Popen(["/usr/bin/tar", "-C", str(source), "-cf", "-", "--", *files], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    encrypted = None
    try:
        encrypted = subprocess.Popen([age, "--encrypt", "-r", recipient, "-o", str(partial)], stdin=tar.stdout, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        tar.stdout.close()
        encrypted.communicate(timeout=240)
        tar.communicate(timeout=10)
        if encrypted.returncode or tar.returncode:
            raise Failure("encryption_failed")
        os.chmod(partial, 0o600)
        with partial.open("rb") as stream:
            if stream.read(22) != b"age-encryption.org/v1\n":
                raise Failure("invalid_encrypted_archive")
            os.fsync(stream.fileno())
        os.replace(partial, destination)
        return {"sha256": sha256(destination), "bytes": Path(destination).stat().st_size}
    finally:
        for process in [encrypted, tar]:
            if process and process.poll() is None:
                process.kill()
                process.wait()
        partial.unlink(missing_ok=True)


def retained_names(names, kind):
    pattern = re.compile(rf"^{kind}-(\d{{8}}T\d{{6}}Z)-[0-9a-f]{{8}}\.tar\.age$")
    ordered = sorted((n for n in names if pattern.fullmatch(n)), reverse=True)
    keep = set(ordered[:48 if kind == "backup" else 288])
    days, weeks = set(), set()
    for name in ordered:
        stamp = dt.datetime.strptime(pattern.fullmatch(name)[1], "%Y%m%dT%H%M%SZ")
        day, week = stamp.date(), stamp.isocalendar()[:2]
        if day not in days and len(days) < (14 if kind == "backup" else 32):
            keep.add(name)
            days.add(day)
        if kind == "backup" and week not in weeks and len(weeks) < 8:
            keep.add(name)
            weeks.add(week)
    return keep


def publish(config, kind, source, files):
    require_volume(config)
    repository = Path(config["repository"])
    if repository.resolve() != Path(config["mount"]) / "ai-kundetypeassistent-backups":
        raise Failure("invalid_backup_directory")
    repository.mkdir(mode=0o700, exist_ok=True)
    if repository.is_symlink() or repository.stat().st_mode & 0o077:
        raise Failure("unsafe_backup_directory")
    name = f'{kind}-{dt.datetime.now(UTC):%Y%m%dT%H%M%SZ}-{uuid.uuid4().hex[:8]}.tar.age'
    archive = repository / name
    receipt = encrypt_archive(source, files, archive, config["recipient"])
    receipt.update({"file": name, "createdAt": int(time.time()), "kind": kind})
    atomic_json(str(archive) + ".json", receipt)
    if sha256(archive) != receipt["sha256"]:
        raise Failure("archive_checksum_failed")
    # Only owned, recognised pairs are eligible; unrelated files are untouched.
    names = [p.name for p in repository.iterdir() if p.is_file() and not p.is_symlink() and Path(str(p) + ".json").is_file()]
    keep = retained_names(names, kind)
    for name in names:
        if name.startswith(kind + "-") and re.fullmatch(rf"{kind}-\d{{8}}T\d{{6}}Z-[0-9a-f]{{8}}\.tar\.age", name) and name not in keep:
            (repository / name).unlink()
            (repository / (name + ".json")).unlink()
    return receipt


def worker(config, user, script, args, env=None):
    return command(["/usr/sbin/runuser", "-u", user, "--", "/usr/bin/env", *(f"{k}={v}" for k, v in (env or {}).items()), config["node"], str(Path(config["appRoot"]) / "server" / script), *map(str, args)])


def backup(config, work):
    user = pwd.getpwnam("ai-backup")
    os.chown(work, user.pw_uid, user.pw_gid)
    source = work / "source"
    source.mkdir(mode=0o700)
    key = private_read(config["vaultFile"])
    if len(key) != 32:
        raise Failure("invalid_vault_key")
    (source / "vault.key").write_bytes(key)
    snapshot_journal(Path(config["stateDir"]) / "deletions.jsonl", source / "deletions.jsonl")
    for path in [source, *source.iterdir()]:
        os.chown(path, user.pw_uid, user.pw_gid)
        if path.is_file():
            os.chmod(path, 0o600)
    destination = work / "backup"
    worker(config, "ai-backup", "backup.mjs", [destination], {"STATE_DIR": str(source), "BACKUP_DATABASE_URL": "postgresql://ai_backup@localhost/ai_customer?host=/run/postgresql-ai&port=5433"})
    if private_read(config["vaultFile"]) != key:
        raise Failure("vault_changed_during_backup")
    # Capture again after pg_dump, so concurrent deletions are included.
    snapshot_journal(Path(config["stateDir"]) / "deletions.jsonl", destination / "deletions.jsonl")
    manifest = json.loads((destination / "manifest.json").read_text())
    manifest["files"]["deletions.jsonl"] = sha256(destination / "deletions.jsonl")
    atomic_json(destination / "manifest.json", manifest)
    for name, digest in manifest["files"].items():
        if name not in ["vault.key", "database.dump", "deletions.jsonl"] or sha256(destination / name) != digest:
            raise Failure("backup_checksum_failed")
    command(["/usr/bin/pg_restore", "--list", str(destination / "database.dump")])
    return publish(config, "backup", destination, ["database.dump", "vault.key", "deletions.jsonl", "manifest.json"])


def journal(config, work):
    snapshot_journal(Path(config["stateDir"]) / "deletions.jsonl", work / "deletions.jsonl")
    return publish(config, "journal", work, ["deletions.jsonl"])


def reset_drill_database(name):
    if name not in ["ai_ops_probe", "ai_ops_restore"]:
        raise Failure("invalid_drill_target")
    base = ["/usr/sbin/runuser", "-u", "postgres", "--", "/usr/bin/psql", "-h", "/run/postgresql-ai", "-p", "5433", "-d", "postgres", "-X", "-At", "-v", "ON_ERROR_STOP=1"]
    marker = command([*base, "-c", f"SELECT coalesce(shobj_description(oid,'pg_database'),'') FROM pg_database WHERE datname='{name}'"]).decode().strip()
    if marker != "AI OPERATIONS SYNTHETIC ONLY":
        raise Failure("unmarked_drill_database")
    command([*base, "-c", f'DROP DATABASE {name} WITH (FORCE)'])
    command([*base, "-c", f'CREATE DATABASE {name} OWNER ai_owner'])
    command([*base, "-c", f"COMMENT ON DATABASE {name} IS 'AI OPERATIONS SYNTHETIC ONLY'; REVOKE ALL ON DATABASE {name} FROM PUBLIC; GRANT CONNECT ON DATABASE {name} TO ai_migrator"])


def drill(config, work):
    user = pwd.getpwnam("ai-migrate")
    os.chown(work, user.pw_uid, user.pw_gid)
    try:
        for name in ["ai_ops_probe", "ai_ops_restore"]:
            reset_drill_database(name)
        result = json.loads(worker(config, "ai-migrate", "operations-drill.mjs", [work]))
        if result != {"synthetic": True, "restored": True, "deletedChatAbsent": True, "mfaPreserved": True, "ownerProtected": True}:
            raise Failure("restore_drill_failed")
        return result
    finally:
        for name in ["ai_ops_probe", "ai_ops_restore"]:
            reset_drill_database(name)


def read_json(path, default=None):
    try:
        return json.loads(Path(path).read_text())
    except FileNotFoundError:
        return default


def monitor(config):
    issues = []
    now = int(time.time())
    for service in ["ai-backoffice", "postgresql@18-ai", "apache2"]:
        try:
            command(["/usr/bin/systemctl", "is-active", "--quiet", service])
        except Failure:
            issues.append("service_" + service.replace("@", "_") + "_down")
    for url, code in [(APP + "/backoffice/health.json", "public_health"), ("http://127.0.0.1:8765/backoffice/health.json", "local_health")]:
        try:
            with urllib.request.urlopen(url, timeout=10) as response:
                data = json.load(response)
                if data.get("status") != "ok" or data.get("application") != "kundetypeassistent-backoffice":
                    raise ValueError()
        except Exception:
            issues.append(code + "_failed")
    for label, path in [("system", "/"), ("backup", config["mount"])]:
        try:
            usage = shutil.disk_usage(path)
            if usage.free < 10 * 1024**3 or usage.used / usage.total >= .85:
                issues.append(label + "_disk_low")
        except OSError:
            issues.append(label + "_disk_unavailable")
    try:
        require_volume(config)
    except Failure as error:
        issues.append(str(error))
    for kind, maximum in [("backup", 90 * 60), ("journal", 15 * 60), ("drill", 8 * 86400)]:
        try:
            status = read_json(Path(config["operationsState"]) / (kind + ".json"), {})
            if status.get("success") is not True or now - status.get("lastSuccessAt", 0) > maximum:
                issues.append(kind + "_failed_or_stale")
            if kind in ["backup", "journal"] and status.get("success") is True:
                receipt = status["receipt"]
                name = receipt["file"]
                if not re.fullmatch(rf"{kind}-\d{{8}}T\d{{6}}Z-[0-9a-f]{{8}}\.tar\.age", name):
                    raise ValueError()
                archive = Path(config["repository"]) / name
                if archive.is_symlink() or archive.stat().st_size != receipt["bytes"]:
                    raise ValueError()
        except (ValueError, TypeError, KeyError, OSError):
            issues.append(kind + "_status_or_archive_invalid")
    try:
        metrics = read_json(Path(config["stateDir"]) / "metrics.json", {})
        if now - metrics.get("updatedAt", 0) / 1000 > 180:
            issues.append("metrics_stale")
        if metrics.get("requests", 0) >= 20 and metrics.get("serverErrors", 0) / metrics["requests"] > .05:
            issues.append("http_server_errors_high")
        if metrics.get("requests", 0) >= 50 and metrics.get("limited", 0) / metrics["requests"] > .20:
            issues.append("http_rate_limits_high")
        if metrics.get("requests", 0) >= 20 and (metrics.get("p95UpperBoundMs") is None or metrics["p95UpperBoundMs"] >= 5000):
            issues.append("http_server_latency_high")
    except (ValueError, TypeError):
        issues.append("metrics_invalid")
    try:
        with socket.create_connection(("ai.igurl.dk", 443), timeout=10) as raw:
            with ssl.create_default_context().wrap_socket(raw, server_hostname="ai.igurl.dk") as tls:
                expires = ssl.cert_time_to_seconds(tls.getpeercert()["notAfter"])
                if expires - time.time() < 14 * 86400:
                    issues.append("certificate_expiry_near")
    except Exception:
        issues.append("certificate_check_failed")
    return sorted(set(issues))


def transition(previous, issues, now):
    previous = previous or {}
    count = previous.get("consecutive", 0) + 1 if issues == previous.get("observed") else 1
    active = previous.get("active", [])
    event = None
    if issues and count >= 2 and (issues != active or now - previous.get("notifiedAt", 0) >= 6 * 3600):
        event = "problem"
    elif not issues and count >= 2 and active:
        event = "recovered"
    return {**previous, "checkedAt": now, "observed": issues, "consecutive": count}, event


def notify(config, event, issues):
    subject = "[AI operations] " + {"test": "TEST alert", "problem": "Action needed", "recovered": "Recovered"}[event]
    text = ("TEST ONLY — checking operational email delivery.\n" if event == "test" else "Operational status change.\n")
    text += "Service: https://ai.igurl.dk\nTime: " + dt.datetime.now(UTC).isoformat() + "\n"
    text += "Checks: " + (", ".join(issues) if issues else "healthy") + "\nNo customer content or credentials are included.\n"
    result = json.loads(command(["/usr/sbin/runuser", "-u", "ai-kundetype", "--", config["node"], str(Path(config["appRoot"]) / "server/operations-alert.mjs")], input=json.dumps({"to": config["alertTo"], "subject": subject, "text": text}).encode()))
    if result.get("accepted") is not True:
        raise Failure("alert_not_accepted")
    return result


def run_monitor(config):
    path = Path(config["operationsState"]) / "monitor.json"
    issues = monitor(config)
    state, event = transition(read_json(path), issues, int(time.time()))
    if event:
        try:
            notify(config, event, issues)
            state.update(active=issues, notifiedAt=int(time.time()), alertAccepted=True)
        except Failure:
            state["alertAccepted"] = False
    atomic_json(path, state)
    return {"healthy": not issues, "issues": issues, "alertEvent": event}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("job", choices=["backup", "journal", "drill", "monitor", "test-alert"])
    parser.add_argument("--config", default="/etc/ai-kundetypeassistent/operations.json")
    args = parser.parse_args()
    os.umask(0o077)
    if os.geteuid() != 0:
        raise Failure("operator_required")
    config = json.loads(private_read(args.config))
    if os.stat(args.config).st_uid != 0:
        raise Failure("unsafe_operations_config")
    state = Path(config["operationsState"])
    state.mkdir(mode=0o700, exist_ok=True)
    with (state / (args.job + ".lock")).open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        if args.job == "monitor":
            print(json.dumps(run_monitor(config)))
            return
        if args.job == "test-alert":
            result = notify(config, "test", [])
            atomic_json(state / "test-alert.json", {"createdAt": int(time.time()), **result})
            print(json.dumps({"testAlertAccepted": True, "queueId": result.get("queueId")}))
            return
        path = state / (args.job + ".json")
        result = read_json(path, {})
        try:
            if args.job in ["backup", "journal"]:
                require_volume(config)
            with tempfile.TemporaryDirectory(prefix=args.job + "-", dir=config["runtimeDir"]) as folder:
                receipt = globals()[args.job](config, Path(folder))
            result.update(success=True, lastSuccessAt=int(time.time()), receipt=receipt)
            result.pop("failure", None)
        except Exception as error:
            result.update(success=False, failure=str(error) if isinstance(error, Failure) else "job_failed")
        result["lastAttemptAt"] = int(time.time())
        atomic_json(path, result)
        print(json.dumps({"job": args.job, "success": result["success"]}))
        if not result["success"]:
            raise SystemExit(1)


if __name__ == "__main__":
    try:
        main()
    except Failure as error:
        print(json.dumps({"success": False, "failure": str(error)}))
        raise SystemExit(1)
    except Exception:
        # Operational logs must never expose a file's contents or child output.
        print(json.dumps({"success": False, "failure": "operations_failed"}))
        raise SystemExit(1)
