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
          SELECT tc.constraint_name INTO constraint_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.constraint_column_usage ccu USING (constraint_schema,constraint_name)
          WHERE tc.table_schema=current_schema() AND tc.table_name=target_table
            AND tc.constraint_type='FOREIGN KEY' AND ccu.column_name=target_column
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
