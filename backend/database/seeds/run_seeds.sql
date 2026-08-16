-- =====================================================
-- Medical Learning Platform
-- Seed Runner
-- =====================================================
--
-- Executes all seed files in the correct order.
-- Run only after all schema files have been created.
-- =====================================================

\i 01_users_seed.sql
\i 02_academic_seed.sql
\i 03_question_bank_seed.sql
\i 04_tests_seed.sql
\i 05_flashcards_seed.sql
\i 06_student_progress_seed.sql
\i 07_audit_seed.sql
\i 08_notifications_seed.sql
\i 09_demo_data_seed.sql

--command to run it
--psql -U postgres -d your_database_name -f run_seeds.sql