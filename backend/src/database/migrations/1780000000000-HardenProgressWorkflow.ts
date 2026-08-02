import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenProgressWorkflow1780000000000 implements MigrationInterface {
  name = 'HardenProgressWorkflow1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ DECLARE target_table text; target_column text; target_parent text; constraint_name text;
      BEGIN
        FOR target_table, target_column, target_parent IN
          SELECT * FROM (VALUES
            ('student_course_progress','course_id','courses'),
            ('student_lecture_progress','lecture_id','lectures'),
            ('student_topic_progress','topic_id','topics'),
            ('student_question_progress','question_id','questions')
          ) AS relationships(table_name,column_name,parent_name)
        LOOP
          SELECT constraint_record.conname INTO constraint_name
          FROM pg_constraint constraint_record
          JOIN pg_class source_table ON source_table.oid = constraint_record.conrelid
          JOIN pg_namespace source_schema ON source_schema.oid = source_table.relnamespace
          JOIN unnest(constraint_record.conkey) AS source_key(attnum) ON TRUE
          JOIN pg_attribute source_column
            ON source_column.attrelid = source_table.oid
           AND source_column.attnum = source_key.attnum
          WHERE source_schema.nspname=current_schema() AND source_table.relname=target_table
            AND constraint_record.contype='f' AND source_column.attname=target_column
          LIMIT 1;
          IF constraint_name IS NOT NULL THEN
            EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I',target_table,constraint_name);
          END IF;
          EXECUTE format(
            'ALTER TABLE %I ADD CONSTRAINT fk_%s_%s_restrict FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE RESTRICT',
            target_table,target_table,target_column,target_column,target_parent
          );
          constraint_name:=NULL;
        END LOOP;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ DECLARE target_table text; target_column text; target_parent text;
      BEGIN
        FOR target_table, target_column, target_parent IN
          SELECT * FROM (VALUES
            ('student_course_progress','course_id','courses'),
            ('student_lecture_progress','lecture_id','lectures'),
            ('student_topic_progress','topic_id','topics'),
            ('student_question_progress','question_id','questions')
          ) AS relationships(table_name,column_name,parent_name)
        LOOP
          EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS fk_%s_%s_restrict',
            target_table,target_table,target_column);
          EXECUTE format(
            'ALTER TABLE %I ADD CONSTRAINT fk_%s_%s_cascade FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE CASCADE',
            target_table,target_table,target_column,target_column,target_parent
          );
        END LOOP;
      END $$;
    `);
  }
}
