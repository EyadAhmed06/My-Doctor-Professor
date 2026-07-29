# PRODUCT DEFINITION & SPECIFICATION

**Project:** My Doctor Professor - Medical Learning Platform  
**Version:** 1.0  
**Date:** July 29, 2026

---

## 📋 PRODUCT OVERVIEW

### What Is This System?

**My Doctor Professor** is a comprehensive web-based medical education platform that enables:

1. **Students** to learn medical content through organized courses
2. **Instructors** to create and manage courses, tests, and learning materials
3. **Administrators** to oversee the entire system

### Core Purpose
Provide a structured learning environment where medical students can:
- Study course materials organized by semesters
- Practice questions with different difficulty levels
- Take timed and untimed tests/exams
- Use flashcards for efficient memorization (spaced repetition)
- Track their progress and performance
- Receive notifications about upcoming events

### Target Users
1. **Medical Students** - Primary users learning medical content
2. **Medical Instructors** - Create content and assess students
3. **System Administrators** - Manage users and system configuration

---

## 🎯 HIGH-LEVEL SYSTEM GOALS

### For Students
- Learn medical content systematically
- Practice with various question types (MCQ, Essay)
- Track learning progress
- Prepare for exams
- Get feedback on performance
- Improve retention with flashcards

### For Instructors
- Create structured courses
- Organize content by semesters, weeks, lectures
- Create and manage question banks
- Build and administer tests
- Track student performance
- Manage learning materials

### For Administrators
- Manage users and roles
- Monitor system health
- Generate reports
- Manage system configuration
- Audit user activities

---

## 📊 SYSTEM HIERARCHY (The Structure)

```
SEMESTER 1
├── Course 1: Anatomy
│   ├── Week 1
│   │   ├── Lecture 1: Introduction to Anatomy
│   │   │   ├── Topic 1: Skeletal System
│   │   │   ├── Topic 2: Muscular System
│   │   │   └── Resources (PDFs, Videos)
│   │   └── Lecture 2: Body Systems
│   │       └── Topics & Resources
│   ├── Week 2
│   │   └── Similar structure...
│   └── Tests/Assessments related to this course
│
├── Course 2: Physiology
│   └── Similar hierarchy...
│
└── Flashcard Decks
    ├── Deck 1: Anatomy Basics
    └── Deck 2: Physiology Terms

STUDENT PROGRESS TRACKING
├── Course 1: 45% complete
├── Lecture progress
├── Topic mastery levels
└── Question performance metrics

QUESTION BANK (Shared)
├── Anatomy Questions (tagged by topic, difficulty)
├── Physiology Questions
└── Other subject questions

TESTS/ASSESSMENTS
├── Test 1: Week 1 Assessment
├── Test 2: Course Final Exam
└── Test 3: Custom Practice Test
```

---

## 📝 CORE ENTITIES (What Is An Entity?)

### What Is An Entity?

**Simple Definition:**
An Entity is a thing/object that exists in your database. It represents real-world objects.

**In NestJS + TypeORM:**
- Entity = Database table with columns
- Each Entity class = One database table
- Each property in Entity class = One column in table

### Example Entity: User

```typescript
// This represents the 'users' table in PostgreSQL
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;  // Column 1: id (unique identifier)
  
  @Column()
  email: string;  // Column 2: email
  
  @Column()
  fullName: string;  // Column 3: fullName
  
  @Column()
  passwordHash: string;  // Column 4: passwordHash
}

// In database, this creates:
// CREATE TABLE users (
//   id UUID PRIMARY KEY,
//   email VARCHAR NOT NULL,
//   fullName VARCHAR NOT NULL,
//   passwordHash TEXT NOT NULL
// )
```

---

## 🗄️ ALL ENTITIES NEEDED FOR THIS PROJECT

### 1. USER ENTITIES (Authentication & Identity)
```
User (base user - all roles inherit from this)
├── Student (extends User for students)
├── Instructor (extends User for teachers)
└── SystemAdmin (extends User for admins)
```

### 2. ACADEMIC HIERARCHY ENTITIES (Course Structure)
```
Semester (e.g., "Semester 1", "Semester 2")
└── Course (e.g., "Anatomy 101", "Physiology 202")
    └── Week (e.g., "Week 1", "Week 2")
        └── Lecture (e.g., "Introduction", "Body Systems")
            ├── Topic (e.g., "Skeletal System", "Organs")
            └── Resource (PDFs, Videos, Links)
```

### 3. QUESTION BANK ENTITIES
```
Question (Individual question: MCQ or Essay)
├── MCQOption (Multiple choice options)
├── EssayConfiguration (Essay specific settings)
└── Tag (Labels for questions: "Anatomy", "Difficult", etc.)
```

### 4. TEST/ASSESSMENT ENTITIES
```
Test (A test/exam)
├── TestQuestion (Questions included in test)
├── TestAttempt (When student takes the test)
│   ├── StudentAnswer (Each answer student gives)
│   ├── QuestionFlag (Student marks question for review)
│   └── QuestionNote (Student's notes on question)
└── (Grading info)
```

### 5. FLASHCARD ENTITIES
```
FlashcardDeck (Collection of flashcards)
├── Flashcard (Individual card: front/back)
└── StudentFlashcardProgress (Tracking spaced repetition)
```

### 6. PROGRESS TRACKING ENTITIES
```
StudentCourseProgress (Tracks course completion)
StudentLectureProgress (Tracks lecture completion)
StudentTopicProgress (Tracks topic mastery)
StudentQuestionProgress (Tracks question performance)
```

### 7. SYSTEM ENTITIES
```
Notification (System notifications)
UserNotification (User's notifications)
AuditLog (Activity tracking)
```

**TOTAL: 30+ entities**

---

## 🔄 RELATIONSHIPS BETWEEN ENTITIES

### Hierarchy Relationships
```
Semester --has many--> Course --has many--> Week --has many--> Lecture --has many--> Topic
                                                                   |
                                                                   v
                                                              Resource
```

### User Relationships
```
User --extends--> Student
User --extends--> Instructor (can create content)
User --extends--> SystemAdmin

Instructor --creates--> Question
Instructor --creates--> Test
Instructor --creates--> FlashcardDeck
```

### Question & Test Relationships
```
Question --included in many--> Test
Test --attempted by many--> TestAttempt
TestAttempt --contains many--> StudentAnswer
StudentAnswer --answers--> Question
```

### Progress Tracking
```
Student --tracks--> StudentCourseProgress
Student --tracks--> StudentLectureProgress
Student --tracks--> StudentQuestionProgress
Student --reviews--> StudentFlashcardProgress
```

---

## ✅ KEY CHARACTERISTICS OF THIS SYSTEM

### Data Organization
- Hierarchical (Semester → Course → Week → Lecture → Topic)
- Role-based (Student, Instructor, Admin see different things)
- Tracked (Every action is logged in audit)
- Progressive (Tracks student learning progress)

### Key Features
1. **Structured Learning** - Content organized by semester/course/week
2. **Assessment** - Tests with auto-grading for MCQ
3. **Question Banks** - Reusable questions across tests
4. **Spaced Repetition** - Flashcards with smart scheduling
5. **Progress Tracking** - Student performance metrics
6. **Role-Based Access** - Different views for different roles
7. **Notifications** - Keep users informed
8. **Audit Trail** - Track all important actions

### Data Integrity
- Foreign keys (maintain relationships)
- Constraints (ensure data validity)
- Triggers (auto-update timestamps)
- Transactions (data consistency)

---

## 🎯 SYSTEM CAPABILITIES

### What Students Can Do
- [x] Register and login
- [x] View enrolled courses
- [x] Access course materials (lectures, topics, resources)
- [x] Practice questions from question bank
- [x] Take tests/quizzes
- [x] Review test results
- [x] Use flashcards for learning
- [x] Track their progress
- [x] See notifications
- [x] Mark questions as difficult/bookmarked

### What Instructors Can Do
- [x] Create and manage courses
- [x] Organize content (semesters, weeks, lectures, topics)
- [x] Upload resources (PDFs, videos)
- [x] Create question banks
- [x] Create tests/quizzes
- [x] Create flashcard decks
- [x] Grade essay questions
- [x] View student performance
- [x] Send notifications
- [x] Create flashcard decks

### What Admins Can Do
- [x] Create users (students, instructors, admins)
- [x] Manage all content
- [x] View system statistics
- [x] Manage permissions
- [x] View audit logs
- [x] Configure system settings

---

## 📊 EXAMPLE DATA FLOW

### Student Taking a Test
```
1. Student logs in
2. Views "Tests" section
3. Sees "Week 1 Quiz" available
4. Clicks "Start Test"
5. System creates TestAttempt record
6. Student sees questions one by one
7. Student selects/types answer
8. System creates StudentAnswer record
9. Student can flag question for review
10. Student can add notes
11. Student clicks "Submit Test"
12. System grades MCQ questions automatically
13. System calculates score
14. StudentAnswer gets "is_correct" flag
15. TestAttempt marked as "SUBMITTED"
16. Student sees results page
17. Student can review answers
18. System tracks StudentQuestionProgress
```

### Instructor Viewing Progress
```
1. Instructor logs in
2. Views "Analytics" section
3. Selects "Anatomy 101" course
4. Sees dashboard with:
   - Students enrolled: 45
   - Average completion: 68%
   - Average test score: 72%
   - Topics: list of topics with completion %
5. Can drill down to individual student
6. Sees that student's progress on each topic
```

---

## 🔐 ROLE-BASED ACCESS CONTROL

### Student Can Access
- Own profile
- Enrolled courses
- Practice questions (from their courses)
- Their tests (only those assigned to them)
- Their progress data
- Their notifications
- Their flashcard decks

### Instructor Can Access
- Own profile
- Created courses and content
- Created tests and questions
- Student performance on their tests
- Their flashcard decks
- Notifications related to their courses

### Admin Can Access
- Everything
- All users
- All content
- System-wide reports
- Audit logs
- System settings

---

## 💡 BUSINESS RULES & CONSTRAINTS

### User Rules
- Email must be unique
- Phone number must be unique
- Password must be 8+ characters
- Student number must be unique
- Cannot create account with same email

### Academic Rules
- Semester number must be positive integer
- Course must belong to a semester
- Week must belong to a course
- Lecture must belong to a week
- Topic must belong to a lecture
- Week and lecture numbers must be unique within their parent

### Question Rules
- Question must have a topic
- MCQ must have 2-4 options
- Exactly one MCQ option must be correct
- Essay questions must have word count guidance
- Question difficulty: EASY, MEDIUM, HARD
- Question type: MCQ, ESSAY

### Test Rules
- Test must have at least 1 question
- Test can be TIMED or TUTOR mode
- Test has duration in minutes
- Student can only take test if:
  - Test is published
  - Current time is between available_from and available_until
  - Student hasn't exceeded attempt limit (if any)

### Grading Rules
- MCQ questions auto-graded (correct or incorrect)
- Essay questions manually graded by instructor
- Score = sum of correct answers
- Passing score must be less than total marks

### Progress Rules
- Completion percentage: (completed items / total items) * 100
- Progress only increases, never decreases
- When all lectures in course completed → course complete
- Mastery of topic: high score on questions + flashcards

---

## 🚀 NEXT STEPS

This product definition establishes:
✅ What the system does  
✅ Who uses it  
✅ What entities exist  
✅ How they relate  
✅ What business rules apply  

**Next Document:** Complete API Specification with all endpoints

