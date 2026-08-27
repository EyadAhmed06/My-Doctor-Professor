import 'dotenv/config';
import { createHash } from 'node:crypto';
import type { DataSource } from 'typeorm';

// Production images ship compiled application code in dist/ and intentionally
// omit src/. Local seed runs continue to load the TypeScript data source.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AppDataSource } = require(
  process.env.NODE_ENV === 'production'
    ? '../dist/database/data-source'
    : '../src/database/data-source',
) as { AppDataSource: DataSource };

type CourseSeed = {
  semester: 3 | 4 | 5 | 6;
  year: 2 | 3;
  code: string;
  name: string;
  slug: string;
  lectures: Array<{ title: string; focus: string }>;
};

const courses: CourseSeed[] = [
  {
    semester: 3,
    year: 2,
    code: 'ANAT-S3',
    name: 'Anatomy — Semester 3',
    slug: 'anatomy-semester-3',
    lectures: [
      {
        title: 'Upper Limb Anatomy',
        focus: 'Bones, joints, muscles, vessels, and nerves of the upper limb.',
      },
      {
        title: 'Thoracic Anatomy',
        focus:
          'Thoracic wall, mediastinum, lungs, pleura, and heart relations.',
      },
      {
        title: 'Abdominal Anatomy',
        focus:
          'Abdominal wall, peritoneum, gastrointestinal organs, and major vessels.',
      },
      {
        title: 'Pelvis and Perineum',
        focus:
          'Pelvic walls, viscera, neurovascular supply, and perineal anatomy.',
      },
    ],
  },
  {
    semester: 3,
    year: 2,
    code: 'HIST-S3',
    name: 'Histology — Semester 3',
    slug: 'histology-semester-3',
    lectures: [
      {
        title: 'Epithelial Tissue',
        focus:
          'Classification, specialization, renewal, and functional correlations of epithelia.',
      },
      {
        title: 'Connective Tissue',
        focus:
          'Cells, fibers, extracellular matrix, cartilage, bone, and adipose tissue.',
      },
      {
        title: 'Blood and Lymphoid Tissue',
        focus: 'Blood cells, hematopoiesis, lymph nodes, spleen, and thymus.',
      },
      {
        title: 'Muscle and Nervous Tissue',
        focus:
          'Skeletal, cardiac, smooth muscle, neurons, glia, and peripheral nerves.',
      },
    ],
  },
  {
    semester: 3,
    year: 2,
    code: 'PATH-S3',
    name: 'Pathology — Semester 3',
    slug: 'pathology-semester-3',
    lectures: [
      {
        title: 'Cell Injury and Adaptation',
        focus:
          'Cellular adaptation, reversible injury, necrosis, apoptosis, and intracellular accumulation.',
      },
      {
        title: 'Inflammation and Repair',
        focus:
          'Acute and chronic inflammation, mediators, healing, fibrosis, and tissue repair.',
      },
      {
        title: 'Hemodynamic Disorders',
        focus:
          'Edema, thrombosis, embolism, infarction, shock, and disseminated coagulation.',
      },
      {
        title: 'Neoplasia',
        focus:
          'Tumor biology, carcinogenesis, invasion, metastasis, grading, and staging.',
      },
    ],
  },
  {
    semester: 4,
    year: 2,
    code: 'ANAT-S4',
    name: 'Anatomy — Semester 4',
    slug: 'anatomy-semester-4',
    lectures: [
      {
        title: 'Head and Neck Anatomy',
        focus:
          'Skull, face, cervical fascia, vessels, nerves, and deep neck spaces.',
      },
      {
        title: 'Neuroanatomy',
        focus:
          'Brain, spinal cord, pathways, meninges, ventricles, and cerebral circulation.',
      },
      {
        title: 'Lower Limb Anatomy',
        focus:
          'Bones, joints, compartments, vessels, nerves, and gait-related anatomy.',
      },
      {
        title: 'Applied and Radiological Anatomy',
        focus:
          'Surface landmarks, sectional anatomy, imaging planes, and clinical correlations.',
      },
    ],
  },
  {
    semester: 5,
    year: 3,
    code: 'CARD-S5',
    name: 'Cardiology — Semester 5',
    slug: 'cardiology-semester-5',
    lectures: [
      {
        title: 'Ischemic Heart Disease',
        focus:
          'Risk assessment, stable ischemia, acute coronary syndromes, diagnosis, and initial management.',
      },
      {
        title: 'Heart Failure',
        focus:
          'Heart failure phenotypes, clinical assessment, investigations, and evidence-based treatment.',
      },
      {
        title: 'Valvular Heart Disease',
        focus:
          'Common valve lesions, murmurs, echocardiographic assessment, and management principles.',
      },
      {
        title: 'Cardiac Arrhythmias',
        focus:
          'Rhythm recognition, atrial fibrillation, tachyarrhythmias, bradyarrhythmias, and stabilization.',
      },
    ],
  },
  {
    semester: 5,
    year: 3,
    code: 'HEMA-S5',
    name: 'Hematology — Semester 5',
    slug: 'hematology-semester-5',
    lectures: [
      {
        title: 'Approach to Anemia',
        focus:
          'Classification of anemia using indices, reticulocytes, blood film, and targeted investigations.',
      },
      {
        title: 'Hemolytic Anemias',
        focus:
          'Inherited and acquired hemolysis, clinical patterns, laboratory findings, and complications.',
      },
      {
        title: 'Bleeding Disorders',
        focus:
          'Platelet disorders, coagulation defects, clinical assessment, and interpretation of screening tests.',
      },
      {
        title: 'Hematological Malignancy',
        focus:
          'Acute and chronic leukemias, lymphomas, myeloma, and diagnostic warning signs.',
      },
    ],
  },
  {
    semester: 5,
    year: 3,
    code: 'CHEST-S5',
    name: 'Chest Medicine — Semester 5',
    slug: 'chest-medicine-semester-5',
    lectures: [
      {
        title: 'Obstructive Airway Disease',
        focus:
          'Asthma and COPD assessment, spirometry, exacerbations, and long-term management.',
      },
      {
        title: 'Respiratory Infections',
        focus:
          'Community-acquired pneumonia, tuberculosis, diagnostic evaluation, and treatment principles.',
      },
      {
        title: 'Pleural Disease',
        focus:
          'Pleural effusion, pneumothorax, pleural infection, imaging, and fluid interpretation.',
      },
      {
        title: 'Respiratory Failure',
        focus:
          'Hypoxemic and hypercapnic failure, blood gases, oxygen therapy, and ventilatory support.',
      },
    ],
  },
  {
    semester: 5,
    year: 3,
    code: 'GAST-S5',
    name: 'Gastroenterology — Semester 5',
    slug: 'gastroenterology-semester-5',
    lectures: [
      {
        title: 'Upper Gastrointestinal Disorders',
        focus:
          'Dyspepsia, reflux, peptic ulcer disease, upper bleeding, and alarm features.',
      },
      {
        title: 'Chronic Liver Disease',
        focus:
          'Cirrhosis, portal hypertension, decompensation, complications, and severity assessment.',
      },
      {
        title: 'Inflammatory Bowel Disease',
        focus:
          'Ulcerative colitis, Crohn disease, investigations, complications, and treatment principles.',
      },
      {
        title: 'Pancreatic and Biliary Disease',
        focus:
          'Pancreatitis, gallstone disease, cholangitis, obstruction, and initial management.',
      },
    ],
  },
  {
    semester: 5,
    year: 3,
    code: 'NEPH-S5',
    name: 'Nephrology — Semester 5',
    slug: 'nephrology-semester-5',
    lectures: [
      {
        title: 'Acute Kidney Injury',
        focus:
          'Recognition, prerenal and intrinsic causes, obstruction, complications, and initial management.',
      },
      {
        title: 'Chronic Kidney Disease',
        focus:
          'Staging, progression, systemic complications, monitoring, and renal replacement planning.',
      },
      {
        title: 'Glomerular Disease',
        focus:
          'Nephritic and nephrotic syndromes, urine findings, serology, and diagnostic approach.',
      },
      {
        title: 'Fluids and Electrolytes',
        focus:
          'Volume assessment, sodium and potassium disorders, acid-base interpretation, and correction.',
      },
    ],
  },
  {
    semester: 6,
    year: 3,
    code: 'CARD-S6',
    name: 'Cardiology — Semester 6',
    slug: 'cardiology-semester-6',
    lectures: [
      {
        title: 'Hypertension and Cardiovascular Risk',
        focus:
          'Blood-pressure diagnosis, secondary causes, target-organ damage, and risk reduction.',
      },
      {
        title: 'Cardiomyopathy and Myocarditis',
        focus:
          'Dilated, hypertrophic, restrictive cardiomyopathy, myocarditis, and clinical evaluation.',
      },
      {
        title: 'Pericardial Disease',
        focus:
          'Acute pericarditis, effusion, tamponade, constriction, and emergency recognition.',
      },
      {
        title: 'Congenital and Vascular Cardiology',
        focus:
          'Common congenital lesions, aortic disease, peripheral vascular disease, and prevention.',
      },
    ],
  },
  {
    semester: 6,
    year: 3,
    code: 'HEMA-S6',
    name: 'Hematology — Semester 6',
    slug: 'hematology-semester-6',
    lectures: [
      {
        title: 'Iron, B12, and Folate Disorders',
        focus:
          'Deficiency patterns, diagnostic tests, replacement, and response monitoring.',
      },
      {
        title: 'Hemoglobin Disorders',
        focus:
          'Thalassemia, sickle cell disease, crises, transfusion considerations, and complications.',
      },
      {
        title: 'Thrombosis and Anticoagulation',
        focus:
          'Venous thromboembolism, thrombophilia, anticoagulant selection, monitoring, and bleeding.',
      },
      {
        title: 'Transfusion Medicine',
        focus:
          'Blood components, compatibility, indications, reactions, and safe transfusion practice.',
      },
    ],
  },
  {
    semester: 6,
    year: 3,
    code: 'CHEST-S6',
    name: 'Chest Medicine — Semester 6',
    slug: 'chest-medicine-semester-6',
    lectures: [
      {
        title: 'Interstitial Lung Disease',
        focus:
          'Pattern recognition, pulmonary function, imaging, causes, and referral principles.',
      },
      {
        title: 'Pulmonary Vascular Disease',
        focus:
          'Pulmonary embolism, pulmonary hypertension, risk assessment, and initial treatment.',
      },
      {
        title: 'Lung Cancer',
        focus:
          'Clinical presentation, imaging, tissue diagnosis, staging, and treatment pathways.',
      },
      {
        title: 'Sleep and Occupational Lung Disease',
        focus:
          'Sleep apnea, occupational exposures, prevention, diagnosis, and chronic care.',
      },
    ],
  },
  {
    semester: 6,
    year: 3,
    code: 'GAST-S6',
    name: 'Gastroenterology — Semester 6',
    slug: 'gastroenterology-semester-6',
    lectures: [
      {
        title: 'Gastrointestinal Bleeding',
        focus:
          'Stabilization, localization, risk assessment, endoscopy, and prevention of recurrence.',
      },
      {
        title: 'Acute and Chronic Hepatitis',
        focus:
          'Viral, immune, metabolic, and drug-related hepatitis with diagnostic interpretation.',
      },
      {
        title: 'Malabsorption and Diarrhea',
        focus:
          'Acute and chronic diarrhea, celiac disease, malabsorption, and investigation strategy.',
      },
      {
        title: 'Gastrointestinal Malignancy',
        focus:
          'Warning symptoms, screening, diagnostic pathways, staging principles, and supportive care.',
      },
    ],
  },
  {
    semester: 6,
    year: 3,
    code: 'NEPH-S6',
    name: 'Nephrology — Semester 6',
    slug: 'nephrology-semester-6',
    lectures: [
      {
        title: 'Diabetic and Hypertensive Kidney Disease',
        focus:
          'Detection, risk reduction, proteinuria management, and progression monitoring.',
      },
      {
        title: 'Tubulointerstitial and Cystic Disease',
        focus:
          'Interstitial nephritis, inherited cystic disease, imaging, and clinical patterns.',
      },
      {
        title: 'Renal Replacement Therapy',
        focus:
          'Indications and principles of hemodialysis, peritoneal dialysis, and transplantation.',
      },
      {
        title: 'Nephrology Emergencies',
        focus:
          'Severe hyperkalemia, pulmonary edema, hypertensive emergency, and urgent dialysis indications.',
      },
    ],
  },
];

const semesterTitles: Record<number, string> = {
  3: 'Year 2 — Semester 3',
  4: 'Year 2 — Semester 4',
  5: 'Year 3 — Semester 5',
  6: 'Year 3 — Semester 6',
};

const questionStems = [
  'Which description best matches {title}?',
  'Which learning focus belongs to {title}?',
  'A student reviewing {title} should prioritize which scope?',
  'Which statement most accurately describes the content of {title}?',
  'Which objective is most directly associated with {title}?',
  'The lecture titled {title} primarily covers which area?',
  'Which revision summary corresponds to {title}?',
  'Which option identifies the central focus of {title}?',
  'When preparing {title}, which content outline is the correct one?',
  'Which curriculum description should be filed under {title}?',
];

function uuid(key: string) {
  const hex = createHash('sha256')
    .update(`mdp-medical-v1:${key}`)
    .digest('hex')
    .slice(0, 32)
    .split('');
  hex[12] = '4';
  hex[16] = ['8', '9', 'a', 'b'][parseInt(hex[16], 16) % 4];
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

async function main() {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOW_CONTENT_SEED !== 'true'
  ) {
    throw new Error(
      'Refusing to seed production without ALLOW_CONTENT_SEED=true',
    );
  }
  const ownerEmail = (
    process.env.SEED_CONTENT_OWNER_EMAIL ?? 'instructor@mydoctorprofessor.com'
  )
    .trim()
    .toLowerCase();
  await AppDataSource.initialize();
  try {
    await AppDataSource.transaction(async (manager) => {
      await manager.query(
        "SELECT pg_advisory_xact_lock(hashtext('mdp-medical-content-v1'))",
      );
      const [owner] = await manager.query(
        `SELECT users.id FROM users JOIN instructors ON instructors.user_id=users.id
         WHERE lower(users.email)=lower($1) AND users.role='INSTRUCTOR' AND users.status='ACTIVE'`,
        [ownerEmail],
      );
      if (!owner)
        throw new Error(
          `Active instructor not found for SEED_CONTENT_OWNER_EMAIL=${ownerEmail}`,
        );
      const ownerId = owner.id as string;

      const semesterIds = new Map<number, string>();
      for (const semesterNumber of [3, 4, 5, 6]) {
        const [semester] = await manager.query(
          `INSERT INTO semesters(id,semester_number,title,description) VALUES($1,$2,$3,$4)
           ON CONFLICT(semester_number) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,updated_at=CURRENT_TIMESTAMP
           RETURNING id`,
          [
            uuid(`semester:${semesterNumber}`),
            semesterNumber,
            semesterTitles[semesterNumber],
            'Medical curriculum content for My Doctor & The Professor.',
          ],
        );
        semesterIds.set(semesterNumber, semester.id);
      }

      const bundleIds = new Map<number, string>();
      for (const semesterNumber of [3, 4, 5, 6]) {
        const year = semesterNumber <= 4 ? 2 : 3;
        const slug = `year-${year}-semester-${semesterNumber}`;
        const [bundle] = await manager.query(
          `INSERT INTO bundles(id,title,slug,description,academic_year,status,access_mode,is_free,created_by)
           VALUES($1,$2,$3,$4,$5,'PUBLISHED','PUBLIC',TRUE,$6)
           ON CONFLICT(slug) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,academic_year=EXCLUDED.academic_year,
             status='PUBLISHED',access_mode='PUBLIC',is_free=TRUE,updated_at=CURRENT_TIMESTAMP
           RETURNING id`,
          [
            uuid(`bundle:${slug}`),
            `Year ${year} — Semester ${semesterNumber}`,
            slug,
            `Complete Semester ${semesterNumber} medical question-bank bundle.`,
            year,
            ownerId,
          ],
        );
        bundleIds.set(semesterNumber, bundle.id);
        await manager.query(
          `INSERT INTO bundle_instructors(bundle_id,instructor_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,
          [bundle.id, ownerId],
        );
      }

      for (const [courseIndex, course] of courses.entries()) {
        const [courseRow] = await manager.query(
          `INSERT INTO courses(id,semester_id,course_code,course_name,slug,description,credit_hours,is_active,display_order)
           VALUES($1,$2,$3,$4,$5,$6,NULL,TRUE,$7)
           ON CONFLICT(course_code) DO UPDATE SET semester_id=EXCLUDED.semester_id,course_name=EXCLUDED.course_name,slug=EXCLUDED.slug,
             description=EXCLUDED.description,is_active=TRUE,display_order=EXCLUDED.display_order,updated_at=CURRENT_TIMESTAMP
           RETURNING id`,
          [
            uuid(`course:${course.code}`),
            semesterIds.get(course.semester),
            course.code,
            course.name,
            course.slug,
            `${course.name} structured into four focused teaching weeks.`,
            courseIndex + 1,
          ],
        );
        const courseId = courseRow.id as string;
        const bundleId = bundleIds.get(course.semester)!;
        await manager.query(
          `INSERT INTO course_instructors(course_id,instructor_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,
          [courseId, ownerId],
        );
        await manager.query(
          `INSERT INTO bundle_courses(bundle_id,course_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,
          [bundleId, courseId],
        );

        const allMcqIds: string[] = [];
        for (const [lectureIndex, lecture] of course.lectures.entries()) {
          const weekNumber = lectureIndex + 1;
          const [week] = await manager.query(
            `INSERT INTO weeks(id,course_id,week_number,title,description,display_order) VALUES($1,$2,$3,$4,$5,$3)
             ON CONFLICT(course_id,week_number) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,
               display_order=EXCLUDED.display_order,updated_at=CURRENT_TIMESTAMP RETURNING id`,
            [
              uuid(`week:${course.code}:${weekNumber}`),
              courseId,
              weekNumber,
              lecture.title,
              lecture.focus,
            ],
          );
          await manager.query(
            `INSERT INTO bundle_weeks(bundle_id,week_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,
            [bundleId, week.id],
          );
          const [lectureRow] = await manager.query(
            `INSERT INTO lectures(id,week_id,lecture_number,title,description,estimated_duration_minutes,is_published,display_order)
             VALUES($1,$2,1,$3,$4,60,TRUE,1)
             ON CONFLICT(week_id,lecture_number) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,
               estimated_duration_minutes=60,is_published=TRUE,display_order=1,updated_at=CURRENT_TIMESTAMP RETURNING id`,
            [
              uuid(`lecture:${course.code}:${weekNumber}`),
              week.id,
              lecture.title,
              lecture.focus,
            ],
          );
          const topicId = uuid(`topic:${course.code}:${weekNumber}`);
          await manager.query(
            `INSERT INTO topics(id,lecture_id,topic_name,description,display_order) VALUES($1,$2,$3,$4,1)
             ON CONFLICT(id) DO UPDATE SET lecture_id=EXCLUDED.lecture_id,topic_name=EXCLUDED.topic_name,
               description=EXCLUDED.description,display_order=1,updated_at=CURRENT_TIMESTAMP`,
            [topicId, lectureRow.id, lecture.title, lecture.focus],
          );

          const distractors = course.lectures
            .filter((_, index) => index !== lectureIndex)
            .map((item) => item.focus);
          const externalDistractor = courses[
            (courses.indexOf(course) + 1) % courses.length
          ].lectures[lectureIndex % 4].focus;
          for (let questionIndex = 0; questionIndex < 10; questionIndex++) {
            const questionId = uuid(
              `mcq:${course.code}:${weekNumber}:${questionIndex + 1}`,
            );
            allMcqIds.push(questionId);
            const questionText = questionStems[questionIndex].replaceAll(
              '{title}',
              lecture.title,
            );
            const difficulty =
              questionIndex < 3
                ? 'EASY'
                : questionIndex < 8
                  ? 'MEDIUM'
                  : 'HARD';
            await manager.query(
              `INSERT INTO questions(id,topic_id,question_type,title,question_text,explanation,hint,reference,difficulty,
                 estimated_time_seconds,marks,is_question_bank,version,is_active,created_by)
               VALUES($1,$2,'MCQ',$3,$4,$5,$6,'MDP medical content seed v1',$7,60,1,TRUE,1,TRUE,$8)
               ON CONFLICT(id) DO UPDATE SET topic_id=EXCLUDED.topic_id,title=EXCLUDED.title,question_text=EXCLUDED.question_text,
                 explanation=EXCLUDED.explanation,hint=EXCLUDED.hint,reference=EXCLUDED.reference,difficulty=EXCLUDED.difficulty,
                 estimated_time_seconds=60,marks=1,is_question_bank=TRUE,is_active=TRUE,created_by=EXCLUDED.created_by,updated_at=CURRENT_TIMESTAMP`,
              [
                questionId,
                topicId,
                `${lecture.title} ${questionIndex + 1}`,
                questionText,
                lecture.focus,
                `Review the stated scope of ${lecture.title}.`,
                difficulty,
                ownerId,
              ],
            );
            const choices = [
              lecture.focus,
              ...distractors,
              externalDistractor,
            ];
            const rotation = questionIndex % choices.length;
            const ordered = choices.map(
              (_, index) => choices[(index + rotation) % choices.length],
            );
            for (const [optionIndex, optionText] of ordered.entries()) {
              const isCorrect = optionText === lecture.focus;
              await manager.query(
                `INSERT INTO mcq_options(id,question_id,option_text,explanation,is_correct,display_order)
                 VALUES($1,$2,$3,$4,$5,$6)
                 ON CONFLICT(id) DO UPDATE SET question_id=EXCLUDED.question_id,option_text=EXCLUDED.option_text,
                   explanation=EXCLUDED.explanation,is_correct=EXCLUDED.is_correct,display_order=EXCLUDED.display_order`,
                [
                  uuid(
                    `option:${course.code}:${weekNumber}:${questionIndex + 1}:${optionIndex + 1}`,
                  ),
                  questionId,
                  optionText,
                  isCorrect
                    ? lecture.focus
                    : `This describes another lecture in ${course.name}.`,
                  isCorrect,
                  optionIndex + 1,
                ],
              );
            }
          }

          const essayId = uuid(`essay:${course.code}:${weekNumber}`);
          await manager.query(
            `INSERT INTO questions(id,topic_id,question_type,title,question_text,explanation,hint,reference,difficulty,
               estimated_time_seconds,marks,is_question_bank,version,is_active,created_by)
             VALUES($1,$2,'ESSAY',$3,$4,$5,$6,'MDP medical content seed v1','MEDIUM',600,10,TRUE,1,TRUE,$7)
             ON CONFLICT(id) DO UPDATE SET topic_id=EXCLUDED.topic_id,title=EXCLUDED.title,question_text=EXCLUDED.question_text,
               explanation=EXCLUDED.explanation,hint=EXCLUDED.hint,reference=EXCLUDED.reference,difficulty='MEDIUM',marks=10,
               is_question_bank=TRUE,is_active=TRUE,created_by=EXCLUDED.created_by,updated_at=CURRENT_TIMESTAMP`,
            [
              essayId,
              topicId,
              `${lecture.title} structured essay`,
              `Write a structured overview of ${lecture.title}, covering: ${lecture.focus}`,
              lecture.focus,
              `Organize the answer around the major elements named in the question.`,
              ownerId,
            ],
          );
          await manager.query(
            `INSERT INTO essay_configurations(question_id,minimum_word_count,maximum_word_count,model_answer,grading_rubric)
             VALUES($1,150,400,$2,$3)
             ON CONFLICT(question_id) DO UPDATE SET minimum_word_count=150,maximum_word_count=400,
               model_answer=EXCLUDED.model_answer,grading_rubric=EXCLUDED.grading_rubric`,
            [
              essayId,
              `A complete answer should accurately organize and explain the following scope: ${lecture.focus}`,
              'Accuracy and coverage: 6 marks; organization and clarity: 2 marks; relevant clinical or structural connections: 2 marks.',
            ],
          );

          const deckId = uuid(`deck:${course.code}:${weekNumber}`);
          await manager.query(
            `INSERT INTO flashcard_decks(id,course_id,topic_id,lecture_id,created_by,title,description,is_published,display_order)
             VALUES($1,$2,$3,$4,$5,$6,$7,TRUE,$8)
             ON CONFLICT(id) DO UPDATE SET course_id=EXCLUDED.course_id,topic_id=EXCLUDED.topic_id,lecture_id=EXCLUDED.lecture_id,
               created_by=EXCLUDED.created_by,title=EXCLUDED.title,description=EXCLUDED.description,is_published=TRUE,
               display_order=EXCLUDED.display_order,updated_at=CURRENT_TIMESTAMP`,
            [
              deckId,
              courseId,
              topicId,
              lectureRow.id,
              ownerId,
              `${lecture.title} Review`,
              lecture.focus,
              weekNumber,
            ],
          );
          for (let cardIndex = 0; cardIndex < 5; cardIndex++) {
            await manager.query(
              `INSERT INTO flashcards(id,deck_id,title,front_content,back_content,difficulty,explanation,hint,
                 estimated_review_seconds,display_order,is_active)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,30,$9,TRUE)
               ON CONFLICT(id) DO UPDATE SET deck_id=EXCLUDED.deck_id,title=EXCLUDED.title,front_content=EXCLUDED.front_content,
                 back_content=EXCLUDED.back_content,difficulty=EXCLUDED.difficulty,explanation=EXCLUDED.explanation,
                 hint=EXCLUDED.hint,estimated_review_seconds=30,display_order=EXCLUDED.display_order,is_active=TRUE,updated_at=CURRENT_TIMESTAMP`,
              [
                uuid(`card:${course.code}:${weekNumber}:${cardIndex + 1}`),
                deckId,
                `${lecture.title} ${cardIndex + 1}`,
                cardIndex === 0
                  ? `What is the scope of ${lecture.title}?`
                  : `Review checkpoint ${cardIndex + 1}: ${lecture.title}`,
                lecture.focus,
                cardIndex < 2 ? 'EASY' : cardIndex < 4 ? 'MEDIUM' : 'HARD',
                lecture.focus,
                `Recall the key elements of ${lecture.title}.`,
                cardIndex + 1,
              ],
            );
          }
        }

        const testId = uuid(`assessment:${course.code}`);
        await manager.query(
          `INSERT INTO tests(id,title,description,test_type,course_id,duration_minutes,total_marks,passing_marks,is_published,created_by)
           VALUES($1,$2,$3,'COURSE',$4,40,40,24,TRUE,$5)
           ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,course_id=EXCLUDED.course_id,
             duration_minutes=40,total_marks=40,passing_marks=24,is_published=TRUE,created_by=EXCLUDED.created_by,updated_at=CURRENT_TIMESTAMP`,
          [
            testId,
            `${course.name} — 40 MCQ Assessment`,
            `Complete 40-question assessment for ${course.name}.`,
            courseId,
            ownerId,
          ],
        );
        await manager.query(
          `INSERT INTO bundle_tests(bundle_id,test_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,
          [bundleId, testId],
        );
        for (const [questionIndex, questionId] of allMcqIds.entries()) {
          await manager.query(
            `INSERT INTO test_questions(id,test_id,question_id,display_order,marks,time_limit_seconds)
             VALUES($1,$2,$3,$4,1,60)
             ON CONFLICT(test_id,question_id) DO UPDATE SET display_order=EXCLUDED.display_order,marks=1,time_limit_seconds=60`,
            [
              uuid(`assessment-item:${course.code}:${questionIndex + 1}`),
              testId,
              questionId,
              questionIndex + 1,
            ],
          );
        }
      }

      const [audit] = await manager.query(
        `
        SELECT
          COUNT(DISTINCT course.id)::int AS courses,
          COUNT(DISTINCT question.id) FILTER (WHERE question.question_type='MCQ')::int AS mcqs,
          COUNT(DISTINCT question.id) FILTER (WHERE question.question_type='ESSAY')::int AS essays,
          COUNT(DISTINCT deck.id)::int AS decks,
          COUNT(DISTINCT card.id)::int AS cards,
          COUNT(DISTINCT question.id) FILTER (
            WHERE question.question_type='MCQ'
              AND (
                SELECT COUNT(*)
                FROM mcq_options option
                WHERE option.question_id=question.id
              ) <> 5
          )::int AS invalid_option_count_mcqs,
          COUNT(DISTINCT question.id) FILTER (
            WHERE question.question_type='MCQ'
              AND (
                SELECT COUNT(*)
                FROM mcq_options option
                WHERE option.question_id=question.id AND option.is_correct=TRUE
              ) <> 1
          )::int AS invalid_correct_answer_mcqs
        FROM courses course
        LEFT JOIN weeks week ON week.course_id=course.id
        LEFT JOIN lectures lecture ON lecture.week_id=week.id
        LEFT JOIN topics topic ON topic.lecture_id=lecture.id
        LEFT JOIN questions question ON question.topic_id=topic.id AND question.reference='MDP medical content seed v1'
        LEFT JOIN flashcard_decks deck ON deck.course_id=course.id AND deck.created_by=$1
        LEFT JOIN flashcards card ON card.deck_id=deck.id
        WHERE course.course_code = ANY($2::text[])
      `,
        [ownerId, courses.map((course) => course.code)],
      );
      if (
        Number(audit.courses) !== 14 ||
        Number(audit.mcqs) !== 560 ||
        Number(audit.essays) !== 56 ||
        Number(audit.decks) !== 56 ||
        Number(audit.cards) !== 280 ||
        Number(audit.invalid_option_count_mcqs) !== 0 ||
        Number(audit.invalid_correct_answer_mcqs) !== 0
      ) {
        throw new Error(`Seed verification failed: ${JSON.stringify(audit)}`);
      }
      console.log({
        seed: 'medical-v1',
        owner: ownerEmail,
        ...audit,
        resources: 0,
      });
    });
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
