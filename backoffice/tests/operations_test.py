import datetime as dt
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

path = Path(__file__).resolve().parents[2] / "deploy/jig/operations.py"
spec = importlib.util.spec_from_file_location("operations", path)
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)


class OperationsTest(unittest.TestCase):
    def test_workers_are_separate_restricted_units_with_fixed_identities(self):
        args = ops.user_command("ai-backup", ["/usr/bin/id"], "/run/ai-kundetype-operations/backup-test")
        self.assertEqual(args[0], "/usr/bin/systemd-run")
        self.assertIn("--uid=ai-backup", args)
        for prop in ["NoNewPrivileges=true", "CapabilityBoundingSet=", "RestrictSUIDSGID=true", "ProtectSystem=strict", "ReadWritePaths=/run/ai-kundetype-operations/backup-test"]:
            self.assertIn(prop, args)
        with self.assertRaisesRegex(ops.Failure, "invalid_worker_identity"):
            ops.user_command("root", ["/usr/bin/id"])
        for path in ["/", "/var/lib/ai-kundetypeassistent", "/run/ai-kundetype-operations"]:
            with self.assertRaisesRegex(ops.Failure, "invalid_worker_directory"):
                ops.user_command("ai-backup", ["/usr/bin/id"], path)

    def test_missing_mount_never_writes_to_underlying_system_disk(self):
        with tempfile.TemporaryDirectory() as name:
            cfg = {"mount": name, "mountUuid": "expected-volume", "repository": name + "/ai-kundetypeassistent-backups"}
            with patch.object(ops, "command", return_value=json.dumps({"filesystems": [{"target": "/", "uuid": "system-volume"}]}).encode()):
                with self.assertRaisesRegex(ops.Failure, "backup_volume_unavailable"):
                    ops.publish(cfg, "backup", name, [])
            self.assertFalse(Path(cfg["repository"]).exists())

    def test_low_capacity_stops_backups(self):
        with patch.object(ops, "command", return_value=b'{"filesystems":[{"target":"/volume","uuid":"correct"}]}'), patch.object(ops.shutil, "disk_usage", return_value=shutil._ntuple_diskusage(100, 95, 5)):
            with self.assertRaisesRegex(ops.Failure, "space_low"):
                ops.require_volume({"mount": "/volume", "mountUuid": "correct"})

    def test_complete_journal_only_and_reject_symlinks(self):
        with tempfile.TemporaryDirectory() as name:
            source, target = Path(name) / "journal", Path(name) / "snapshot"
            row = {"conversationId": "a"*8 + "-" + "b"*4 + "-" + "c"*4 + "-" + "d"*4 + "-" + "e"*12, "customerId": "1"*8 + "-" + "2"*4 + "-" + "3"*4 + "-" + "4"*4 + "-" + "5"*12, "projectId": "6"*8 + "-" + "7"*4 + "-" + "8"*4 + "-" + "9"*4 + "-" + "0"*12, "deletedAt": 1234}
            source.write_text(json.dumps(row) + "\n"); source.chmod(0o600)
            ops.snapshot_journal(source, target)
            self.assertEqual(source.read_bytes(), target.read_bytes())
            source.write_text(json.dumps(row))
            with self.assertRaisesRegex(ops.Failure, "incomplete"):
                ops.snapshot_journal(source, target)
            link = Path(name) / "symlink"; link.symlink_to(source)
            with self.assertRaises(OSError):
                ops.private_read(link)

    def test_retention_preserves_recent_daily_weekly_and_unknown_files_are_ineligible(self):
        start = dt.datetime(2026, 10, 18, tzinfo=dt.timezone.utc)
        names = [f'backup-{start - dt.timedelta(hours=i):%Y%m%dT%H%M%SZ}-{i:08x}.tar.age' for i in range(24*100)]
        retained = ops.retained_names([*names, "other-site.tar.age", "backup-unrecognised.tar.age"], "backup")
        self.assertTrue(set(names[:48]).issubset(retained))
        self.assertLessEqual(len(retained), 48 + 14 + 8)
        self.assertTrue(any(name in retained for name in names[24*40:24*60]))
        self.assertNotIn("other-site.tar.age", retained)

    def test_alerts_debounce_suppress_duplicates_remind_and_recover(self):
        state, event = ops.transition(None, ["public_health_failed"], 100)
        self.assertIsNone(event)
        state, event = ops.transition(state, ["public_health_failed"], 160)
        self.assertEqual(event, "problem")
        state.update(active=["public_health_failed"], notifiedAt=160)
        state, event = ops.transition(state, ["public_health_failed"], 220)
        self.assertIsNone(event)
        state, event = ops.transition(state, ["public_health_failed"], 160 + 6*3600)
        self.assertEqual(event, "problem")
        state, event = ops.transition(state, [], 30000)
        self.assertIsNone(event)
        state, event = ops.transition(state, [], 30060)
        self.assertEqual(event, "recovered")

    def test_unmarked_restore_database_cannot_be_dropped(self):
        with patch.object(ops, "command", return_value=b"unrelated database\n") as call:
            with self.assertRaisesRegex(ops.Failure, "unmarked"):
                ops.reset_drill_database("ai_ops_restore")
            self.assertEqual(call.call_count, 1)
        with self.assertRaisesRegex(ops.Failure, "invalid_drill_target"):
            ops.reset_drill_database("ai_customer")

    def test_failed_email_is_retried_without_marking_the_alert_delivered(self):
        with tempfile.TemporaryDirectory() as name:
            cfg = {"operationsState": name}
            status = Path(name) / "monitor.json"
            with patch.object(ops, "monitor", return_value=["backup_failed_or_stale"]), patch.object(ops, "notify", side_effect=ops.Failure("command_failed")) as send:
                ops.run_monitor(cfg)
                ops.run_monitor(cfg)
                ops.run_monitor(cfg)
                self.assertEqual(send.call_count, 2)
                failed = json.loads(status.read_text())
                self.assertFalse(failed["alertAccepted"])
                self.assertNotIn("active", failed)
            with patch.object(ops, "monitor", return_value=["backup_failed_or_stale"]), patch.object(ops, "notify", return_value={"accepted": True}) as send:
                ops.run_monitor(cfg)
                ops.run_monitor(cfg)
                self.assertEqual(send.call_count, 1)
                self.assertEqual(json.loads(status.read_text())["active"], ["backup_failed_or_stale"])

    def test_real_age_encryption_roundtrip_and_tamper_rejection(self):
        age, keygen = shutil.which("age"), shutil.which("age-keygen")
        if not age or not keygen:
            self.fail("age and age-keygen are required for backup verification")
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            identity = root / "identity.txt"
            subprocess.run([keygen, "-o", str(identity)], check=True, capture_output=True)
            public = subprocess.check_output([keygen, "-y", str(identity)], text=True).strip()
            (root / "synthetic.txt").write_text("SYNTHETIC_RECOVERY_CANARY")
            archive = root / "test.age"
            receipt = ops.encrypt_archive(root, ["synthetic.txt"], archive, public, age)
            self.assertEqual(receipt["sha256"], ops.sha256(archive))
            self.assertNotIn(b"SYNTHETIC_RECOVERY_CANARY", archive.read_bytes())
            recovered = subprocess.check_output([age, "-d", "-i", str(identity), str(archive)])
            self.assertIn(b"SYNTHETIC_RECOVERY_CANARY", recovered)
            corrupt = bytearray(archive.read_bytes()); corrupt[-1] ^= 1
            archive.write_bytes(corrupt)
            self.assertNotEqual(subprocess.run([age, "-d", "-i", str(identity), str(archive)], capture_output=True).returncode, 0)


if __name__ == "__main__":
    unittest.main()
