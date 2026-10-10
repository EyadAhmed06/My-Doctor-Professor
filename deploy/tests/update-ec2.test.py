#!/usr/bin/env python3
"""Run deployment control-flow tests with fake Docker; no real services or secrets."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "update-ec2.sh"
DOCKER = r"""#!/usr/bin/env bash
set -eu
echo "$* | backend=${BACKEND_IMAGE:-}" >> "$TEST_LOG"
case "$1" in
 inspect)
  case "$*" in
   *Config.Env*) printf 'POSTGRES_DB=test\nPOSTGRES_USER=test\nPOSTGRES_PASSWORD=test\n' ;;
   *State.Running*) echo true ;;
   *State.Health*) echo healthy ;;
   *) echo sha256:current ;;
  esac ;;
 info) echo "$TEST_ROOT" ;;
 ps) [[ "$*" == *-aq* ]] && echo existing || true ;;
 image)
  case "$2" in
   inspect) echo sha256:current ;;
   ls) : ;;
  esac ;;
 build) [[ "${FAIL_STAGE:-}" != build ]] || exit 124 ;;
 exec)
  case "$*" in
   *pg_database_size*) echo 1000 ;;
   *pg_dump*) echo mock-backup ;;
   *pg_restore*)
     cat >/dev/null
     if [[ "$*" != *--list* && "${FAIL_STAGE:-}" == restore ]]; then exit 1; fi ;;
   *mdp-candidate-frontend*)
     [[ "${FAIL_STAGE:-}" != frontend ]] || exit 1 ;;
  esac ;;
 run)
  if [[ "$*" == *--entrypoint* ]]; then
   cat >/dev/null
   [[ "$*" != *rehearsal-migrate* || "${FAIL_STAGE:-}" != rehearsal ]] || exit 1
   [[ "$*" != *rehearsal-check* || "${FAIL_STAGE:-}" != schema ]] || exit 1
  fi ;;
 compose)
  if [[ "$*" == *" run "* && "${FAIL_STAGE:-}" == production ]]; then exit 1; fi
  if [[ "$*" == *" up "* && "${BACKEND_IMAGE:-}" == mdp-backend:abcdef12 && "${FAIL_STAGE:-}" == switch ]]; then exit 1; fi ;;
esac
"""
GIT = r"""#!/usr/bin/env bash
case "$*" in
 *branch*--show-current*) echo agent/phase1-interactions ;;
 *rev-parse*--short*) echo abcdef12 ;;
 *rev-parse*) echo abcdef1234567890abcdef1234567890abcdef1234 ;;
esac
"""
TIMEOUT = r"""#!/usr/bin/env bash
[[ "$1" != --kill-after=* ]] || shift
shift
exec "$@"
"""
DF = r"""#!/usr/bin/env bash
printf 'Filesystem blocks used available percent mount\n'
if [[ "${DISK_LOW:-0}" == 1 ]]; then
 printf '/dev/mock 50000000 49999999 1 100%% /\n'
else
 printf '/dev/mock 50000000 100 40000000 1%% /\n'
fi
"""

class DeploymentTests(unittest.TestCase):
    def run_deploy(self, failure="", low_disk=False, memory="1"):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, stack, binaries = root / "source", root / "stack", root / "bin"
            (source / ".git").mkdir(parents=True)
            (source / "deploy").mkdir()
            binaries.mkdir()
            (stack / "config/postgres-certs").mkdir(parents=True)
            for name in ("ca.crt", "server.crt", "server.key"):
                (stack / "config/postgres-certs" / name).write_text("test")
            for name in ("deploy.env", "app.env", "local-images.env"):
                (stack / name).write_text("APP_HOST=example.test\nNEXT_PUBLIC_ANATOMY_ASSET_BASE=https://assets.example.test\n")
            (stack / "compose.production.yml").write_text("services: {}")
            text = SCRIPT.read_text().replace("[[ $EUID -eq 0 ]] || die 'Run with sudo.'", ": # Mock test harness").replace("SOURCE_DIR=/opt/mdp-source", f"SOURCE_DIR={source}").replace("STACK_DIR=/opt/mdp", f"STACK_DIR={stack}")
            path = source / "deploy/update-ec2.sh"
            path.write_text(text)
            for name, body in {"docker": DOCKER, "git": GIT, "timeout": TIMEOUT,
                               "df": DF, "sleep": "#!/bin/sh\nexit 0\n",
                               "curl": "#!/bin/sh\nprintf 'ready'\n"}.items():
                tool = binaries / name
                tool.write_text(body)
                tool.chmod(0o755)
            env = dict(os.environ, PATH=f"{binaries}:{os.environ['PATH']}",
                       TEST_ROOT=str(root), TEST_LOG=str(root / "calls"),
                       FAIL_STAGE=failure, DISK_LOW=str(int(low_disk)),
                       MDP_MIN_AVAILABLE_MEMORY_MB=memory)
            result = subprocess.run(["bash", str(path), "abcdef12"], env=env,
                                    capture_output=True, text=True, timeout=20)
            calls = (root / "calls").read_text() if (root / "calls").exists() else ""
            return result, calls

    def test_success_rehearses_before_production(self):
        result, calls = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("DEPLOYED abcdef12", result.stdout)
        self.assertLess(calls.index("rehearsal-migrate"), calls.index("production-migrate"))
        self.assertIn("rm -fv mdp-rehearsal-db", calls)

    def test_pre_switch_failures_leave_application_running(self):
        for failure in ("build", "restore", "rehearsal", "schema", "frontend", "production"):
            with self.subTest(failure=failure):
                result, calls = self.run_deploy(failure)
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn(" up -d ", calls)
                self.assertNotIn("DEPLOYED", result.stdout)

    def test_failed_migration_preserves_evidence_before_cleanup(self):
        result, calls = self.run_deploy("production")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Migration process exit=", result.stderr)
        self.assertIn("Migration container:", result.stderr)
        self.assertIn("logs --tail 100 mdp-production-migrate-", calls)
        self.assertLess(calls.index("logs --tail 100 mdp-production-migrate-"),
                        calls.rindex("rm -f mdp-production-migrate-"))
        self.assertNotIn("run --rm --name mdp-production-migrate-", calls)

    def test_switch_failure_attempts_rollback(self):
        result, calls = self.run_deploy("switch")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("restoring previous application images", result.stderr)
        self.assertIn("backend=mdp-backend:rollback-", calls)
        self.assertIn("rm -f mdp-production-migrate", calls)

    def test_capacity_guards_block_build(self):
        for options in ({"low_disk": True}, {"memory": "999999999"}):
            with self.subTest(options=options):
                result, calls = self.run_deploy(**options)
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn("build -t", calls)

if __name__ == "__main__":
    unittest.main()
