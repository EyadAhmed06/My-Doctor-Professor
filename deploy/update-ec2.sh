#!/usr/bin/env bash
# Run as root on the existing My Doctor Professor EC2 host.
set -Eeuo pipefail

SOURCE_DIR=/opt/mdp-source
STACK_DIR=/opt/mdp
BRANCH=agent/phase1-interactions
COMPOSE_FILE="$STACK_DIR/compose.production.yml"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
EXPECTED_SHA="${1:-}"
mutation_started=0

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[[ $EUID -eq 0 ]] || die 'Run with sudo.'
[[ $# -le 1 ]] || die 'Usage: sudo /opt/mdp/update-ec2.sh [expected-commit-prefix]'
[[ -d $SOURCE_DIR/.git && -f $COMPOSE_FILE ]] || die 'Expected /opt/mdp-source and /opt/mdp/compose.production.yml.'
for bin in docker git curl sed awk; do command -v "$bin" >/dev/null || die "Missing $bin"; done
for file in deploy.env app.env local-images.env; do
  [[ -f $STACK_DIR/$file ]] || die "Missing $STACK_DIR/$file"
done

cd "$SOURCE_DIR"
git -c safe.directory="$SOURCE_DIR" diff --quiet || die 'Source worktree has uncommitted changes.'
git -c safe.directory="$SOURCE_DIR" diff --cached --quiet || die 'Source index has uncommitted changes.'
[[ -z $(git -c safe.directory="$SOURCE_DIR" ls-files --others --exclude-standard) ]] || die 'Source worktree has untracked files.'
git -c safe.directory="$SOURCE_DIR" fetch origin "$BRANCH"
[[ $(git -c safe.directory="$SOURCE_DIR" branch --show-current) == "$BRANCH" ]] || die "Check out $BRANCH in $SOURCE_DIR first."
git -c safe.directory="$SOURCE_DIR" merge --ff-only "origin/$BRANCH"
DEPLOY_SHA="$(git -c safe.directory="$SOURCE_DIR" rev-parse --short=8 HEAD)"
[[ -z $EXPECTED_SHA || "$(git -c safe.directory="$SOURCE_DIR" rev-parse HEAD)" == "$EXPECTED_SHA"* ]] || die "Expected $EXPECTED_SHA, got $DEPLOY_SHA."
printf 'Deploying %s at %s\n' "$DEPLOY_SHA" "$STAMP"

env_from_container() {
  docker inspect mdp-postgres --format '{{range .Config.Env}}{{println .}}{{end}}' |
    sed -n "s/^$1=//p" | head -1
}
export DB_NAME="$(env_from_container POSTGRES_DB)"
export DB_USERNAME="$(env_from_container POSTGRES_USER)"
export DB_PASSWORD="$(env_from_container POSTGRES_PASSWORD)"
[[ -n $DB_NAME && -n $DB_USERNAME && -n $DB_PASSWORD ]] || die 'Could not read existing PostgreSQL configuration.'

CURRENT_BACKEND_ID="$(docker inspect mdp-backend --format '{{.Image}}')"
CURRENT_FRONTEND_ID="$(docker inspect mdp-frontend --format '{{.Image}}')"
OLD_BACKEND="mdp-backend:rollback-$STAMP"
OLD_FRONTEND="mdp-frontend:rollback-$STAMP"
docker tag "$CURRENT_BACKEND_ID" "$OLD_BACKEND"
docker tag "$CURRENT_FRONTEND_ID" "$OLD_FRONTEND"

# Read plain env values as data; never source files containing secrets as shell code.
env_value() { sed -n "s|^$1=||p" "$2" | tail -1; }
ANATOMY_BASE="${NEXT_PUBLIC_ANATOMY_ASSET_BASE:-}"
if [[ -z $ANATOMY_BASE ]]; then ANATOMY_BASE="$(env_value NEXT_PUBLIC_ANATOMY_ASSET_BASE "$STACK_DIR/deploy.env")"; fi
if [[ -z $ANATOMY_BASE ]]; then ANATOMY_BASE="$(env_value NEXT_PUBLIC_ANATOMY_ASSET_BASE "$STACK_DIR/app.env")"; fi
if [[ -z $ANATOMY_BASE ]] && command -v gh >/dev/null; then
  ANATOMY_BASE="$(gh api repos/EyadAhmed06/My-Doctor-Professor/actions/variables/NEXT_PUBLIC_ANATOMY_ASSET_BASE --jq '.value' 2>/dev/null || true)"
fi
[[ -n $ANATOMY_BASE ]] || die 'Anatomy asset base is missing. Set NEXT_PUBLIC_ANATOMY_ASSET_BASE in deploy.env or export it.'

printf 'Building backend %s\n' "$DEPLOY_SHA"
docker build -t "mdp-backend:$DEPLOY_SHA" ./backend
printf 'Building frontend %s\n' "$DEPLOY_SHA"
docker build -t "mdp-frontend:$DEPLOY_SHA" \
  --build-arg NEXT_PUBLIC_API_URL=/api/v1 \
  --build-arg "NEXT_PUBLIC_ANATOMY_ASSET_BASE=$ANATOMY_BASE" ./frontend
docker image inspect "mdp-backend:$DEPLOY_SHA" "mdp-frontend:$DEPLOY_SHA" >/dev/null

compose() {
  docker compose \
    --env-file "$STACK_DIR/deploy.env" \
    --env-file "$STACK_DIR/app.env" \
    --env-file "$STACK_DIR/local-images.env" \
    -f "$COMPOSE_FILE" "$@"
}
wait_healthy() {
  local name="$1" state="" i
  for i in $(seq 1 40); do
    state="$(docker inspect "$name" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)"
    printf '[%s/40] %s: %s\n' "$i" "$name" "$state"
    [[ $state == healthy ]] && return 0
    [[ $state == unhealthy || $state == exited ]] && break
    sleep 3
  done
  docker logs --tail 100 "$name" >&2 || true
  return 1
}
rollback_on_error() {
  local code=$?
  trap - ERR
  if (( mutation_started )); then
    printf 'Deployment failed (exit %s); restoring previous application images.\n' "$code" >&2
    export BACKEND_IMAGE="$OLD_BACKEND" FRONTEND_IMAGE="$OLD_FRONTEND"
    compose up -d --no-deps --force-recreate --pull never backend >&2 || true
    compose up -d --no-deps --force-recreate --pull never frontend >&2 || true
    docker restart mdp-caddy >&2 || true
    for file in deploy.env local-images.env; do
      [[ -f "$STACK_DIR/$file.pre-$DEPLOY_SHA-$STAMP" ]] &&
        cp -a "$STACK_DIR/$file.pre-$DEPLOY_SHA-$STAMP" "$STACK_DIR/$file"
    done
    printf 'Check database compatibility before relying on image rollback; database dumps are under %s/data/backups.\n' "$STACK_DIR" >&2
  fi
  exit "$code"
}
trap rollback_on_error ERR

BACKUP_FILE="$STACK_DIR/data/backups/pre-deploy-$DEPLOY_SHA-$STAMP.dump"
mkdir -p "$STACK_DIR/data/backups"
umask 077
for file in deploy.env local-images.env; do
  cp -a "$STACK_DIR/$file" "$STACK_DIR/$file.pre-$DEPLOY_SHA-$STAMP"
done
printf 'Saving database dump: %s\n' "$BACKUP_FILE"
docker exec -e "PGPASSWORD=$DB_PASSWORD" mdp-postgres \
  pg_dump -U "$DB_USERNAME" -d "$DB_NAME" --format=custom --no-owner --no-privileges > "$BACKUP_FILE"
[[ -s $BACKUP_FILE ]] || die 'Database dump is empty.'
docker exec -i mdp-postgres pg_restore --list < "$BACKUP_FILE" > /dev/null

export BACKEND_IMAGE="mdp-backend:$DEPLOY_SHA"
export FRONTEND_IMAGE="$OLD_FRONTEND"
export APP_HOST="$(env_value APP_HOST "$STACK_DIR/deploy.env")"
[[ -n $APP_HOST ]] || die 'APP_HOST missing from deploy.env.'
printf 'Running migrations from %s\n' "$BACKEND_IMAGE"
compose run --rm --no-deps --pull never migrate

mutation_started=1
printf 'Switching backend\n'
compose up -d --no-deps --force-recreate --pull never backend
wait_healthy mdp-backend
docker exec -i mdp-backend node -e "fetch('http://127.0.0.1:3000/api/v1/health/ready').then(async r=>{const b=await r.json(); console.log(b); if(!r.ok||b.status!=='ready'||b.database!=='up'||b.schema!=='ready')process.exit(1)}).catch(e=>{console.error(e);process.exit(1)})"

export FRONTEND_IMAGE="mdp-frontend:$DEPLOY_SHA"
printf 'Switching frontend\n'
compose up -d --no-deps --force-recreate --pull never frontend
wait_healthy mdp-frontend
docker exec -i mdp-frontend node -e "fetch('http://127.0.0.1:3001/').then(r=>{console.log('Frontend HTTP',r.status);if(!r.ok)process.exit(1)}).catch(e=>{console.error(e);process.exit(1)})"
docker restart mdp-caddy
curl --fail --silent --show-error --retry 6 --retry-delay 2 "https://$APP_HOST/api/v1/health/ready"
printf '\n'
curl --fail --silent --show-error --retry 6 --retry-delay 2 -o /dev/null "https://$APP_HOST/"

# Only persist image references after the public checks succeed.
for file in deploy.env local-images.env; do
  for variable in BACKEND_IMAGE FRONTEND_IMAGE; do
    if [[ $variable == BACKEND_IMAGE ]]; then value="$BACKEND_IMAGE"; else value="$FRONTEND_IMAGE"; fi
    if grep -q "^$variable=" "$STACK_DIR/$file"; then
      sed -i "s|^$variable=.*$|$variable=$value|" "$STACK_DIR/$file"
    else
      printf '\n%s=%s\n' "$variable" "$value" >> "$STACK_DIR/$file"
    fi
  done
done
install -m 0750 "$SOURCE_DIR/deploy/update-ec2.sh" "$STACK_DIR/update-ec2.sh"
trap - ERR
printf '\nDEPLOYED %s\nRollback tags: %s %s\nDatabase backup: %s\n' "$DEPLOY_SHA" "$OLD_BACKEND" "$OLD_FRONTEND" "$BACKUP_FILE"
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
(unset BACKEND_IMAGE FRONTEND_IMAGE; compose config --images)
