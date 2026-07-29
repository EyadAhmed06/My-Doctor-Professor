@echo off
REM Database setup and migration script for Windows

setlocal enabledelayedexpansion

echo ============================================
echo My Doctor Professor - Database Setup (Windows)
echo ============================================
echo.
echo This script assumes PostgreSQL is running on localhost:5432
echo.

REM Set default values
set DB_USER=postgres
set DB_PASSWORD=postgres
set DB_HOST=localhost
set DB_PORT=5432
set DB_NAME=my_doctor_professor

REM Override with environment variables if set
if defined DB_USERNAME set DB_USER=%DB_USERNAME%
if defined DB_PASSWORD set DB_PASSWORD=%DB_PASSWORD%
if defined DB_HOST set DB_HOST=%DB_HOST%
if defined DB_PORT set DB_PORT=%DB_PORT%
if defined DB_NAME set DB_NAME=%DB_NAME%

echo Creating database: %DB_NAME%
echo.

REM Create database if it doesn't exist
psql -h %DB_HOST% -U %DB_USER% -tc "SELECT 1 FROM pg_database WHERE datname = '%DB_NAME%'" | findstr /R "1" >nul
if errorlevel 1 (
  psql -h %DB_HOST% -U %DB_USER% -c "CREATE DATABASE %DB_NAME%"
)

echo Database created successfully!
echo.
echo Running schema migrations...
echo.

REM Run schema files in order
for %%F in (00_extensions.sql 01_enums.sql 02_users.sql 03_academic_structure.sql 04_question_bank.sql 05_tests.sql 06_flashcards.sql 07_student_progress.sql 08_notifications.sql 09_audit.sql 10_indexes.sql 11_permissions.sql) do (
  echo Applying: %%F
  psql -h %DB_HOST% -U %DB_USER% -d %DB_NAME% -f "database\schemas\%%F"
)

echo.
echo ============================================
echo Database setup complete!
echo ============================================
echo.
echo Next steps:
echo 1. Start the backend: npm run start:dev
echo 2. Start the frontend: npm run dev (in frontend folder)
echo 3. Access the app at http://localhost:3001

pause

