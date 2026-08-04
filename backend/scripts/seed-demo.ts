import "dotenv/config";
import * as argon2 from "argon2";
import { AppDataSource } from "../src/database/data-source";

const ids = {
  semester: "10000000-0000-4000-8000-000000000001",
  course: "20000000-0000-4000-8000-000000000001",
  bundle: "30000000-0000-4000-8000-000000000001",
  weeks: [1, 2, 3].map(
    (n) => `40000000-0000-4000-8000-${n.toString().padStart(12, "0")}`,
  ),
  lectures: [1, 2, 3, 4, 5, 6].map(
    (n) => `50000000-0000-4000-8000-${n.toString().padStart(12, "0")}`,
  ),
  topics: [1, 2, 3, 4, 5, 6].map(
    (n) => `60000000-0000-4000-8000-${n.toString().padStart(12, "0")}`,
  ),
  questions: [1, 2, 3, 4, 5, 6, 7, 8].map(
    (n) => `70000000-0000-4000-8000-${n.toString().padStart(12, "0")}`,
  ),
  tests: [1, 2].map(
    (n) => `80000000-0000-4000-8000-${n.toString().padStart(12, "0")}`,
  ),
  deck: "90000000-0000-4000-8000-000000000001",
};

async function main() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_DEMO_SEED !== "true"
  ) {
    throw new Error("Refusing to seed production without ALLOW_DEMO_SEED=true");
  }
  const password = process.env.SEED_PASSWORD ?? "MyDoctorProfessor!2026";
  if (password.length < 12)
    throw new Error("SEED_PASSWORD must contain at least 12 characters");
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  await AppDataSource.initialize();
  await AppDataSource.transaction(async (manager) => {
    const upsertUser = async (
      fullName: string,
      email: string,
      phone: string,
      role: string,
    ) => {
      const [user] = await manager.query(
        `INSERT INTO users(full_name,email,password_hash,phone_number,role,status,email_verified,failed_login_attempts)
         VALUES($1,$2,$3,$4,$5,'ACTIVE',TRUE,0)
         ON CONFLICT(email) DO UPDATE SET full_name=EXCLUDED.full_name,password_hash=EXCLUDED.password_hash,
           role=EXCLUDED.role,status='ACTIVE',email_verified=TRUE,updated_at=CURRENT_TIMESTAMP
         RETURNING id`,
        [fullName, email, passwordHash, phone, role],
      );
      return user.id as string;
    };

    const adminId = await upsertUser(
      "My Doctor Administrator",
      "admin@mydoctorprofessor.com",
      "+201000000101",
      "SYSTEM_ADMIN",
    );
    const instructorId = await upsertUser(
      "Dr. Ahmed Hassan",
      "instructor@mydoctorprofessor.com",
      "+201000000102",
      "INSTRUCTOR",
    );
    const studentId = await upsertUser(
      "Eyad El Maleh",
      "eyadelmaleh07@gmail.com",
      "+201000000103",
      "STUDENT",
    );
    await manager.query(
      `INSERT INTO system_admins(user_id,employee_number,is_super_admin) VALUES($1,'MDP-ADMIN-001',TRUE) ON CONFLICT(user_id) DO UPDATE SET is_super_admin=TRUE`,
      [adminId],
    );
    await manager.query(
      `INSERT INTO instructors(user_id,specialization,office_location,biography) VALUES($1,'Cardiology and Medical Education','Online','Medical educator responsible for the seeded cardiovascular bundle.') ON CONFLICT(user_id) DO UPDATE SET specialization=EXCLUDED.specialization,biography=EXCLUDED.biography`,
      [instructorId],
    );
    await manager.query(
      `INSERT INTO students(user_id,student_number,current_semester) VALUES($1,'MDP-STUDENT-001',5) ON CONFLICT(user_id) DO UPDATE SET current_semester=5`,
      [studentId],
    );

    await manager.query(
      `INSERT INTO semesters(id,semester_number,title,description) VALUES($1,5,'Clinical Foundations','A transition semester connecting systems knowledge to clinical reasoning.') ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description`,
      [ids.semester],
    );
    await manager.query(
      `INSERT INTO courses(id,semester_id,course_code,course_name,slug,description,credit_hours,is_active,display_order) VALUES($1,$2,'CVS-301','Cardiovascular Medicine','cardiovascular-medicine','Cardiovascular foundations, clinical presentations, investigations, and initial management.',6,TRUE,1) ON CONFLICT(id) DO UPDATE SET course_name=EXCLUDED.course_name,description=EXCLUDED.description,is_active=TRUE`,
      [ids.course, ids.semester],
    );
    await manager.query(
      `INSERT INTO course_instructors(course_id,instructor_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,
      [ids.course, instructorId],
    );

    const weekData = [
      [
        "Cardiovascular Foundations",
        "Anatomy, circulation, physiology, and hemodynamics.",
      ],
      [
        "Ischemic Heart Disease",
        "Atherosclerosis, stable ischemia, and acute coronary syndromes.",
      ],
      [
        "Heart Failure",
        "Recognition, classification, investigations, and management.",
      ],
    ];
    for (let i = 0; i < weekData.length; i++)
      await manager.query(
        `INSERT INTO weeks(id,course_id,week_number,title,description,display_order) VALUES($1,$2,$3,$4,$5,$3) ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description`,
        [ids.weeks[i], ids.course, i + 1, ...weekData[i]],
      );

    const lectureData = [
      [
        0,
        "Cardiac anatomy and circulation",
        "Chambers, valves, coronary circulation, and blood flow.",
      ],
      [
        0,
        "Cardiac physiology and hemodynamics",
        "Cardiac cycle, pressure-volume relationships, preload, and afterload.",
      ],
      [
        1,
        "Atherosclerosis and risk factors",
        "Endothelial injury, plaque development, and cardiovascular risk.",
      ],
      [
        1,
        "Acute coronary syndromes",
        "Recognition and initial management of ACS.",
      ],
      [
        2,
        "Heart failure foundations",
        "Systolic and diastolic dysfunction and compensatory mechanisms.",
      ],
      [
        2,
        "Heart failure management",
        "Evidence-based initial and long-term management.",
      ],
    ];
    for (let i = 0; i < lectureData.length; i++) {
      const [weekIndex, title, description] = lectureData[i] as [
        number,
        string,
        string,
      ];
      await manager.query(
        `INSERT INTO lectures(id,week_id,lecture_number,title,description,estimated_duration_minutes,is_published,display_order) VALUES($1,$2,$3,$4,$5,60,TRUE,$3) ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,is_published=TRUE`,
        [
          ids.lectures[i],
          ids.weeks[weekIndex],
          (i % 2) + 1,
          title,
          description,
        ],
      );
      await manager.query(
        `INSERT INTO topics(id,lecture_id,topic_name,description,display_order) VALUES($1,$2,$3,$4,1) ON CONFLICT(id) DO UPDATE SET topic_name=EXCLUDED.topic_name,description=EXCLUDED.description`,
        [ids.topics[i], ids.lectures[i], title, description],
      );
    }

    const questionData = [
      [
        0,
        "Which chamber receives oxygenated blood directly from the pulmonary veins?",
        "Left atrium",
        "The pulmonary veins return oxygenated blood to the left atrium.",
      ],
      [
        1,
        "Which change most directly increases stroke volume in a healthy heart?",
        "Increased preload",
        "Within physiological limits, increased preload increases force of contraction through the Frank-Starling mechanism.",
      ],
      [
        2,
        "Which modifiable factor is most strongly associated with accelerated atherosclerosis?",
        "Cigarette smoking",
        "Smoking promotes endothelial dysfunction, inflammation, and thrombosis.",
      ],
      [
        3,
        "A patient has persistent chest pain and ST elevation. What is the immediate priority?",
        "Urgent reperfusion assessment",
        "STEMI requires rapid assessment for reperfusion while initial antiplatelet and supportive therapy begins.",
      ],
      [
        4,
        "Which finding most strongly supports left-sided heart failure?",
        "Bibasal lung crackles",
        "Pulmonary venous congestion produces interstitial and alveolar fluid, commonly causing bibasal crackles.",
      ],
      [
        5,
        "Which medicine improves mortality in HFrEF rather than only relieving congestion?",
        "ACE inhibitor",
        "ACE inhibition reduces maladaptive neurohormonal activation and improves outcomes in HFrEF.",
      ],
      [
        5,
        "A patient with HFrEF remains congested with peripheral edema. Which drug gives the fastest symptomatic relief?",
        "Loop diuretic",
        "Loop diuretics rapidly reduce volume overload and improve congestion symptoms.",
      ],
      [
        3,
        "What is the most useful first test when acute coronary syndrome is suspected?",
        "12-lead ECG",
        "A 12-lead ECG should be obtained rapidly to identify ischemia and guide the reperfusion pathway.",
      ],
    ];
    const optionIds: string[] = [];
    for (let i = 0; i < questionData.length; i++) {
      const [topicIndex, text, correct, explanation] = questionData[i] as [
        number,
        string,
        string,
        string,
      ];
      await manager.query(
        `INSERT INTO questions(id,topic_id,question_type,title,question_text,explanation,hint,reference,difficulty,estimated_time_seconds,marks,is_question_bank,version,is_active,created_by) VALUES($1,$2,'MCQ',$3,$3,$4,'Focus on the core mechanism.','Seeded academic content','MEDIUM',75,1,TRUE,1,TRUE,$5) ON CONFLICT(id) DO UPDATE SET question_text=EXCLUDED.question_text,explanation=EXCLUDED.explanation,is_active=TRUE`,
        [
          ids.questions[i],
          ids.topics[topicIndex],
          text,
          explanation,
          instructorId,
        ],
      );
      const distractors = [
        "A related but less appropriate finding",
        "A late complication rather than the best answer",
        "None of the above",
      ];
      for (let j = 0; j < 4; j++) {
        const optionId = `71000000-0000-4000-${(i + 1).toString().padStart(4, "0")}-${(j + 1).toString().padStart(12, "0")}`;
        if (j === 0) optionIds.push(optionId);
        await manager.query(
          `INSERT INTO mcq_options(id,question_id,option_text,is_correct,display_order) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET option_text=EXCLUDED.option_text,is_correct=EXCLUDED.is_correct`,
          [
            optionId,
            ids.questions[i],
            j === 0 ? correct : distractors[j - 1],
            j === 0,
            j + 1,
          ],
        );
      }
    }

    const testData = [
      [
        "Week 1 Cardiovascular Review",
        "WEEK",
        ids.weeks[0],
        40,
        "20.00",
        "12.00",
      ],
      [
        "Cardiovascular Final Practice",
        "COURSE",
        null,
        200,
        "200.00",
        "120.00",
      ],
    ];
    for (let i = 0; i < testData.length; i++) {
      const [title, type, weekId, duration, total, passing] = testData[i];
      await manager.query(
        `INSERT INTO tests(id,title,description,test_type,course_id,week_id,duration_minutes,total_marks,passing_marks,is_published,created_by) VALUES($1,$2,'Seeded assessment for the student workspace.',$3,$4,$5,$6,$7,$8,TRUE,$9) ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,is_published=TRUE`,
        [
          ids.tests[i],
          title,
          type,
          ids.course,
          weekId,
          duration,
          total,
          passing,
          instructorId,
        ],
      );
    }
    for (let i = 0; i < ids.questions.length; i++)
      await manager.query(
        `INSERT INTO test_questions(test_id,question_id,display_order,marks) VALUES($1,$2,$3,1) ON CONFLICT(test_id,question_id) DO NOTHING`,
        [ids.tests[0], ids.questions[i], i + 1],
      );

    await manager.query(
      `INSERT INTO bundles(id,title,slug,description,academic_year,status,access_mode,is_free,created_by) VALUES($1,'Cardiovascular Clinical Foundations','cardiovascular-clinical-foundations','A free seeded bundle covering three structured weeks, lectures, questions, flashcards, resources, and a past examination.',3,'PUBLISHED','PUBLIC',TRUE,$2) ON CONFLICT(id) DO UPDATE SET status='PUBLISHED',is_free=TRUE,description=EXCLUDED.description`,
      [ids.bundle, instructorId],
    );
    await manager.query(
      `INSERT INTO bundle_courses(bundle_id,course_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,
      [ids.bundle, ids.course],
    );
    await manager.query(
      `INSERT INTO bundle_instructors(bundle_id,instructor_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,
      [ids.bundle, instructorId],
    );
    for (const weekId of ids.weeks)
      await manager.query(
        `INSERT INTO bundle_weeks(bundle_id,week_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,
        [ids.bundle, weekId],
      );
    for (const testId of ids.tests)
      await manager.query(
        `INSERT INTO bundle_tests(bundle_id,test_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,
        [ids.bundle, testId],
      );
    await manager.query(
      `INSERT INTO bundle_enrollments(bundle_id,student_id,status,source,granted_by) VALUES($1,$2,'ACTIVE','MANUAL',$3) ON CONFLICT(bundle_id,student_id) DO UPDATE SET status='ACTIVE',expires_at=NULL`,
      [ids.bundle, studentId, adminId],
    );

    await manager.query(
      `INSERT INTO flashcard_decks(id,course_id,topic_id,lecture_id,created_by,title,description,is_published,display_order) VALUES($1,$2,$3,$4,$5,'Cardiovascular High-Yield Review','Front-and-back cards linked to the seeded bundle.',TRUE,1) ON CONFLICT(id) DO UPDATE SET is_published=TRUE,title=EXCLUDED.title`,
      [ids.deck, ids.course, ids.topics[5], ids.lectures[5], instructorId],
    );
    for (let i = 0; i < questionData.length; i++)
      await manager.query(
        `INSERT INTO flashcards(id,deck_id,title,front_content,back_content,difficulty,explanation,estimated_review_seconds,display_order,is_active) VALUES($1,$2,$3,$3,$4,'MEDIUM',$5,45,$6,TRUE) ON CONFLICT(id) DO UPDATE SET front_content=EXCLUDED.front_content,back_content=EXCLUDED.back_content,is_active=TRUE`,
        [
          `91000000-0000-4000-8000-${(i + 1).toString().padStart(12, "0")}`,
          ids.deck,
          questionData[i][1],
          questionData[i][2],
          questionData[i][3],
          i + 1,
        ],
      );
    for (let i = 0; i < ids.lectures.length; i++)
      await manager.query(
        `INSERT INTO resources(id,lecture_id,resource_name,resource_type,upload_status,file_url,description) VALUES($1,$2,$3,'PDF','COMPLETED',$4,$5) ON CONFLICT(id) DO UPDATE SET resource_name=EXCLUDED.resource_name,description=EXCLUDED.description`,
        [
          `92000000-0000-4000-8000-${(i + 1).toString().padStart(12, "0")}`,
          ids.lectures[i],
          `${lectureData[i][1]} summary`,
          `/seed-resources/lecture-${i + 1}.pdf`,
          `Seed resource metadata for ${lectureData[i][1]}.`,
        ],
      );

    await manager.query(
      `INSERT INTO student_course_progress(student_id,course_id,completion_percentage,lectures_completed,total_lectures,average_score,last_accessed_at) VALUES($1,$2,58.33,3,6,76.00,CURRENT_TIMESTAMP) ON CONFLICT(student_id,course_id) DO UPDATE SET completion_percentage=58.33,lectures_completed=3,total_lectures=6,average_score=76.00,last_accessed_at=CURRENT_TIMESTAMP`,
      [studentId, ids.course],
    );
    for (let i = 0; i < ids.lectures.length; i++)
      await manager.query(
        `INSERT INTO student_lecture_progress(student_id,lecture_id,is_completed,completion_percentage,time_spent_minutes,last_accessed_at,completed_at) VALUES($1,$2,$3,$4,$5,CURRENT_TIMESTAMP,$6) ON CONFLICT(student_id,lecture_id) DO UPDATE SET is_completed=EXCLUDED.is_completed,completion_percentage=EXCLUDED.completion_percentage,time_spent_minutes=EXCLUDED.time_spent_minutes`,
        [
          studentId,
          ids.lectures[i],
          i < 3,
          i < 3 ? 100 : i === 3 ? 45 : 0,
          i < 3 ? 65 : 25,
          i < 3 ? new Date() : null,
        ],
      );
    for (let i = 0; i < ids.questions.length; i++)
      await manager.query(
        `INSERT INTO student_question_progress(student_id,question_id,attempts,correct_attempts,incorrect_attempts,last_answer_correct,bookmarked,last_attempted_at) VALUES($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP-($8||' days')::interval) ON CONFLICT(student_id,question_id) DO UPDATE SET attempts=EXCLUDED.attempts,correct_attempts=EXCLUDED.correct_attempts,incorrect_attempts=EXCLUDED.incorrect_attempts,bookmarked=EXCLUDED.bookmarked,last_attempted_at=EXCLUDED.last_attempted_at`,
        [
          studentId,
          ids.questions[i],
          4 + i,
          3 + Math.floor(i / 2),
          1 + Math.ceil(i / 2),
          i % 3 !== 0,
          i < 3,
          i,
        ],
      );
    for (let i = 0; i < ids.topics.length; i++)
      await manager.query(
        `INSERT INTO student_topic_progress(student_id,topic_id,questions_attempted,questions_correct,questions_incorrect,confidence_level,average_score,mastery_percentage,last_practiced_at) VALUES($1,$2,8,6,2,$3,$4,$4,CURRENT_TIMESTAMP-($5||' days')::interval) ON CONFLICT(student_id,topic_id) DO UPDATE SET confidence_level=EXCLUDED.confidence_level,average_score=EXCLUDED.average_score,mastery_percentage=EXCLUDED.mastery_percentage,last_practiced_at=EXCLUDED.last_practiced_at`,
        [studentId, ids.topics[i], 62 + i * 4, 58 + i * 5, i],
      );
    for (let i = 0; i < questionData.length; i++)
      await manager.query(
        `INSERT INTO student_flashcard_progress(student_id,flashcard_id,times_reviewed,times_correct,times_incorrect,review_streak,last_reviewed_at,next_review_at,is_mastered,mastered_at,ease_factor,interval_days) VALUES($1,$2,$3,$4,1,$4,CURRENT_TIMESTAMP-INTERVAL '2 days',$5,$6,$7,2.50,3) ON CONFLICT(student_id,flashcard_id) DO UPDATE SET times_reviewed=EXCLUDED.times_reviewed,times_correct=EXCLUDED.times_correct,next_review_at=EXCLUDED.next_review_at,is_mastered=EXCLUDED.is_mastered`,
        [
          studentId,
          `91000000-0000-4000-8000-${(i + 1).toString().padStart(12, "0")}`,
          4 + i,
          3 + i,
          i < 4
            ? new Date(Date.now() - 86400000)
            : new Date(Date.now() + 86400000 * (i - 3)),
          i >= 5,
          i >= 5 ? new Date() : null,
        ],
      );

    const attemptId = "a0000000-0000-4000-8000-000000000001";
    await manager.query(
      `INSERT INTO test_attempts(id,student_id,test_id,test_mode,status,score,started_at,submitted_at,last_activity_at,auto_submitted) VALUES($1,$2,$3,'TUTOR','SUBMITTED',6,CURRENT_TIMESTAMP-INTERVAL '8 days',CURRENT_TIMESTAMP-INTERVAL '7 days',CURRENT_TIMESTAMP-INTERVAL '7 days',FALSE) ON CONFLICT(id) DO UPDATE SET score=6,status='SUBMITTED'`,
      [attemptId, studentId, ids.tests[0]],
    );
    for (let i = 0; i < ids.questions.length; i++)
      await manager.query(
        `INSERT INTO student_answers(id,attempt_id,question_id,selected_option_id,awarded_marks,is_correct,answered_at) VALUES($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP-($7||' days')::interval) ON CONFLICT(attempt_id,question_id) DO UPDATE SET selected_option_id=EXCLUDED.selected_option_id,is_correct=EXCLUDED.is_correct,answered_at=EXCLUDED.answered_at`,
        [
          `a1000000-0000-4000-8000-${(i + 1).toString().padStart(12, "0")}`,
          attemptId,
          ids.questions[i],
          optionIds[i],
          i < 6 ? 1 : 0,
          i < 6,
          7 - Math.floor(i / 2),
        ],
      );

    const collectionId = "b0000000-0000-4000-8000-000000000001";
    const tagIds = [
      "b1000000-0000-4000-8000-000000000001",
      "b1000000-0000-4000-8000-000000000002",
    ];
    await manager.query(
      `INSERT INTO notebook_collections(id,user_id,name,description,color,is_pinned) VALUES($1,$2,'Cardiovascular Finals','Explanations, pearls, and revision notes for the active bundle.','#48d2c7',TRUE) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,is_pinned=TRUE`,
      [collectionId, studentId],
    );
    await manager.query(
      `INSERT INTO notebook_tags(id,user_id,name,color) VALUES($1,$3,'High yield','#7c4df0'),($2,$3,'Needs review','#ef8a63') ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,color=EXCLUDED.color`,
      [tagIds[0], tagIds[1], studentId],
    );
    const noteData = [
      [
        "b2000000-0000-4000-8000-000000000001",
        "HFrEF initial management",
        "EXPLANATION",
        "Confirm congestion and hemodynamic stability. Start evidence-based therapy, use diuretics for congestion, and reassess renal function and potassium.",
        true,
        ids.questions[5],
        ids.lectures[5],
      ],
      [
        "b2000000-0000-4000-8000-000000000002",
        "Acute coronary syndrome red flags",
        "CLINICAL_PEARL",
        "Persistent pain, hemodynamic instability, dynamic ECG changes, and malignant arrhythmias require urgent escalation.",
        false,
        ids.questions[3],
        ids.lectures[3],
      ],
      [
        "b2000000-0000-4000-8000-000000000003",
        "Cardiac cycle checkpoints",
        "PERSONAL_NOTE",
        "Follow pressure changes through atrial systole, isovolumetric contraction, ejection, and ventricular relaxation.",
        false,
        ids.questions[1],
        ids.lectures[1],
      ],
    ];
    for (const note of noteData) {
      await manager.query(
        `INSERT INTO notebook_notes(id,user_id,title,note_type,content,metadata,collection_id,is_favorite,review_at,linked_question_id,linked_lecture_id) VALUES($1,$2,$3,$4,$5,'{"source":"demo-seed"}'::jsonb,$6,$7,CURRENT_TIMESTAMP+INTERVAL '3 days',$8,$9) ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,content=EXCLUDED.content,is_favorite=EXCLUDED.is_favorite`,
        [
          note[0],
          studentId,
          note[1],
          note[2],
          note[3],
          collectionId,
          note[4],
          note[5],
          note[6],
        ],
      );
      for (const tagId of tagIds)
        await manager.query(
          `INSERT INTO notebook_note_tags(note_id,tag_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,
          [note[0], tagId],
        );
    }

    const examDate = new Date(Date.now() + 46 * 86400000)
      .toISOString()
      .slice(0, 10);
    await manager.query(
      `INSERT INTO student_study_plans(student_id,target_exam,exam_date,daily_question_target,weekly_hours_target,daily_flashcard_target,preferences,generated_at,schedule_version) VALUES($1,'Cardiovascular Final',$2,30,12,20,'{"available_days":[1,2,3,4,5,6],"rest_day":0}'::jsonb,CURRENT_TIMESTAMP,1) ON CONFLICT(student_id) DO UPDATE SET target_exam=EXCLUDED.target_exam,exam_date=EXCLUDED.exam_date,daily_question_target=30,weekly_hours_target=12,daily_flashcard_target=20`,
      [studentId, examDate],
    );
    for (let day = -4; day <= 10; day++) {
      const date = new Date(Date.now() + day * 86400000)
        .toISOString()
        .slice(0, 10);
      const status = day < 0 ? "COMPLETED" : "PLANNED";
      await manager.query(
        `INSERT INTO study_plan_items(id,student_id,scheduled_date,item_type,status,lecture_id,target_count,duration_minutes,metadata,completed_at) VALUES($1,$2,$3,'QUESTIONS',$4,NULL,30,45,'{"title":"Daily question practice"}'::jsonb,$5) ON CONFLICT(id) DO UPDATE SET scheduled_date=EXCLUDED.scheduled_date,status=EXCLUDED.status`,
        [
          `c0000000-0000-4000-${(day + 10).toString().padStart(4, "0")}-000000000001`,
          studentId,
          date,
          status,
          day < 0 ? new Date() : null,
        ],
      );
      await manager.query(
        `INSERT INTO study_plan_items(id,student_id,scheduled_date,item_type,status,lecture_id,target_count,duration_minutes,metadata,completed_at) VALUES($1,$2,$3,'LECTURE',$4,$5,NULL,60,$6::jsonb,$7) ON CONFLICT(id) DO UPDATE SET scheduled_date=EXCLUDED.scheduled_date,status=EXCLUDED.status`,
        [
          `c0000000-0000-4000-${(day + 10).toString().padStart(4, "0")}-000000000002`,
          studentId,
          date,
          status,
          ids.lectures[(day + 10) % ids.lectures.length],
          JSON.stringify({
            title: lectureData[(day + 10) % lectureData.length][1],
          }),
          day < 0 ? new Date() : null,
        ],
      );
    }

    console.log({
      admin: "admin@mydoctorprofessor.com",
      instructor: "instructor@mydoctorprofessor.com",
      student: "eyadelmaleh07@gmail.com",
      password,
      bundle: "Cardiovascular Clinical Foundations",
    });
  });
  await AppDataSource.destroy();
}

main().catch(async (error) => {
  console.error(error);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exitCode = 1;
});
