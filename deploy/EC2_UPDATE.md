# Reusable EC2 update

This script is for the existing `/opt/mdp-source` Git checkout and `/opt/mdp` production stack. It must run as root. The first argument is an optional expected commit prefix; supply it for a pinned release.

## Install once on EC2 through SSM

```bash
sudo -i
cd /opt/mdp-source
git -c safe.directory=/opt/mdp-source fetch origin agent/phase1-interactions
git -c safe.directory=/opt/mdp-source checkout agent/phase1-interactions
git -c safe.directory=/opt/mdp-source merge --ff-only origin/agent/phase1-interactions
install -m 0750 /opt/mdp-source/deploy/update-ec2.sh /opt/mdp/update-ec2.sh
install -m 0750 /opt/mdp-source/deploy/update-ec2-first.sh /opt/mdp/update-ec2-first.sh
install -m 0750 /opt/mdp-source/deploy/update-ec2-legacy.sh /opt/mdp/update-ec2-legacy.sh
```

## Run for each update

```bash
sudo /opt/mdp/update-ec2.sh
```

For a known release, pass the expected SHA (the script stops if the remote branch points elsewhere):

```bash
sudo /opt/mdp/update-ec2.sh 803c7c5
```

The script copies its latest version into `/opt/mdp/update-ec2.sh` after a successful deployment. It backs up PostgreSQL before migrations, preserves prior backend/frontend image IDs under timestamped rollback tags, builds both images before switching either service, verifies backend and frontend health in sequence, checks the public site, and updates both image env files only after success. If the application switch fails, it attempts to restore the prior images and env files. A database migration is **not** automatically reversed; the database dump path is printed. If the frontend build cannot find `NEXT_PUBLIC_ANATOMY_ASSET_BASE` in the environment or deployment env files, the script reads the GitHub Actions variable using `gh`; otherwise it stops before modifying production.

## Two supported deployment entry points

Both commands use the **same guarded deployment engine** and accept the optional expected commit prefix:

- **Current:** `sudo /opt/mdp-source/deploy/update-ec2.sh <commit-prefix>`
- **First/original command (supported):** `sudo /opt/mdp-source/deploy/update-ec2-first.sh <commit-prefix>`
- **Legacy alias (supported):** `sudo /opt/mdp-source/deploy/update-ec2-legacy.sh <commit-prefix>`

The legacy entry point delegates to the hardened current script; it does **not** bypass preflight, backup, isolated migration rehearsal, diagnostics, or rollback protection. The repository also preserves the initial September deployment implementation in `deploy/update-ec2-original.reference.sh` for audit/history **only**. Do not run the reference script against production: it does not contain later safeguards.

These commands operate on the server's existing `/opt/mdp-source` checkout and require its deployment branch to be checked out. Do not assume a GitHub PR automatically updates files on EC2. Use the deployed script version appropriate for the checkout and pin the SHA; deploy only after all required checks pass. The legacy alias cannot repair a host-side SIGKILL or an SSM session termination by itself.

To validate both script entry points without touching production, run `bash -n deploy/update-ec2.sh deploy/update-ec2-first.sh deploy/update-ec2-legacy.sh` in CI. Review deployment logs under `/opt/mdp/data/deployment-logs` after failures.
