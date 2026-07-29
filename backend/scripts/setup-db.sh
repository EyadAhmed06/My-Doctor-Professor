#!/bin/bash
# Database setup and migration script

set -e

echo "=== My Doctor Professor - Database Setup ==="
echo ""
echo "1. Creating database and running migrations..."
echo "2. This script assumes PostgreSQL is running on localhost:5432"
echo ""

# Read environment variables
DB_USER=${DB_USERNAME:-postgres}
DB_PASSWORD=${DB_PASSWORD:-postgres}
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-my_doctor_professor}

# Create database if it doesn't exist
echo "Creating database: $DB_NAME"
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 || \
  PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -c "CREATE DATABASE $DB_NAME"

echo "Database created successfully!"
echo ""

# Run schema migrations in order
echo "Running schema migrations..."
for schema in 00_extensions.sql 01_enums.sql 02_users.sql 03_academic_structure.sql 04_question_bank.sql 05_tests.sql 06_flashcards.sql 07_student_progress.sql 08_notifications.sql 09_audit.sql 10_indexes.sql 11_permissions.sql; do
  echo "Applying: $schema"
  PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f "database/schemas/$schema"
done

echo ""
echo "=== Database setup complete ==="

