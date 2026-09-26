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
