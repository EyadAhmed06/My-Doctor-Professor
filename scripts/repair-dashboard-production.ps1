param(
  [string]$Region = "eu-central-1",
  [string]$InstanceName = "my-doctor-professor-demo"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
  throw "AWS CLI is required. Install/configure it, then run this script again."
}

$instanceId = (& aws ec2 describe-instances `
  --region $Region `
  --filters "Name=tag:Name,Values=$InstanceName" "Name=instance-state-name,Values=running" `
  --query "Reservations[0].Instances[0].InstanceId" `
  --output text).Trim()

if ($LASTEXITCODE -ne 0 -or -not $instanceId -or $instanceId -eq "None") {
  throw "Could not find a running EC2 instance tagged Name=$InstanceName in $Region."
}

$sql = @'
DO $$
BEGIN
  IF to_regtype('public.study_plan_item_type') IS NULL THEN
    CREATE TYPE study_plan_item_type AS ENUM ('QUESTIONS','FLASHCARDS','LECTURE','REVIEW','REST');
  END IF;
  IF to_regtype('public.study_plan_item_status') IS NULL THEN
    CREATE TYPE study_plan_item_status AS ENUM ('PLANNED','COMPLETED','SKIPPED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS student_study_plans (
  student_id uuid PRIMARY KEY,
  target_exam varchar(100),
  exam_date date,
  daily_question_target int NOT NULL DEFAULT 20,
  weekly_hours_target int NOT NULL DEFAULT 10,
  daily_flashcard_target int NOT NULL DEFAULT 20,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamp,
  schedule_version int NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_study_plan_student
    FOREIGN KEY (student_id) REFERENCES students(user_id) ON DELETE CASCADE
);

ALTER TABLE student_study_plans
  ADD COLUMN IF NOT EXISTS generated_at timestamp,
  ADD COLUMN IF NOT EXISTS schedule_version int NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS study_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  scheduled_date date NOT NULL,
  item_type study_plan_item_type NOT NULL,
  status study_plan_item_status NOT NULL DEFAULT 'PLANNED',
  lecture_id uuid,
  target_count int,
  duration_minutes int NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamp,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_study_plan_item_plan
    FOREIGN KEY (student_id) REFERENCES student_study_plans(student_id) ON DELETE CASCADE,
  CONSTRAINT fk_study_plan_item_lecture
    FOREIGN KEY (lecture_id) REFERENCES lectures(id) ON DELETE SET NULL
);

ALTER TABLE study_plan_items
  ADD COLUMN IF NOT EXISTS scheduled_date date,
  ADD COLUMN IF NOT EXISTS item_type study_plan_item_type,
  ADD COLUMN IF NOT EXISTS status study_plan_item_status DEFAULT 'PLANNED',
  ADD COLUMN IF NOT EXISTS lecture_id uuid,
  ADD COLUMN IF NOT EXISTS target_count int,
  ADD COLUMN IF NOT EXISTS duration_minutes int,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS completed_at timestamp,
  ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT CURRENT_TIMESTAMP;

UPDATE study_plan_items
SET scheduled_date = COALESCE(scheduled_date, CURRENT_DATE),
    item_type = COALESCE(item_type, 'REVIEW'::study_plan_item_type),
    status = COALESCE(status, 'PLANNED'::study_plan_item_status),
    duration_minutes = COALESCE(duration_minutes, 1),
    metadata = COALESCE(metadata, '{}'::jsonb),
    created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
    updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
WHERE scheduled_date IS NULL
   OR item_type IS NULL
   OR status IS NULL
   OR duration_minutes IS NULL
   OR metadata IS NULL
   OR created_at IS NULL
   OR updated_at IS NULL;

ALTER TABLE study_plan_items
  ALTER COLUMN scheduled_date SET NOT NULL,
  ALTER COLUMN item_type SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'PLANNED',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN duration_minutes SET NOT NULL,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
  ALTER COLUMN metadata SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN updated_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_study_plan_items_student_date
  ON study_plan_items(student_id, scheduled_date);

ALTER TABLE student_answers
  ADD COLUMN IF NOT EXISTS essay_answer text,
  ADD COLUMN IF NOT EXISTS answered_at timestamp;

UPDATE student_answers
SET answered_at = COALESCE(answered_at, created_at, CURRENT_TIMESTAMP)
WHERE answered_at IS NULL;

ALTER TABLE student_answers
  ALTER COLUMN answered_at SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN answered_at SET NOT NULL;

DO $$
DECLARE missing_contract text;
BEGIN
  WITH required(table_name, column_name) AS (
    VALUES
      ('student_answers','attempt_id'),
      ('student_answers','question_id'),
      ('student_answers','selected_option_id'),
      ('student_answers','essay_answer'),
      ('student_answers','is_correct'),
      ('student_answers','answered_at'),
      ('test_attempts','student_id'),
      ('test_attempts','status'),
      ('test_attempts','submitted_at'),
      ('student_question_progress','student_id'),
      ('student_question_progress','bookmarked'),
      ('student_flashcard_progress','student_id'),
      ('student_flashcard_progress','times_reviewed'),
      ('student_flashcard_progress','is_mastered'),
      ('student_flashcard_progress','last_reviewed_at'),
      ('student_flashcard_progress','next_review_at'),
      ('student_lecture_progress','student_id'),
      ('student_lecture_progress','is_completed'),
      ('student_lecture_progress','time_spent_minutes'),
      ('student_lecture_progress','last_accessed_at'),
      ('student_topic_progress','student_id'),
      ('student_topic_progress','mastery_percentage'),
      ('study_plan_items','student_id'),
      ('study_plan_items','status'),
      ('study_plan_items','item_type'),
      ('study_plan_items','duration_minutes'),
      ('study_plan_items','completed_at'),
      ('essay_case_attempts','student_id'),
      ('essay_case_attempts','case_id'),
      ('essay_case_attempts','status'),
      ('essay_case_attempts','submitted_at'),
      ('essay_cases','week_id'),
      ('essay_cases','is_published')
  ), missing AS (
    SELECT required.table_name || '.' || required.column_name AS name
    FROM required
    LEFT JOIN information_schema.columns c
      ON c.table_schema = current_schema()
     AND c.table_name = required.table_name
     AND c.column_name = required.column_name
    WHERE c.column_name IS NULL
  )
  SELECT string_agg(name, ', ' ORDER BY name) INTO missing_contract FROM missing;

  IF missing_contract IS NOT NULL THEN
    RAISE EXCEPTION 'Dashboard contract still incomplete: %', missing_contract;
  END IF;
END $$;
'@

# The SQL is base64 encoded locally so shell/JSON quoting cannot corrupt it in transit.
$sqlBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($sql))

$remoteCommand = @"
set -euo pipefail
STAMP=`$(date -u +%Y%m%dT%H%M%SZ)
sudo mkdir -p /opt/mdp/data/backups
sudo docker exec mdp-postgres sh -lc 'pg_dump -U "`$POSTGRES_USER" "`$POSTGRES_DB"' | sudo tee "/opt/mdp/data/backups/pre-dashboard-repair-`$STAMP.sql" >/dev/null
printf '%s' '$sqlBase64' | base64 -d >/tmp/mdp-dashboard-repair.sql
sudo docker exec -i mdp-postgres sh -lc 'psql -v ON_ERROR_STOP=1 -U "`$POSTGRES_USER" -d "`$POSTGRES_DB"' </tmp/mdp-dashboard-repair.sql
rm -f /tmp/mdp-dashboard-repair.sql
sudo docker exec mdp-postgres sh -lc 'psql -U "`$POSTGRES_USER" -d "`$POSTGRES_DB" -Atc "SELECT ''dashboard-schema-ready''"'
echo "Backup: /opt/mdp/data/backups/pre-dashboard-repair-`$STAMP.sql"
"@

$parameters = @{ commands = @($remoteCommand) } | ConvertTo-Json -Compress -Depth 4

$commandId = (& aws ssm send-command `
  --region $Region `
  --instance-ids $instanceId `
  --document-name AWS-RunShellScript `
  --comment "Repair student dashboard database contract" `
  --parameters $parameters `
  --query "Command.CommandId" `
  --output text).Trim()

if ($LASTEXITCODE -ne 0 -or -not $commandId) {
  throw "Failed to submit the repair through AWS Systems Manager."
}

Write-Host "SSM command: $commandId"
Write-Host "Waiting for the database repair..."
& aws ssm wait command-executed --region $Region --command-id $commandId --instance-id $instanceId
$waitExit = $LASTEXITCODE

& aws ssm get-command-invocation `
  --region $Region `
  --command-id $commandId `
  --instance-id $instanceId `
  --query "{Status:Status,Output:StandardOutputContent,Error:StandardErrorContent}" `
  --output json

if ($waitExit -ne 0) {
  throw "Dashboard database repair failed. The SSM output above contains the exact remaining schema problem."
}

Write-Host "Dashboard database contract repaired successfully." -ForegroundColor Green
