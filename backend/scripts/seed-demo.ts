import "dotenv/config";
import * as argon2 from "argon2";
import { AppDataSource } from "../src/database/data-source";
import { generateForensicCode } from "../src/modules/users/forensic-code";

const ids = {
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
  questions: Array.from({ length: 200 }, (_, index) => index + 1).map(
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
      const existing = await manager.query(
        `SELECT id, forensic_code FROM users WHERE email = $1 OR phone_number = $2`,
        [email, phone],
      );
      if (existing.length) {
        let forensicCode = existing[0].forensic_code;
        if (!forensicCode) {
          forensicCode = generateForensicCode();
          while ((await manager.query(`SELECT 1 FROM users WHERE forensic_code = $1`, [forensicCode])).length) {
            forensicCode = generateForensicCode();
          }
        }
        await manager.query(
          `UPDATE users SET full_name=$1, email=$2, password_hash=$3, phone_number=$4, role=$5, status='ACTIVE', email_verified=TRUE, forensic_code=$6, updated_at=CURRENT_TIMESTAMP WHERE id=$7`,
          [fullName, email, passwordHash, phone, role, forensicCode, existing[0].id],
        );
        return existing[0].id as string;
      }
      let forensicCode = generateForensicCode();
      while ((await manager.query(`SELECT 1 FROM users WHERE forensic_code = $1`, [forensicCode])).length) {
        forensicCode = generateForensicCode();
      }
      const [user] = await manager.query(
        `INSERT INTO users(full_name,email,password_hash,phone_number,role,status,email_verified,failed_login_attempts,forensic_code)
         VALUES($1,$2,$3,$4,$5,'ACTIVE',TRUE,0,$6)
         ON CONFLICT(email) DO UPDATE SET full_name=EXCLUDED.full_name,password_hash=EXCLUDED.password_hash,
           role=EXCLUDED.role,status='ACTIVE',email_verified=TRUE,updated_at=CURRENT_TIMESTAMP
         RETURNING id`,
        [fullName, email, passwordHash, phone, role, forensicCode],
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
      `INSERT INTO semesters(semester_number,title,description)
       SELECT semester_number, 'Semester ' || semester_number, 'Semester ' || semester_number || ' medical curriculum.'
       FROM generate_series(1,6) AS semester_number
       ON CONFLICT(semester_number) DO UPDATE SET title=EXCLUDED.title`,
    );
    const [semesterFive] = await manager.query(
      `SELECT id FROM semesters WHERE semester_number = 5`,
    );
    await manager.query(
      `INSERT INTO courses(id,semester_id,course_code,course_name,slug,description,credit_hours,is_active,display_order) VALUES($1,$2,'CVS-301','Cardiovascular Medicine','cardiovascular-medicine','Cardiovascular foundations, clinical presentations, investigations, and initial management.',6,TRUE,1) ON CONFLICT(id) DO UPDATE SET course_name=EXCLUDED.course_name,description=EXCLUDED.description,is_active=TRUE`,
      [ids.course, semesterFive.id],
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

    const baseQuestionData: Array<[number, string, string, string[], string]> = [
      [0, "Which chamber receives oxygenated blood directly from the pulmonary veins?", "Left atrium", ["Right atrium", "Left ventricle", "Right ventricle", "Coronary sinus"], "The pulmonary veins return oxygenated blood to the left atrium."],
      [0, "Which valve lies between the left atrium and left ventricle?", "Mitral valve", ["Tricuspid valve", "Pulmonary valve", "Aortic valve", "Thebesian valve"], "The mitral valve controls flow from the left atrium into the left ventricle."],
      [0, "Which coronary artery most commonly supplies the anterior interventricular septum?", "Left anterior descending artery", ["Right coronary artery", "Left circumflex artery", "Posterior descending artery", "Obtuse marginal artery"], "Septal branches of the LAD supply the anterior two-thirds of the interventricular septum."],
      [0, "Venous blood from the myocardium drains predominantly into which structure?", "Coronary sinus", ["Pulmonary trunk", "Left atrial appendage", "Ascending aorta", "Superior vena cava directly"], "Most cardiac venous blood reaches the right atrium through the coronary sinus."],
      [0, "Which chamber normally has the thickest myocardial wall?", "Left ventricle", ["Right ventricle", "Left atrium", "Right atrium", "Coronary sinus"], "The left ventricle generates the pressure required for systemic circulation and therefore has the thickest wall."],
      [0, "The sinoatrial node is most commonly supplied by which artery?", "Right coronary artery", ["Left anterior descending artery", "Left circumflex artery in every patient", "Posterior descending artery only", "Internal thoracic artery"], "The SA nodal artery arises from the right coronary artery in most people, although anatomical variation exists."],
      [0, "Which vessel carries deoxygenated blood from the right ventricle?", "Pulmonary artery", ["Pulmonary vein", "Aorta", "Coronary sinus", "Superior vena cava"], "The pulmonary artery carries deoxygenated blood from the right ventricle to the lungs."],

      [1, "Which change most directly increases stroke volume in a healthy heart?", "Increased preload", ["Increased afterload", "Reduced contractility", "Severe tachycardia", "Reduced venous return"], "Within physiological limits, increased preload raises stroke volume through the Frank-Starling mechanism."],
      [1, "Cardiac output equals which product?", "Heart rate multiplied by stroke volume", ["Blood pressure multiplied by resistance", "Preload multiplied by afterload", "Ejection fraction multiplied by pressure", "Stroke volume divided by heart rate"], "Cardiac output is the volume ejected per beat multiplied by the number of beats per minute."],
      [1, "Which phase of the cardiac cycle begins immediately after aortic valve closure?", "Isovolumetric relaxation", ["Rapid ventricular filling", "Atrial systole", "Isovolumetric contraction", "Ventricular ejection"], "Aortic valve closure marks the start of isovolumetric relaxation before the mitral valve opens."],
      [1, "Ejection fraction is calculated as which ratio?", "Stroke volume divided by end-diastolic volume", ["End-systolic volume divided by stroke volume", "Cardiac output divided by heart rate", "End-diastolic volume divided by stroke volume", "Stroke volume divided by end-systolic volume"], "Ejection fraction is the proportion of end-diastolic volume ejected during systole."],
      [1, "An acute increase in systemic vascular resistance primarily increases which variable?", "Left ventricular afterload", ["Left ventricular preload", "Venous compliance", "Heart rate directly", "Pulmonary venous oxygen content"], "Systemic vascular resistance is a major component of the load against which the left ventricle ejects."],
      [1, "Which receptor mediates the main increase in heart rate during sympathetic stimulation?", "Beta-1 adrenergic receptor", ["Beta-2 adrenergic receptor", "Alpha-2 adrenergic receptor", "Muscarinic M2 receptor", "Nicotinic receptor"], "Cardiac beta-1 stimulation increases chronotropy and inotropy."],
      [1, "The first heart sound is produced mainly by closure of which valves?", "Mitral and tricuspid valves", ["Aortic and pulmonary valves", "Mitral and aortic valves", "Tricuspid and pulmonary valves", "Pulmonary and mitral valves"], "S1 occurs with atrioventricular valve closure at the onset of ventricular systole."],

      [2, "Which modifiable factor strongly accelerates atherosclerosis?", "Cigarette smoking", ["Young age", "Female sex before menopause", "High HDL cholesterol", "Regular aerobic exercise"], "Smoking promotes endothelial dysfunction, inflammation, oxidation, and thrombosis."],
      [2, "Which lipoprotein is most directly implicated in atherosclerotic plaque formation?", "LDL cholesterol", ["HDL cholesterol", "Chylomicrons only", "Albumin", "Transferrin"], "Retention and modification of LDL particles within the arterial intima drive atherogenesis."],
      [2, "What is an early cellular feature of an atherosclerotic fatty streak?", "Lipid-laden macrophage foam cells", ["Calcified cardiac myocytes", "Neutrophils filling the media", "Platelets replacing the endothelium", "Smooth muscle loss without lipid"], "Macrophages ingest modified LDL and become foam cells within the intima."],
      [2, "Which condition is considered a major independent cardiovascular risk factor?", "Hypertension", ["Low LDL cholesterol", "Normal body mass index", "Regular exercise", "High dietary fiber intake"], "Hypertension increases endothelial injury and substantially raises cardiovascular risk."],
      [2, "Which plaque feature is associated with greater risk of rupture?", "Thin fibrous cap with a large lipid core", ["Thick fibrous cap with little lipid", "Dense stable calcification only", "Small lipid core without inflammation", "Intact endothelium over dense collagen"], "A thin inflamed cap over a large lipid core characterizes a vulnerable plaque."],
      [2, "Statins reduce cardiovascular risk primarily by lowering which lipid fraction?", "LDL cholesterol", ["HDL cholesterol", "Free fatty acids only", "Phospholipids", "Chylomicron remnants exclusively"], "Statins inhibit hepatic cholesterol synthesis and upregulate LDL receptors, lowering circulating LDL."],
      [2, "Which lifestyle intervention generally improves cardiovascular risk?", "Regular moderate-intensity aerobic activity", ["Starting tobacco use", "Increasing trans-fat intake", "Avoiding all physical activity", "Replacing vegetables with processed meat"], "Regular physical activity improves blood pressure, insulin sensitivity, weight, and lipid profile."],

      [3, "A patient has persistent chest pain and ST elevation. What is the immediate priority?", "Urgent reperfusion assessment", ["Routine outpatient review", "Delay all treatment for serial lipids", "Exercise stress testing during pain", "Discharge after one normal blood pressure"], "STEMI requires rapid reperfusion assessment with immediate antiplatelet and supportive care."],
      [3, "What is the first investigation when acute coronary syndrome is suspected?", "12-lead ECG", ["Elective coronary CT months later", "Exercise treadmill test during active pain", "Routine chest MRI", "Fasting lipid profile only"], "A 12-lead ECG should be obtained rapidly to identify ischemia and guide treatment."],
      [3, "Which biomarker is preferred for detecting myocardial injury?", "Cardiac troponin", ["Serum amylase", "Alkaline phosphatase", "D-dimer in every patient", "C-reactive protein alone"], "Cardiac troponin is the preferred sensitive and specific biomarker for myocardial injury."],
      [3, "ST depression and T-wave inversion during ischemic symptoms most strongly suggest which process?", "Subendocardial ischemia", ["Transmural infarction in every case", "Acute pericarditis", "Normal repolarization", "Hypercalcemia"], "ST depression and T-wave inversion can reflect subendocardial ischemia in NSTE-ACS."],
      [3, "Which antiplatelet drug is usually given early in suspected ACS unless contraindicated?", "Aspirin", ["Warfarin", "Furosemide", "Digoxin", "Verapamil in every patient"], "Aspirin rapidly inhibits platelet thromboxane production and reduces recurrent ischemic events."],
      [3, "Which symptom accompanying chest pain increases suspicion for acute myocardial ischemia?", "Diaphoresis", ["Localized itching", "Isolated ankle trauma", "Chronic painless rash", "Improvement with deep palpation"], "Autonomic symptoms such as sweating, nausea, and pallor commonly accompany acute myocardial ischemia."],
      [3, "Which complication can cause sudden hypotension after an acute myocardial infarction?", "Cardiogenic shock", ["Stable hypertension", "Uncomplicated sinus bradycardia only", "Chronic venous insufficiency", "Mild hyperlipidemia"], "Severe ventricular dysfunction after infarction can reduce cardiac output and cause cardiogenic shock."],

      [4, "Which finding most strongly supports left-sided heart failure?", "Bibasal lung crackles", ["Isolated finger clubbing", "Unilateral calf bruising", "Hyperactive bowel sounds", "Localized wrist swelling"], "Pulmonary venous congestion produces interstitial or alveolar fluid and bibasal crackles."],
      [4, "HFrEF is characterized primarily by which abnormality?", "Reduced left ventricular ejection fraction", ["Isolated right atrial enlargement only", "Normal systolic function in every case", "Increased ejection fraction above 90%", "Absence of structural heart disease"], "HFrEF is heart failure associated with impaired left ventricular systolic ejection."],
      [4, "Which compensatory system promotes sodium retention in heart failure?", "Renin-angiotensin-aldosterone system", ["Kallikrein system alone", "Melatonin pathway", "Thyroid axis only", "Complement pathway"], "Reduced effective perfusion activates RAAS, causing vasoconstriction and sodium and water retention."],
      [4, "Which peptide is released in response to ventricular wall stress?", "B-type natriuretic peptide", ["Insulin", "Cortisol only", "Erythropoietin", "Gastrin"], "BNP is released with ventricular stretch and supports the evaluation of suspected heart failure."],
      [4, "Orthopnea in heart failure is breathlessness that occurs in which situation?", "Lying flat", ["Standing upright", "Eating a small meal", "Moving one finger", "Exposure to bright light"], "Recumbency increases venous return and pulmonary congestion, producing orthopnea."],
      [4, "Which echocardiographic measurement is central to classifying systolic heart failure?", "Left ventricular ejection fraction", ["Aortic diameter alone", "Right atrial pressure by ECG", "Serum sodium concentration", "Respiratory rate"], "Ejection fraction helps distinguish reduced, mildly reduced, and preserved EF phenotypes."],

      [5, "Which medicine improves mortality in HFrEF rather than only relieving congestion?", "ACE inhibitor", ["Short-acting nitrate alone for every patient", "Loop diuretic alone", "Digoxin as universal first-line monotherapy", "Calcium supplement"], "ACE inhibition reduces maladaptive neurohormonal activation and improves outcomes in HFrEF."],
      [5, "A patient with HFrEF remains congested with peripheral edema. Which drug gives rapid symptomatic relief?", "Loop diuretic", ["Statin", "Aspirin only", "Oral iron without deficiency", "Antacid"], "Loop diuretics reduce volume overload and improve congestion symptoms."],
      [5, "Which drug class blocks the harmful effects of chronic sympathetic activation in stable HFrEF?", "Evidence-based beta blocker", ["Nonselective alpha agonist", "Short-acting beta agonist", "First-generation antihistamine", "Proton-pump inhibitor"], "Selected beta blockers reduce mortality when introduced carefully in stable HFrEF."],
      [5, "Which drug class has outcome benefits across a broad range of heart failure ejection fractions?", "SGLT2 inhibitor", ["Routine antibiotic", "Benzodiazepine", "Antacid", "Topical corticosteroid"], "SGLT2 inhibitors reduce heart failure hospitalization and cardiovascular events across EF ranges."],
      [5, "What is an important daily self-monitoring measure for a patient prone to fluid retention?", "Body weight", ["Hair length", "Pupil diameter", "Shoe color", "Handedness"], "A rapid increase in daily weight can indicate accumulating fluid before severe symptoms develop."],
      [5, "Which dietary measure is commonly advised when heart failure congestion is difficult to control?", "Avoid excessive sodium intake", ["Increase processed salty foods", "Drink unlimited fluid regardless of status", "Eliminate all protein", "Consume trans fats at every meal"], "Avoiding excessive sodium can help reduce fluid retention; advice should be individualized."],
    ];
    const questionData: Array<[number, string, string, string[], string]> = Array.from(
      { length: 5 },
      (_, setIndex) => baseQuestionData.map(([topicIndex, text, correct, distractors, explanation]) => [
        topicIndex,
        setIndex === 0 ? text : `${text} (Practice variant ${setIndex + 1})`,
        correct,
        distractors,
        setIndex === 0 ? explanation : `Practice variant ${setIndex + 1}. ${explanation}`,
      ] as [number, string, string, string[], string]),
    ).flat();
    if (questionData.length !== 200) {
      throw new Error(`The cardiovascular demo pool must contain exactly 200 MCQs; received ${questionData.length}`);
    }
    const optionIds: string[] = [];
    for (let i = 0; i < questionData.length; i++) {
      const [topicIndex, text, correct, distractors, explanation] = questionData[i];
      await manager.query(
        `INSERT INTO questions(id,topic_id,question_type,title,question_text,explanation,hint,reference,difficulty,estimated_time_seconds,marks,is_question_bank,version,is_active,created_by) VALUES($1,$2,'MCQ',$3::varchar,$3::text,$4::text,'Focus on the core mechanism.','Seeded academic content','MEDIUM',75,1,TRUE,1,TRUE,$5) ON CONFLICT(id) DO UPDATE SET topic_id=EXCLUDED.topic_id,question_text=EXCLUDED.question_text,explanation=EXCLUDED.explanation,is_question_bank=TRUE,is_active=TRUE`,
        [ids.questions[i], ids.topics[topicIndex], text, explanation, instructorId],
      );
      const options = [correct, ...distractors];
      for (let j = 0; j < options.length; j++) {
        const optionId = `71000000-0000-4000-${(i + 1).toString().padStart(4, "0")}-${(j + 1).toString().padStart(12, "0")}`;
        if (j === 0) optionIds.push(optionId);
        const optionExplanation = j === 0
          ? explanation
          : `This option does not best answer the question. ${explanation}`;
        await manager.query(
          `INSERT INTO mcq_options(id,question_id,option_text,explanation,is_correct,display_order) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET option_text=EXCLUDED.option_text,explanation=EXCLUDED.explanation,is_correct=EXCLUDED.is_correct,display_order=EXCLUDED.display_order`,
          [optionId, ids.questions[i], options[j], optionExplanation, j === 0, j + 1],
        );
      }
    }

    const testData = [
      [
        "Week 1 Cardiovascular Review",
        "WEEK",
        ids.weeks[0],
        40,
        "40.00",
        "24.00",
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
    for (let i = 0; i < baseQuestionData.length; i++)
      await manager.query(
        `INSERT INTO test_questions(test_id,question_id,display_order,marks) VALUES($1,$2,$3,1) ON CONFLICT(test_id,question_id) DO NOTHING`,
        [ids.tests[0], ids.questions[i], i + 1],
      );
    for (let i = 0; i < ids.questions.length; i++)
      await manager.query(
        `INSERT INTO test_questions(test_id,question_id,display_order,marks) VALUES($1,$2,$3,1) ON CONFLICT(test_id,question_id) DO NOTHING`,
        [ids.tests[1], ids.questions[i], i + 1],
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
      `INSERT INTO flashcard_decks(id,course_id,week_id,lecture_id,topic_id,created_by,title,description,is_published,display_order)
       VALUES($1,$2,$3,$4,NULL,$5,'Cardiovascular High-Yield Review','Front-and-back cards linked to the seeded bundle.',TRUE,1)
       ON CONFLICT(id) DO UPDATE SET
         course_id=EXCLUDED.course_id,
         week_id=EXCLUDED.week_id,
         lecture_id=EXCLUDED.lecture_id,
         topic_id=NULL,
         is_published=TRUE,
         title=EXCLUDED.title`,
      [ids.deck, ids.course, ids.weeks[2], ids.lectures[5], instructorId],
    );
    for (let i = 0; i < Math.min(questionData.length, 8); i++)
      await manager.query(
        `INSERT INTO flashcards(id,deck_id,title,front_content,back_content,difficulty,explanation,estimated_review_seconds,display_order,is_active) VALUES($1,$2,$3::varchar,$3::text,$4::text,'MEDIUM',$5::text,45,$6,TRUE) ON CONFLICT(id) DO UPDATE SET front_content=EXCLUDED.front_content,back_content=EXCLUDED.back_content,is_active=TRUE`,
        [
          `91000000-0000-4000-8000-${(i + 1).toString().padStart(12, "0")}`,
          ids.deck,
          questionData[i][1],
          questionData[i][2],
          questionData[i][4],
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

    // Seed curriculum/content, but never fabricate learning history. The demo
    // account is reset so dashboards start from genuine student interactions.
    await manager.query("DELETE FROM student_answers WHERE attempt_id IN (SELECT id FROM test_attempts WHERE student_id=$1)", [studentId]);
    await manager.query("DELETE FROM test_attempts WHERE student_id=$1", [studentId]);
    await manager.query("DELETE FROM student_question_progress WHERE student_id=$1", [studentId]);
    await manager.query("DELETE FROM student_topic_progress WHERE student_id=$1", [studentId]);
    await manager.query("DELETE FROM student_flashcard_progress WHERE student_id=$1", [studentId]);
    await manager.query("DELETE FROM student_lecture_progress WHERE student_id=$1", [studentId]);
    await manager.query("DELETE FROM student_course_progress WHERE student_id=$1", [studentId]);
    await manager.query("DELETE FROM study_plan_items WHERE student_id=$1", [studentId]);

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
        "PEARL",
        "Persistent pain, hemodynamic instability, dynamic ECG changes, and malignant arrhythmias require urgent escalation.",
        false,
        ids.questions[3],
        ids.lectures[3],
      ],
      [
        "b2000000-0000-4000-8000-000000000003",
        "Cardiac cycle checkpoints",
        "PERSONAL",
        "Follow pressure changes through atrial systole, isovolumetric contraction, ejection, and ventricular relaxation.",
        false,
        ids.questions[1],
        ids.lectures[1],
      ],
    ];
    for (const note of noteData) {
      await manager.query(
        `INSERT INTO notebook_notes(id,user_id,title,note_type,content,metadata,collection_id,is_favorite,review_at,linked_question_id,linked_lecture_id) VALUES($1,$2,$3,$4,$5,'{"source":"demo-seed"}'::jsonb,$6,$7,CURRENT_TIMESTAMP+INTERVAL '3 days',$8,$9) ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,note_type=EXCLUDED.note_type,content=EXCLUDED.content,collection_id=EXCLUDED.collection_id,is_favorite=EXCLUDED.is_favorite,review_at=EXCLUDED.review_at,linked_question_id=EXCLUDED.linked_question_id,linked_lecture_id=EXCLUDED.linked_lecture_id`,
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

    await manager.query(
      `INSERT INTO student_study_plans(student_id,target_exam,exam_date,daily_question_target,weekly_hours_target,daily_flashcard_target,preferences,generated_at,schedule_version)
       VALUES($1,NULL,NULL,20,10,20,'{"available_days":[1,2,3,4,5,6],"rest_day":0,"planning_horizon_days":30}'::jsonb,NULL,0)
       ON CONFLICT(student_id) DO UPDATE SET target_exam=NULL,exam_date=NULL,
        daily_question_target=20,weekly_hours_target=10,daily_flashcard_target=20,
        preferences=EXCLUDED.preferences,generated_at=NULL,schedule_version=0`,
      [studentId],
    );

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
