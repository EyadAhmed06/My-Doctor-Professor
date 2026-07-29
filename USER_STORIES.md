# USER STORIES & REQUIREMENTS

**Project:** My Doctor Professor  
**Version:** 1.0  
**Format:** Agile User Story Format

---

## 👨‍🎓 STUDENT USER STORIES

### Story 1: User Registration (Student)
```
As a medical student,
I want to register for an account on the platform,
So that I can access courses and learning materials.

Acceptance Criteria:
□ I can fill in a registration form with:
  - Full name, email, password, phone number
  - Student number, current semester
□ System validates:
  - Email is unique and valid format
  - Phone number is unique and valid format
  - Password is at least 8 characters
  - Student number is provided and unique
□ On success, I receive:
  - Access token (24 hours validity)
  - Refresh token (7 days validity)
  - Confirmation to verify email
□ On error, I see appropriate error messages

Business Rules:
- Email must be unique across all users
- Phone must be unique across all users
- Student number must be unique for students
- Account starts in PENDING_VERIFICATION status
- Password must be hashed using bcrypt
```

### Story 2: User Login
```
As a student,
I want to log in with my email and password,
So that I can access my courses and progress.

Acceptance Criteria:
□ I can enter email and password
□ System validates credentials
□ On success:
  - I receive access token and can access protected endpoints
  - My last login time is recorded
  - Failed login attempts are reset
□ On failure:
  - Account locks after 5 failed attempts for 15 minutes
  - I see appropriate error message

Business Rules:
- Email is case-insensitive
- Password comparison is case-sensitive
- Account lockout is 15 minutes
- Failed attempts reset after successful login or lockout period
```

### Story 3: View Course Materials
```
As a student,
I want to view course materials organized by weeks and lectures,
So that I can systematically learn the content.

Acceptance Criteria:
□ I can see all semesters I'm enrolled in
□ For each semester, I see courses
□ For each course, I see weeks and lectures in order
□ For each lecture, I see:
  - Lecture title and description
  - Topics within lecture
  - Resources (PDFs, videos, etc.)
  - Publishing status (only published lectures visible)
□ I can download/view resources
□ Progress indicators show:
  - Lectures completed vs total
  - Topics mastered
  - Overall course completion %

Business Rules:
- Students see only enrolled courses
- Only published lectures visible
- Resources accessible only for published lectures
- Cannot access future weeks/lectures until prerequisites complete
```

### Story 4: Practice Questions
```
As a student,
I want to practice questions from the question bank,
So that I can prepare for assessments.

Acceptance Criteria:
□ I can filter questions by:
  - Topic, course, difficulty level
  - Question type (MCQ, Essay)
□ For each MCQ question, I can:
  - Read question and options
  - Select an answer
  - See if correct (with explanation)
  - See model answer
  - Skip to next question
□ For each Essay question, I can:
  - Read question and guidelines
  - Type my answer
  - Submit for manual grading
  - See model answer
□ My progress is tracked:
  - Questions attempted and correct
  - Time spent
  - Difficulty statistics
□ I can bookmark difficult questions for review

Business Rules:
- MCQ questions auto-graded immediately
- Essay questions show model answer after submission
- Score = (correct answers / total) * 100
- Progress persists across sessions
- Can attempt same question multiple times
```

### Story 5: Take a Test
```
As a student,
I want to take timed and untimed tests,
So that I can assess my knowledge and prepare for exams.

Acceptance Criteria:
□ I can see list of available tests
□ For each test, I see:
  - Title, description, duration
  - Number of questions
  - Passing score
  - Whether I've attempted it before
□ When I start a test:
  - Timer starts (if timed mode)
  - Questions appear one by one or all at once
  - Cannot go back (depends on test config)
□ During test:
  - Can mark question for review
  - Can add notes to questions
  - Can flag difficult questions
□ On submission:
  - Test is auto-graded
  - See score immediately
  - Can review answers
  - See which questions were correct/incorrect
□ Score is recorded in progress tracking

Business Rules:
- Can only take test if currently available (time window)
- Timed tests auto-submit when time runs out
- Cannot resume test once submitted
- Score calculation: (correct answers * marks) / total marks * 100
- Essay questions manually graded later
```

### Story 6: Use Flashcards
```
As a student,
I want to use flashcards with spaced repetition,
So that I can efficiently memorize and retain information.

Acceptance Criteria:
□ I can see list of flashcard decks
□ When studying deck:
  - See front (question)
  - Click to reveal back (answer)
  - Mark as "Easy", "Good", "Hard", "Very Hard"
□ System uses spaced repetition algorithm:
  - "Easy" cards → reviewed in 4 days
  - "Good" cards → reviewed in 2 days
  - "Hard" cards → reviewed tomorrow
  - "Very Hard" cards → reviewed today
□ Track progress:
  - Cards mastered
  - Cards in review
  - Success rate
□ Cards I mark difficult appear more frequently

Business Rules:
- Spaced repetition algorithm: SM-2 or similar
- Initial interval: 1 day
- Ease factor increases/decreases based on performance
- Can't master deck until all cards pass certain threshold
- Progress is tracked per student per card
```

### Story 7: Track Progress
```
As a student,
I want to see my learning progress,
So that I know what I've completed and what needs work.

Acceptance Criteria:
□ I can see dashboard showing:
  - Courses enrolled and completion %
  - Lectures completed vs total per course
  - Topics mastered vs total per course
  - Test scores and trends
□ For each course:
  - Week-by-week breakdown
  - Topics and mastery levels
  - Average scores on tests
□ I can see weak areas:
  - Topics with low scores
  - Frequently incorrect questions
  - Recommended review materials

Business Rules:
- Completion % = (completed items / total items) * 100
- Mastery = high score on questions + flashcards
- Progress updated in real-time
- Historical data maintained for trend analysis
- Cannot complete course until all lectures completed
```

---

## 🏫 INSTRUCTOR USER STORIES

### Story 8: Create Course
```
As an instructor,
I want to create courses and organize content,
So that I can structure my teaching materials.

Acceptance Criteria:
□ I can create course with:
  - Course code, name, description
  - Semester, credit hours
□ Courses appear in semester structure
□ I can edit course details
□ I can delete course (only if no enrolled students)
□ Course is inactive until published

Business Rules:
- Course code must be unique
- Course must belong to a semester
- Course slug auto-generated from name
- Display order determines sequence
- Only instructor who created can edit
- Admin can override
```

### Story 9: Organize Content by Weeks and Lectures
```
As an instructor,
I want to organize content by weeks and lectures,
So that students can follow a structured learning path.

Acceptance Criteria:
□ I can add weeks to course in order
□ For each week, I can add lectures
□ For each lecture, I can add topics
□ For each topic, I can add resources
□ I can reorder weeks, lectures, topics
□ Display order determines sequence for students

Business Rules:
- Week number unique within course
- Lecture number unique within week
- Can't skip week/lecture numbers
- Display order affects UI ordering
```

### Story 10: Upload Resources
```
As an instructor,
I want to upload lecture resources (PDFs, videos, images),
So that students can access diverse learning materials.

Acceptance Criteria:
□ I can upload resources to lectures
□ Supported types: PDF, VIDEO, IMAGE, LINK
□ For files:
  - Upload to cloud storage
  - Track file size
  - Show upload progress
□ For links:
  - Store external URL
□ Resource appears in lecture page
□ Students can download/view/watch

Business Rules:
- Max file size: 50MB per file
- Supports: PDF, MP4, WebM, JPG, PNG
- Files stored in cloud (AWS S3, etc.)
- Virus scan uploaded files
- URL validation for external links
```

### Story 11: Create Question Bank
```
As an instructor,
I want to create questions for practice and testing,
So that I can assess student knowledge.

Acceptance Criteria:
□ I can create MCQ questions:
  - Question text, explanation, hint
  - Multiple choice options (2-4)
  - Mark correct answer
  - Set difficulty and marks
□ I can create Essay questions:
  - Question text, explanation, hint
  - Word count guidelines (min/max)
  - Model answer and grading rubric
□ Questions associated with topics
□ Can add tags for filtering
□ Questions stored in reusable bank

Business Rules:
- MCQ must have exactly 1 correct answer
- Options can't be duplicates
- Difficulty: EASY, MEDIUM, HARD
- Marks must be positive number
- Can edit question after creation (version control)
- Can duplicate question to reuse
```

### Story 12: Create Tests
```
As an instructor,
I want to create tests/quizzes,
So that I can assess student understanding.

Acceptance Criteria:
□ I can create test with:
  - Title, description, test type
  - Duration (minutes), total marks, passing marks
  - Available time window (from/until date)
□ I can add questions from question bank
□ I can set marks per question
□ I can set question-specific time limits
□ Questions can be randomized
□ Test can be TIMED or TUTOR mode

Business Rules:
- Test must have at least 1 question
- Duration: optional for TUTOR mode
- Total marks auto-calculated from question marks
- Question order can be randomized per student
- Can shuffle options per student
- Can set attempt limits
```

### Story 13: View Student Performance
```
As an instructor,
I want to see student test scores and performance,
So that I can identify struggling students.

Acceptance Criteria:
□ I can see list of tests I created
□ For each test:
  - Number of students who took it
  - Average score, highest/lowest scores
  - Score distribution
□ For each student:
  - Their score on each question
  - Time spent
  - Which questions they got wrong
  - Their answers vs correct answers
□ Can export results as CSV/PDF
□ Can see trends over time

Business Rules:
- Only see students in own courses
- Can only grade essay questions
- Score = sum of correct answers
- Time tracked per question and total
```

### Story 14: Grade Essay Questions
```
As an instructor,
I want to manually grade essay questions,
So that I can evaluate student understanding.

Acceptance Criteria:
□ I see list of ungraded essay questions
□ For each answer:
  - See student's answer
  - See model answer and rubric
  - Enter marks/score
  - Add feedback comments
□ On submit:
  - Mark as graded
  - Send notification to student
  - Update their score
□ Can change grades if needed

Business Rules:
- Marks must be 0 to question's max marks
- Feedback optional but recommended
- Notification sent to student when graded
- Grade finalized when submitted
- Can edit grades before finalizing semester
```

---

## 🔐 ADMINISTRATOR STORIES

### Story 15: Manage Users
```
As an admin,
I want to manage user accounts,
So that I can maintain system security and integrity.

Acceptance Criteria:
□ I can view all users with filters:
  - By role (Student, Instructor, Admin)
  - By status (Active, Pending, Suspended)
  - By semester (for students)
□ I can:
  - Create new users (any role)
  - Edit user details
  - Suspend/activate accounts
  - Reset passwords
  - Delete accounts
□ Bulk operations:
  - Upload CSV to create multiple students
  - Bulk email users

Business Rules:
- Can't delete users with associated content
- Suspension prevents login
- Password reset sends email with temp password
- Email uniqueness maintained
- Audit log all user changes
```

### Story 16: View System Statistics
```
As an admin,
I want to see system-wide statistics,
So that I can monitor platform usage and health.

Acceptance Criteria:
□ Dashboard shows:
  - Total users by role
  - Course enrollment statistics
  - Test completion rates
  - Average student scores
  - Most popular questions/courses
□ Can filter by:
  - Semester, course, date range
□ Can export reports as PDF/CSV

Business Rules:
- Data aggregated from all students
- Real-time or cached (within 1 hour)
- No PII in aggregated data
```

### Story 17: Audit Logs
```
As an admin,
I want to see all system activities,
So that I can track and audit user actions.

Acceptance Criteria:
□ I can see audit logs showing:
  - User who performed action
  - Action type (LOGIN, CREATE, UPDATE, DELETE, etc.)
  - Entity affected
  - Timestamp
  - Changes made (old vs new values)
□ Can filter by:
  - User, action type, entity, date range
□ Can export logs for external audit

Business Rules:
- All modifications logged
- Sensitive actions logged (login, password change, etc.)
- Logs retained for compliance (typically 2+ years)
- Cannot delete logs
```

---

## ACCEPTANCE CRITERIA CHECKLIST

### For All User Stories
```
Functional Requirements:
□ Core functionality works as specified
□ All acceptance criteria pass
□ Happy path and error cases handled
□ Data persists correctly

Security Requirements:
□ Authentication required for protected endpoints
□ Authorization checks passed
□ Input validation prevents attacks
□ No sensitive data exposure
□ Audit logging in place

Performance Requirements:
□ Page loads in < 2 seconds
□ API responses in < 500ms
□ Can handle 1000 concurrent users
□ Database queries optimized

Code Quality:
□ TypeScript strict mode
□ No console.log or debug code
□ Proper error handling
□ Code reviewed
□ Tests written (80%+ coverage)
```

---

## SUMMARY

### Implemented User Stories (Phase 1) ✅
- Story 1: User Registration (Student)
- Story 2: User Login

### To Implement (Phase 2-6) ⏳
- Stories 3-6: Student features (Courses, Questions, Tests, Flashcards)
- Stories 7: Progress tracking
- Stories 8-14: Instructor features
- Stories 15-17: Admin features

Total: 17 core user stories covering all major features

---

**Next Document:** Implementation Roadmap with Phase-by-Phase approach

