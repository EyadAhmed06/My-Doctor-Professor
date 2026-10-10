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
stage=preflight
REHEARSAL_NETWORK="mdp-rehearsal-$STAMP"
REHEARSAL_DB="mdp-rehearsal-db-$STAMP"
REHEARSAL_MIGRATE="mdp-rehearsal-migrate-$STAMP"
REHEARSAL_CHECK="mdp-rehearsal-check-$STAMP"
CANDIDATE_FRONTEND="mdp-candidate-frontend-$STAMP"
PRODUCTION_MIGRATE="mdp-production-migrate-$STAMP"
LOG_OVERRIDE="$STACK_DIR/compose.deploy-logging.yml"
DEPLOY_LOG_DIR="$STACK_DIR/data/deployment-logs"
mkdir -p "$DEPLOY_LOG_DIR"
chmod 700 "$DEPLOY_LOG_DIR"
MIGRATION_LOG="$DEPLOY_LOG_DIR/migration-$STAMP.log"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[[ $EUID -eq 0 ]] || die 'Run with sudo.'
[[ $# -le 1 ]] || die 'Usage: sudo /opt/mdp/update-ec2.sh [expected-commit-prefix]'
[[ -d $SOURCE_DIR/.git && -f $COMPOSE_FILE ]] || die 'Expected /opt/mdp-source and /opt/mdp/compose.production.yml.'
for bin in docker git curl sed awk df flock timeout openssl sort find head seq install cp chmod rm tee mkdir; do command -v "$bin" >/dev/null || die "Missing $bin"; done
for file in deploy.env app.env local-images.env; do
  [[ -f $STACK_DIR/$file ]] || die "Missing $STACK_DIR/$file"
done

exec 9>"$STACK_DIR/deploy.lock"
flock -n 9 || die 'Another deployment is already running.'

cd "$SOURCE_DIR"
git -c safe.directory="$SOURCE_DIR" diff --quiet || die 'Source worktree has uncommitted changes.'
git -c safe.directory="$SOURCE_DIR" diff --cached --quiet || die 'Source index has uncommitted changes.'
[[ -z $(git -c safe.directory="$SOURCE_DIR" ls-files --others --exclude-standard) ]] || die 'Source worktree has untracked files.'
timeout --kill-after=30s 180s git -c safe.directory="$SOURCE_DIR" fetch origin "$BRANCH"
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


# Keep all container images (including stopped containers) and two rollback
# versions per app. Cleanup is restricted to our generated application tags.
cleanup_app_images() {
  local repo tag image_id
  local -A protected=()
  local -a container_ids=()
  mapfile -t container_ids < <(docker ps -aq)
  if (( ${#container_ids[@]} )); then
    while IFS= read -r image_id; do protected["$image_id"]=1; done < <(
      docker inspect --format '{{.Image}}' "${container_ids[@]}"
    )
  fi
  for repo in mdp-backend mdp-frontend; do
    while IFS= read -r tag; do
      [[ -n $tag ]] || continue
      image_id="$(docker image inspect "$repo:$tag" --format '{{.Id}}')"
      protected["$image_id"]=1
    done < <(docker image ls "$repo" --format '{{.Tag}}' |
      awk '/^rollback-[0-9]{8}-[0-9]{6}$/' | sort -r | sed -n '1,2p')
  done
  for repo in mdp-backend mdp-frontend; do
    while IFS= read -r tag; do
      [[ $tag =~ ^([a-f0-9]{8,40}|rollback-[0-9]{8}-[0-9]{6})$ ]] || continue
      [[ $tag == "$DEPLOY_SHA" || "$repo:$tag" == "$OLD_BACKEND" || "$repo:$tag" == "$OLD_FRONTEND" ]] && continue
      image_id="$(docker image inspect "$repo:$tag" --format '{{.Id}}')"
      [[ ${protected[$image_id]:-0} == 1 ]] && continue
      # No --force: Docker refuses removal if another container needs the image.
      docker image rm "$repo:$tag" || printf 'Keeping image %s:%s; Docker refused removal.\n' "$repo" "$tag" >&2
    done < <(docker image ls "$repo" --format '{{.Tag}}')
  done
  docker image prune -f
  docker builder prune -f --filter 'until=168h'
}

check_build_space() {
  local docker_root available free_inodes path
  local minimum_gb="${MDP_MIN_BUILD_FREE_GB:-8}"
  [[ $minimum_gb =~ ^[1-9][0-9]*$ ]] || die 'MDP_MIN_BUILD_FREE_GB must be a positive integer.'
  docker_root="$(docker info --format '{{.DockerRootDir}}')"
  for path in "$docker_root" "$SOURCE_DIR" "$STACK_DIR"; do
    available="$(df -Pk "$path" | awk 'NR==2 {print $4}')"
    free_inodes="$(df -Pi "$path" | awk 'NR==2 {print $4}')"
    [[ $available =~ ^[0-9]+$ && $free_inodes =~ ^[0-9]+$ ]] || die "Cannot check disk capacity for $path"
    (( available >= minimum_gb * 1024 * 1024 )) || die "Insufficient free disk space at $path: need at least ${minimum_gb} GiB before building. Increase disk capacity or remove older files."
    (( free_inodes >= 100000 )) || die "Insufficient free inodes at $path: need at least 100000 before building."
  done
}
printf 'Cleaning old application build images while preserving rollback versions.\n'
cleanup_app_images
check_build_space

# Read plain env values as data; never source files containing secrets as shell code.
env_value() { sed -n "s|^$1=||p" "$2" | tail -1; }
ANATOMY_BASE="${NEXT_PUBLIC_ANATOMY_ASSET_BASE:-}"
if [[ -z $ANATOMY_BASE ]]; then ANATOMY_BASE="$(env_value NEXT_PUBLIC_ANATOMY_ASSET_BASE "$STACK_DIR/deploy.env")"; fi
if [[ -z $ANATOMY_BASE ]]; then ANATOMY_BASE="$(env_value NEXT_PUBLIC_ANATOMY_ASSET_BASE "$STACK_DIR/app.env")"; fi
if [[ -z $ANATOMY_BASE ]] && command -v gh >/dev/null; then
  ANATOMY_BASE="$(gh api repos/EyadAhmed06/My-Doctor-Professor/actions/variables/NEXT_PUBLIC_ANATOMY_ASSET_BASE --jq '.value' 2>/dev/null || true)"
fi
[[ -n $ANATOMY_BASE ]] || die 'Anatomy asset base is missing. Set NEXT_PUBLIC_ANATOMY_ASSET_BASE in deploy.env or export it.'

check_memory() {
  local available minimum="${MDP_MIN_AVAILABLE_MEMORY_MB:-1536}"
  [[ $minimum =~ ^[1-9][0-9]*$ ]] || die 'MDP_MIN_AVAILABLE_MEMORY_MB must be a positive integer.'
  available="$(awk '/^MemAvailable:/ {print int($2/1024)}' /proc/meminfo)"
  [[ $available =~ ^[0-9]+$ ]] || die 'Cannot check available memory.'
  (( available >= minimum )) || die "Need at least $minimum MiB available RAM before building; found $available MiB."
}
docker version >/dev/null
docker compose version >/dev/null
export BACKEND_IMAGE="$OLD_BACKEND" FRONTEND_IMAGE="$OLD_FRONTEND"
docker compose --env-file "$STACK_DIR/deploy.env" --env-file "$STACK_DIR/app.env" --env-file "$STACK_DIR/local-images.env" -f "$COMPOSE_FILE" config --quiet
for name in mdp-postgres mdp-backend mdp-frontend; do
  [[ $(docker inspect "$name" --format '{{.State.Running}}') == true ]] || die "$name is not running; repair the current deployment first."
done
check_memory
export APP_HOST="$(env_value APP_HOST "$STACK_DIR/deploy.env")"
[[ -n $APP_HOST ]] || die 'APP_HOST missing from deploy.env.'
for cert in ca.crt server.crt server.key; do
  [[ -s "$STACK_DIR/config/postgres-certs/$cert" ]] || die "Missing PostgreSQL certificate: $cert"
done
timeout 15s docker exec mdp-backend node -e "fetch('http://127.0.0.1:3000/api/v1/health/ready',{signal:AbortSignal.timeout(10000)}).then(async r=>{const b=await r.json();if(!r.ok||b.status!=='ready')process.exit(1)}).catch(()=>process.exit(1))"
stage=backend-build
printf 'Building backend %s\n' "$DEPLOY_SHA"
timeout --kill-after=30s 30m docker build -t "mdp-backend:$DEPLOY_SHA" ./backend
check_build_space
check_memory
stage=frontend-build
printf 'Building frontend %s\n' "$DEPLOY_SHA"
timeout --kill-after=30s 30m docker build -t "mdp-frontend:$DEPLOY_SHA" \
  --build-arg NEXT_PUBLIC_API_URL=/api/v1 \
  --build-arg "NEXT_PUBLIC_ANATOMY_ASSET_BASE=$ANATOMY_BASE" ./frontend
docker image inspect "mdp-backend:$DEPLOY_SHA" "mdp-frontend:$DEPLOY_SHA" >/dev/null

# Bound application logs without recreating the production database.
cat > "$LOG_OVERRIDE" <<'YAML'
services:
  backend:
    logging: {driver: json-file, options: {max-size: "10m", max-file: "3"}}
  frontend:
    logging: {driver: json-file, options: {max-size: "10m", max-file: "3"}}
  caddy:
    logging: {driver: json-file, options: {max-size: "10m", max-file: "3"}}
  migrate:
    logging: {driver: json-file, options: {max-size: "10m", max-file: "3"}}
YAML
chmod 600 "$LOG_OVERRIDE"

compose() {
  timeout --kill-after=15s "${DEPLOY_COMPOSE_TIMEOUT:-15m}" docker compose \
    --env-file "$STACK_DIR/deploy.env" \
    --env-file "$STACK_DIR/app.env" \
    --env-file "$STACK_DIR/local-images.env" \
    -f "$COMPOSE_FILE" -f "$LOG_OVERRIDE" "$@"
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
cleanup_temporary() {
  docker rm -f "$CANDIDATE_FRONTEND" "$REHEARSAL_CHECK" "$REHEARSAL_MIGRATE" >/dev/null 2>&1 || true
  docker rm -fv "$REHEARSAL_DB" >/dev/null 2>&1 || true
  docker network rm "$REHEARSAL_NETWORK" >/dev/null 2>&1 || true
}
trap cleanup_temporary EXIT

rollback_on_error() {
  local code=${1:-$?}
  trap - ERR
  printf 'Deployment failed at stage %s (exit %s).\n' "$stage" "$code" >&2
  if [[ $stage == production-migration ]]; then
    printf 'Migration process exit=%s (137=SIGKILL, 124=timeout; inspect logs for cause).\n' "$code" >&2
    # The named migration container is intentionally NOT --rm so a failed
    # Compose client cannot erase the container evidence before this handler.
    docker inspect "$PRODUCTION_MIGRATE" \
      --format 'Migration container: status={{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}} started={{.State.StartedAt}} finished={{.State.FinishedAt}}' >&2 \
      || printf 'Migration container was not created or is no longer inspectable.\n' >&2
    docker logs --tail 100 "$PRODUCTION_MIGRATE" >&2 \
      || printf 'Migration container logs are unavailable.\n' >&2
    printf 'Persisted migration log: %s\n' "$MIGRATION_LOG" >&2
    printf 'Host memory snapshot after failure:\n' >&2
    free -h >&2 || true
    printf 'Current Docker container states:\n' >&2
    docker ps -a --format 'table {{.Names}}\t{{.Status}}' >&2 || true
  fi
  # Stop a stalled migration but keep the stopped container for postmortem inspection.
  docker stop --time 5 "$PRODUCTION_MIGRATE" >/dev/null 2>&1 || true
  if (( mutation_started )); then
    printf 'Deployment failed (exit %s); restoring previous application images.\n' "$code" >&2
    export BACKEND_IMAGE="$OLD_BACKEND" FRONTEND_IMAGE="$OLD_FRONTEND"
    compose up -d --no-deps --force-recreate --pull never backend >&2 || true
    compose up -d --no-deps --force-recreate --pull never frontend >&2 || true
    compose up -d --no-deps --force-recreate --pull never caddy >&2 || printf 'CRITICAL: Caddy rollback recreation failed.\n' >&2
    wait_healthy mdp-backend >&2 || printf 'CRITICAL: backend rollback did not become healthy.\n' >&2
    wait_healthy mdp-frontend >&2 || printf 'CRITICAL: frontend rollback did not become healthy.\n' >&2
    for file in deploy.env local-images.env; do
      [[ -f "$STACK_DIR/$file.pre-$DEPLOY_SHA-$STAMP" ]] &&
        cp -a "$STACK_DIR/$file.pre-$DEPLOY_SHA-$STAMP" "$STACK_DIR/$file"
    done
    printf 'Check database compatibility before relying on image rollback; database dumps are under %s/data/backups.\n' "$STACK_DIR" >&2
  fi
  exit "$code"
}
trap rollback_on_error ERR
trap 'rollback_on_error 130' INT
trap 'rollback_on_error 143' TERM

BACKUP_FILE="$STACK_DIR/data/backups/pre-deploy-$DEPLOY_SHA-$STAMP.dump"
mkdir -p "$STACK_DIR/data/backups"
umask 077
for file in deploy.env local-images.env; do
  cp -a "$STACK_DIR/$file" "$STACK_DIR/$file.pre-$DEPLOY_SHA-$STAMP"
done
stage=database-capacity-check
database_bytes="$(timeout 30s docker exec mdp-postgres psql -U "$DB_USERNAME" -d "$DB_NAME" -Atc 'SELECT pg_database_size(current_database())')"
[[ $database_bytes =~ ^[0-9]+$ ]] || die 'Cannot estimate rehearsal database storage.'
docker_root="$(docker info --format '{{.DockerRootDir}}')"
available_kb="$(df -Pk "$docker_root" | awk 'NR==2 {print $4}')"
(( available_kb * 1024 >= database_bytes * 2 + 2147483648 )) || die 'Insufficient space for a restored rehearsal database plus safety margin.'
stage=database-backup
printf 'Saving database dump: %s\n' "$BACKUP_FILE"
timeout --kill-after=30s 15m docker exec -e "PGPASSWORD=$DB_PASSWORD" mdp-postgres \
  pg_dump -U "$DB_USERNAME" -d "$DB_NAME" --format=custom --no-owner --no-privileges > "$BACKUP_FILE"
[[ -s $BACKUP_FILE ]] || die 'Database dump is empty.'
docker exec -i mdp-postgres pg_restore --list < "$BACKUP_FILE" > /dev/null


check_memory
stage=migration-rehearsal
printf 'Restoring and rehearsing migrations in an isolated temporary database.\n'
REHEARSAL_PASSWORD="$(openssl rand -hex 24)"
PG_IMAGE="$(docker inspect mdp-postgres --format '{{.Image}}')"
docker network create --internal "$REHEARSAL_NETWORK" >/dev/null
docker run -d --name "$REHEARSAL_DB" --network "$REHEARSAL_NETWORK" \
  --network-alias rehearsal-db --memory=512m --log-opt max-size=10m --log-opt max-file=2 \
  -e POSTGRES_DB=rehearsal -e POSTGRES_USER=rehearsal -e "POSTGRES_PASSWORD=$REHEARSAL_PASSWORD" \
  "$PG_IMAGE" >/dev/null
db_ready=0
for i in $(seq 1 40); do
  if timeout 10s docker exec "$REHEARSAL_DB" pg_isready -U rehearsal -d rehearsal >/dev/null 2>&1; then db_ready=1; break; fi
  sleep 2
done
(( db_ready )) || die 'Temporary rehearsal database did not start.'
timeout --kill-after=30s 15m docker exec -i "$REHEARSAL_DB" \
  pg_restore -U rehearsal -d rehearsal --exit-on-error --no-owner --no-privileges < "$BACKUP_FILE"

rehearsal_node() {
  local image="$1" name="$2"
  timeout --kill-after=30s 15m docker run --rm -i --name "$name" \
    --network "$REHEARSAL_NETWORK" --memory=768m --entrypoint node \
    -e NODE_ENV=production -e DB_HOST=rehearsal-db -e DB_PORT=5432 \
    -e DB_NAME=rehearsal -e DB_USERNAME=rehearsal -e "DB_PASSWORD=$REHEARSAL_PASSWORD" \
    -e DB_SSL_ENABLED=false -e PGOPTIONS="-c lock_timeout=10000 -c statement_timeout=600000" "$image"
}
rehearsal_node "mdp-backend:$DEPLOY_SHA" "$REHEARSAL_MIGRATE" <<'JS'
const { AppDataSource: db } = require('./dist/database/data-source');
(async () => {
  await db.initialize();
  await db.query("SET lock_timeout = '10s'");
  await db.query("SET statement_timeout = '10min'");
  const applied = await db.runMigrations({ transaction: 'all' });
  console.log('Rehearsed migrations:', applied.map(m => m.name));
  await db.destroy();
})().catch(e => { console.error('Migration rehearsal failed:', e.message); process.exit(1); });
JS
stage=rollback-schema-check
schema_probe="$(cat <<'JS'
const { AppDataSource: db } = require('./dist/database/data-source');
const quote = s => '"' + s.replace(/"/g, '""') + '"';
(async () => {
  await db.initialize();
  await db.query("SET statement_timeout = '30s'");
  for (const entity of db.entityMetadatas) {
    const table = entity.schema ? quote(entity.schema) + '.' + quote(entity.tableName) : quote(entity.tableName);
    const columns = entity.columns.map(c => quote(c.databaseName)).join(', ');
    if (columns) await db.query('SELECT ' + columns + ' FROM ' + table + ' WHERE FALSE');
  }
  console.log('Backend mapped schema remains readable.');
  await db.destroy();
})().catch(e => { console.error('Rollback schema check failed:', e.message); process.exit(1); });
JS
)"
printf '%s\n' "$schema_probe" | rehearsal_node "$OLD_BACKEND" "$REHEARSAL_CHECK"
printf '%s\n' "$schema_probe" | rehearsal_node "mdp-backend:$DEPLOY_SHA" "$REHEARSAL_CHECK"
touch "$BACKUP_FILE.verified"
stage=frontend-candidate-check
docker run -d --name "$CANDIDATE_FRONTEND" --network "$REHEARSAL_NETWORK" \
  --memory=512m --log-opt max-size=10m --log-opt max-file=2 \
  -e PORT=3001 -e HOSTNAME=0.0.0.0 "mdp-frontend:$DEPLOY_SHA" >/dev/null
frontend_ready=0
for i in $(seq 1 40); do
  if timeout 10s docker exec "$CANDIDATE_FRONTEND" node -e \
    "fetch('http://127.0.0.1:3001/',{signal:AbortSignal.timeout(5000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"; then frontend_ready=1; break; fi
  sleep 2
done
(( frontend_ready )) || die 'Candidate frontend failed before production switch.'
cleanup_temporary
stage=production-migration

export BACKEND_IMAGE="mdp-backend:$DEPLOY_SHA"
export FRONTEND_IMAGE="$OLD_FRONTEND"
export APP_HOST="$(env_value APP_HOST "$STACK_DIR/deploy.env")"
[[ -n $APP_HOST ]] || die 'APP_HOST missing from deploy.env.'
printf 'Running migrations from %s\n' "$BACKEND_IMAGE"
# Preserve the named container until its outcome is known. --rm would hide
# startup failures and SIGKILL/OOM evidence from the rollback handler.
printf 'Production migration deadline: 4 minutes. Persistent log: %s\n' "$MIGRATION_LOG"
DEPLOY_COMPOSE_TIMEOUT=240s compose run --name "$PRODUCTION_MIGRATE" --no-deps --pull never -e PGOPTIONS="-c lock_timeout=10000 -c statement_timeout=600000" migrate 2>&1 | tee "$MIGRATION_LOG"
docker rm "$PRODUCTION_MIGRATE" >/dev/null

mutation_started=1
stage=backend-switch
printf 'Switching backend\n'
compose up -d --no-deps --force-recreate --pull never backend
wait_healthy mdp-backend
timeout 20s docker exec -i mdp-backend node -e "fetch('http://127.0.0.1:3000/api/v1/health/ready').then(async r=>{const b=await r.json(); console.log(b); if(!r.ok||b.status!=='ready'||b.database!=='up'||b.schema!=='ready')process.exit(1)}).catch(e=>{console.error(e);process.exit(1)})"

export FRONTEND_IMAGE="mdp-frontend:$DEPLOY_SHA"
stage=frontend-switch
printf 'Switching frontend\n'
compose up -d --no-deps --force-recreate --pull never frontend
wait_healthy mdp-frontend
timeout 20s docker exec -i mdp-frontend node -e "fetch('http://127.0.0.1:3001/').then(r=>{console.log('Frontend HTTP',r.status);if(!r.ok)process.exit(1)}).catch(e=>{console.error(e);process.exit(1)})"
compose up -d --no-deps --force-recreate --pull never caddy
stage=https-checks

# Verify the real HTTPS hostname, TLS certificate, Caddy virtual host and
# reverse-proxy path locally. Do not depend on this EC2 instance hairpinning
# through its own public DNS/public IP.
CADDY_RESOLVE="${APP_HOST}:443:127.0.0.1"

wait_caddy_route() {
  local url="$1" label="$2" response="" i

  for i in $(seq 1 30); do
    if response="$(curl \
      --fail \
      --silent \
      --show-error \
      --resolve "$CADDY_RESOLVE" \
      --connect-timeout 3 \
      --max-time 8 \
      "$url" 2>&1)"; then

      printf '%s HTTP 200 through local Caddy after check %s/30\n' \
        "$label" "$i"

      [[ $label == API ]] && printf '%s\n' "$response"
      return 0
    fi

    printf '[%s/30] Waiting for Caddy %s route after restart: %s\n' \
      "$i" "$label" "$response" >&2

    sleep 3
  done

  docker logs --tail 100 mdp-caddy >&2 || true
  return 1
}

wait_caddy_route "https://$APP_HOST/api/v1/health/ready" API
wait_caddy_route "https://$APP_HOST/" HOME

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
# Keep seven newest restored dumps. Unverified historical dumps need manual review.
mapfile -t verified_backups < <(find "$STACK_DIR/data/backups" -maxdepth 1 -type f -name 'pre-deploy-*.dump.verified' -printf '%T@ %f\n' | sort -rn | sed 's/^[^ ]* //')
for marker in "${verified_backups[@]:7}"; do
  [[ "$STACK_DIR/data/backups/${marker%.verified}" == "$BACKUP_FILE" ]] && continue
  rm -f -- "$STACK_DIR/data/backups/${marker%.verified}" "$STACK_DIR/data/backups/$marker"
done
install -m 0750 "$SOURCE_DIR/deploy/update-ec2.sh" "$STACK_DIR/update-ec2.sh"
trap - ERR INT TERM
cleanup_app_images || printf 'Image cleanup incomplete; deployment is healthy.\n' >&2
printf '\nDEPLOYED %s\nRollback tags: %s %s\nDatabase backup: %s\n' "$DEPLOY_SHA" "$OLD_BACKEND" "$OLD_FRONTEND" "$BACKUP_FILE"
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
(unset BACKEND_IMAGE FRONTEND_IMAGE; compose config --images)
