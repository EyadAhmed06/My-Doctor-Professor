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
  questions: Array.from({ length: 40 }, (_, index) => index + 1).map(
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

    const questionData: Array<[number, string, string, string[], string]> = [
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

    await manager.query(
      `INSERT INTO student_course_progress(student_id,course_id,completion_percentage,lectures_completed,total_lectures,average_score,last_accessed_at) VALUES($1,$2,58.33,3,6,76.00,CURRENT_TIMESTAMP) ON CONFLICT(student_id,course_id) DO UPDATE SET completion_percentage=58.33,lectures_completed=3,total_lectures=6,average_score=76.00,last_accessed_at=CURRENT_TIMESTAMP`,
      [studentId, ids.course],
    );
    for (let i = 0; i < ids.lectures.length; i++)
      await manager.query(
        `INSERT INTO student_lecture_progress(student_id,lecture_id,is_completed,completion_percentage,time_spent_minutes,last_accessed_at,completed_at) VALUES($1,$2,$3,$4,$5,CURRENT_TIMESTAMP,$6) ON CONFLICT(student_id,lecture_id) DO UPDATE SET is_completed=EXCLUDED.is_completed,completion_percentage=EXCLUDED.completion_percentage,time_spent_minutes=EXCLUDED.time_spent_minutes,last_accessed_at=EXCLUDED.last_accessed_at,completed_at=EXCLUDED.completed_at`,
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
    for (let i = 0; i < Math.min(questionData.length, 8); i++)
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
