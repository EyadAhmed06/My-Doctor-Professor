# COMPLETE API SPECIFICATION

**Project:** My Doctor Professor  
**Version:** 1.0  
**Base URL:** `http://localhost:3000/api` (development) or `https://api.mydoctorprofessor.com` (production)  
**Authentication:** JWT Bearer Token

---

## 📋 API ORGANIZATION

```
/api/v1/
├── /auth          - Authentication (login, signup, token refresh)
├── /users         - User profiles and management
├── /academic      - Courses, weeks, lectures, topics
├── /questions     - Question bank management
├── /tests         - Test/assessment management
├── /flashcards    - Flashcard decks and cards
├── /progress      - Student progress tracking
├── /notifications - User notifications
└── /admin         - Admin operations
```

---

## 🔐 AUTHENTICATION ENDPOINTS

### 1. User Registration
```
POST /api/v1/auth/signup

Request Body:
{
  "full_name": "John Doe",
  "email": "john@university.edu",
  "password": "SecurePass123!",
  "phone_number": "+1234567890",
  "role": "STUDENT",  // or "INSTRUCTOR" or "SYSTEM_ADMIN"
  
  // For STUDENT role:
  "student_number": "STU001",
  "current_semester": 1,
  
  // For INSTRUCTOR role:
  "specialization": "Cardiology",
  "office_location": "Room 305"
}

Response (201 Created):
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "john@university.edu",
    "fullName": "John Doe",
    "role": "STUDENT",
    "status": "PENDING_VERIFICATION"
  }
}

Error Responses:
400 Bad Request - Missing required fields
409 Conflict - Email or phone already exists
422 Unprocessable Entity - Invalid email format
```

### 2. User Login
```
POST /api/v1/auth/login

Request Body:
{
  "email": "john@university.edu",
  "password": "SecurePass123!"
}

Response (200 OK):
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "john@university.edu",
    "fullName": "John Doe",
    "role": "STUDENT",
    "status": "ACTIVE"
  }
}

Error Responses:
401 Unauthorized - Invalid credentials
429 Too Many Requests - Too many failed login attempts (account locked)
```

### 3. Refresh Token
```
POST /api/v1/auth/refresh

Request Body:
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}

Response (200 OK):
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}

Error Responses:
401 Unauthorized - Invalid refresh token
```

### 4. Get Current User Profile
```
GET /api/v1/auth/me

Headers:
Authorization: Bearer <access_token>

Response (200 OK):
{
  "id": "uuid",
  "email": "john@university.edu",
  "fullName": "John Doe",
  "phoneNumber": "+1234567890",
  "role": "STUDENT",
  "status": "ACTIVE",
  "profilePictureUrl": null,
  "emailVerified": false,
  "createdAt": "2026-07-29T14:30:00Z",
  "updatedAt": "2026-07-29T14:30:00Z"
}

Error Responses:
401 Unauthorized - Missing or invalid token
```

### 5. Logout
```
POST /api/v1/auth/logout

Headers:
Authorization: Bearer <access_token>

Response (204 No Content):
{}

Error Responses:
401 Unauthorized - Invalid token
```

---

## 👤 USER ENDPOINTS

### 6. Get User Profile (Other Users)
```
GET /api/v1/users/:userId

Headers:
Authorization: Bearer <access_token>

Response (200 OK):
{
  "id": "uuid",
  "email": "john@university.edu",
  "fullName": "John Doe",
  "role": "STUDENT",
  "status": "ACTIVE",
  "profilePictureUrl": "https://...",
  "phoneNumber": "+1234567890"  // Only if requestor is admin
}

Error Responses:
401 Unauthorized
404 Not Found - User doesn't exist
```

### 7. Update User Profile
```
PUT /api/v1/users/:userId

Headers:
Authorization: Bearer <access_token>

Request Body (any combination):
{
  "fullName": "John Updated",
  "phone_number": "+0987654321",
  "profilePictureUrl": "https://...",
  "dateOfBirth": "1990-05-15"
}

Response (200 OK):
{
  "id": "uuid",
  "email": "john@university.edu",
  "fullName": "John Updated",
  // ... other fields
}

Error Responses:
401 Unauthorized
404 Not Found
422 Unprocessable Entity - Invalid data
```

### 8. Change Password
```
POST /api/v1/users/:userId/change-password

Headers:
Authorization: Bearer <access_token>

Request Body:
{
  "currentPassword": "OldPass123!",
  "newPassword": "NewPass123!"
}

Response (200 OK):
{ "message": "Password changed successfully" }

Error Responses:
401 Unauthorized - Wrong current password
422 Unprocessable Entity - New password doesn't meet requirements
```

### 9. List Users (Admin Only)
```
GET /api/v1/users?role=STUDENT&status=ACTIVE&page=1&limit=20

Headers:
Authorization: Bearer <access_token>

Query Parameters:
role: STUDENT | INSTRUCTOR | SYSTEM_ADMIN (optional)
status: ACTIVE | PENDING_VERIFICATION | SUSPENDED | DEACTIVATED (optional)
page: number (default: 1)
limit: number (default: 20)

Response (200 OK):
{
  "data": [
    { "id": "uuid", "email": "...", "fullName": "...", ... },
    // more users
  ],
  "total": 150,
  "page": 1,
  "limit": 20
}

Error Responses:
401 Unauthorized
403 Forbidden - Only admins can access
```

---

## 📚 ACADEMIC ENDPOINTS

### Semester Endpoints

#### 10. Create Semester (Admin/Instructor)
```
POST /api/v1/academic/semesters

Headers:
Authorization: Bearer <access_token>

Request Body:
{
  "semester_number": 1,
  "title": "Semester 1: Fall 2026",
  "description": "First semester of medical program"
}

Response (201 Created):
{
  "id": "uuid",
  "semester_number": 1,
  "title": "Semester 1: Fall 2026",
  "description": "First semester...",
  "created_at": "2026-07-29T14:30:00Z",
  "updated_at": "2026-07-29T14:30:00Z"
}
```

#### 11. List Semesters
```
GET /api/v1/academic/semesters

Response (200 OK):
[
  { "id": "uuid", "semester_number": 1, "title": "...", ... },
  { "id": "uuid", "semester_number": 2, "title": "...", ... }
]
```

#### 12. Get Semester Details
```
GET /api/v1/academic/semesters/:semesterId

Response (200 OK):
{
  "id": "uuid",
  "semester_number": 1,
  "title": "Semester 1",
  "description": "...",
  "courses": [
    { "id": "uuid", "course_name": "Anatomy 101", ... },
    // more courses
  ],
  "created_at": "...",
  "updated_at": "..."
}
```

#### 13. Update Semester
```
PUT /api/v1/academic/semesters/:semesterId

Request Body:
{
  "title": "Updated Title",
  "description": "Updated description"
}

Response (200 OK):
{ "id": "...", "title": "Updated Title", ... }
```

#### 14. Delete Semester
```
DELETE /api/v1/academic/semesters/:semesterId

Response (204 No Content):
{}

Note: Only if no courses exist in semester
```

### Course Endpoints

#### 15. Create Course
```
POST /api/v1/academic/semesters/:semesterId/courses

Request Body:
{
  "course_code": "ANAT101",
  "course_name": "Anatomy I",
  "slug": "anatomy-i",
  "description": "Introduction to human anatomy",
  "credit_hours": 4
}

Response (201 Created):
{
  "id": "uuid",
  "semester_id": "uuid",
  "course_code": "ANAT101",
  "course_name": "Anatomy I",
  "slug": "anatomy-i",
  "description": "...",
  "credit_hours": 4,
  "is_active": true,
  "display_order": 1,
  "created_at": "...",
  "updated_at": "..."
}
```

#### 16. List Courses
```
GET /api/v1/academic/courses?semester_id=uuid&is_active=true

Response (200 OK):
[
  { "id": "uuid", "course_name": "Anatomy I", ... },
  { "id": "uuid", "course_name": "Physiology II", ... }
]
```

#### 17. Get Course Details
```
GET /api/v1/academic/courses/:courseId

Response (200 OK):
{
  "id": "uuid",
  "course_code": "ANAT101",
  "course_name": "Anatomy I",
  "description": "...",
  "semester": { "id": "...", "semester_number": 1, ... },
  "weeks": [
    { "id": "uuid", "week_number": 1, "title": "Week 1", ... },
    // more weeks
  ],
  "instructor": { "id": "uuid", "fullName": "Dr. Smith", ... },
  "student_count": 45,
  "created_at": "...",
  "updated_at": "..."
}
```

#### 18. Update Course
```
PUT /api/v1/academic/courses/:courseId

Request Body:
{
  "course_name": "Updated Name",
  "description": "...",
  "credit_hours": 5,
  "is_active": true
}

Response (200 OK):
{ "id": "...", "course_name": "Updated Name", ... }
```

#### 19. Delete Course
```
DELETE /api/v1/academic/courses/:courseId

Response (204 No Content):
{}
```

### Week Endpoints

#### 20. Create Week
```
POST /api/v1/academic/courses/:courseId/weeks

Request Body:
{
  "week_number": 1,
  "title": "Introduction & Basics",
  "description": "Overview of course and foundational concepts"
}

Response (201 Created):
{
  "id": "uuid",
  "course_id": "uuid",
  "week_number": 1,
  "title": "Introduction & Basics",
  "description": "...",
  "display_order": 1,
  "lectures": [],
  "created_at": "...",
  "updated_at": "..."
}
```

#### 21. List Weeks
```
GET /api/v1/academic/courses/:courseId/weeks

Response (200 OK):
[
  { "id": "uuid", "week_number": 1, "title": "...", "lectures": [...] },
  { "id": "uuid", "week_number": 2, "title": "...", "lectures": [...] }
]
```

#### 22. Get Week Details
```
GET /api/v1/academic/weeks/:weekId

Response (200 OK):
{
  "id": "uuid",
  "week_number": 1,
  "title": "Introduction & Basics",
  "course": { "id": "uuid", "course_name": "Anatomy I", ... },
  "lectures": [
    {
      "id": "uuid",
      "lecture_number": 1,
      "title": "Lecture 1",
      "topics": [...],
      "resources": [...]
    },
    // more lectures
  ],
  "created_at": "...",
  "updated_at": "..."
}
```

#### 23. Update Week
```
PUT /api/v1/academic/weeks/:weekId

Request Body:
{
  "title": "Updated Title",
  "description": "Updated description"
}

Response (200 OK):
{ "id": "...", "title": "Updated Title", ... }
```

#### 24. Delete Week
```
DELETE /api/v1/academic/weeks/:weekId

Response (204 No Content):
{}
```

### Lecture Endpoints

#### 25. Create Lecture
```
POST /api/v1/academic/weeks/:weekId/lectures

Request Body:
{
  "lecture_number": 1,
  "title": "Introduction to Human Body",
  "description": "Overview of human anatomy",
  "estimated_duration_minutes": 45
}

Response (201 Created):
{
  "id": "uuid",
  "week_id": "uuid",
  "lecture_number": 1,
  "title": "Introduction to Human Body",
  "description": "...",
  "estimated_duration_minutes": 45,
  "is_published": false,
  "display_order": 1,
  "topics": [],
  "resources": [],
  "created_at": "...",
  "updated_at": "..."
}
```

#### 26. List Lectures
```
GET /api/v1/academic/weeks/:weekId/lectures

Response (200 OK):
[
  {
    "id": "uuid",
    "lecture_number": 1,
    "title": "Lecture 1",
    "is_published": true,
    "topics": [...],
    "resources": [...]
  },
  // more lectures
]
```

#### 27. Get Lecture Details
```
GET /api/v1/academic/lectures/:lectureId

Response (200 OK):
{
  "id": "uuid",
  "lecture_number": 1,
  "title": "Introduction to Human Body",
  "description": "...",
  "estimated_duration_minutes": 45,
  "is_published": true,
  "week": { "id": "uuid", "week_number": 1, ... },
  "course": { "id": "uuid", "course_name": "Anatomy I", ... },
  "topics": [
    { "id": "uuid", "topic_name": "Skeletal System", "description": "..." },
    { "id": "uuid", "topic_name": "Muscular System", "description": "..." }
  ],
  "resources": [
    { "id": "uuid", "resource_name": "Lecture Slides", "file_url": "...", ... }
  ],
  "created_at": "...",
  "updated_at": "..."
}
```

#### 28. Update Lecture
```
PUT /api/v1/academic/lectures/:lectureId

Request Body:
{
  "title": "Updated Title",
  "description": "Updated description",
  "estimated_duration_minutes": 50,
  "is_published": true  // Publish lecture
}

Response (200 OK):
{ "id": "...", "title": "Updated Title", "is_published": true, ... }
```

#### 29. Delete Lecture
```
DELETE /api/v1/academic/lectures/:lectureId

Response (204 No Content):
{}
```

### Topic Endpoints

#### 30. Create Topic
```
POST /api/v1/academic/lectures/:lectureId/topics

Request Body:
{
  "topic_name": "Skeletal System",
  "description": "Study of bones and skeleton"
}

Response (201 Created):
{
  "id": "uuid",
  "lecture_id": "uuid",
  "topic_name": "Skeletal System",
  "description": "...",
  "display_order": 1,
  "questions": [],
  "flashcards": [],
  "created_at": "...",
  "updated_at": "..."
}
```

#### 31. List Topics
```
GET /api/v1/academic/lectures/:lectureId/topics

Response (200 OK):
[
  { "id": "uuid", "topic_name": "Skeletal System", "questions": [...], ... },
  { "id": "uuid", "topic_name": "Muscular System", "questions": [...], ... }
]
```

#### 32. Get Topic Details
```
GET /api/v1/academic/topics/:topicId

Response (200 OK):
{
  "id": "uuid",
  "topic_name": "Skeletal System",
  "description": "...",
  "lecture": { "id": "uuid", "lecture_number": 1, ... },
  "questions": [
    { "id": "uuid", "question_text": "...", "difficulty": "EASY", ... },
    // more questions
  ],
  "questions_count": 15,
  "student_mastery_avg": 72,  // For instructor view
  "created_at": "...",
  "updated_at": "..."
}
```

#### 33. Update Topic
```
PUT /api/v1/academic/topics/:topicId

Request Body:
{
  "topic_name": "Updated Name",
  "description": "Updated description"
}

Response (200 OK):
{ "id": "...", "topic_name": "Updated Name", ... }
```

#### 34. Delete Topic
```
DELETE /api/v1/academic/topics/:topicId

Response (204 No Content):
{}
```

### Resource Endpoints

#### 35. Upload Resource
```
POST /api/v1/academic/lectures/:lectureId/resources

Headers:
Authorization: Bearer <access_token>
Content-Type: multipart/form-data

Request Body (form-data):
file: <binary file>
resource_name: "Lecture Slides"
resource_type: PDF  // PDF, VIDEO, IMAGE, LINK
description: "Slides for this lecture" (optional)
file_url: "https://..." (if resource_type is LINK)

Response (201 Created):
{
  "id": "uuid",
  "lecture_id": "uuid",
  "resource_name": "Lecture Slides",
  "resource_type": "PDF",
  "upload_status": "COMPLETED",
  "file_url": "https://cdn.example.com/files/uuid.pdf",
  "file_size": 2048576,
  "description": "...",
  "created_at": "...",
  "updated_at": "..."
}
```

#### 36. List Resources
```
GET /api/v1/academic/lectures/:lectureId/resources

Response (200 OK):
[
  { "id": "uuid", "resource_name": "Slides", "resource_type": "PDF", ... },
  { "id": "uuid", "resource_name": "Video", "resource_type": "VIDEO", ... }
]
```

#### 37. Delete Resource
```
DELETE /api/v1/academic/resources/:resourceId

Response (204 No Content):
{}
```

---

## ❓ QUESTION BANK ENDPOINTS

#### 38. Create Question
```
POST /api/v1/questions

Request Body:
{
  "topic_id": "uuid",
  "question_type": "MCQ",  // or "ESSAY"
  "title": "Bone Structure",
  "question_text": "Which of the following is the hardest bone in human body?",
  "explanation": "The femur is the strongest and longest bone...",
  "hint": "Think of the leg bone",
  "reference": "Anatomy 101 - Chapter 3, Page 45",
  "difficulty": "EASY",  // EASY, MEDIUM, HARD
  "estimated_time_seconds": 60,
  "marks": 1.0
}

Response (201 Created):
{
  "id": "uuid",
  "topic_id": "uuid",
  "question_type": "MCQ",
  "title": "Bone Structure",
  "question_text": "...",
  "explanation": "...",
  "difficulty": "EASY",
  "marks": 1.0,
  "is_active": true,
  "version": 1,
  "created_by": "uuid",  // Instructor who created it
  "created_at": "...",
  "updated_at": "..."
}
```

#### 39. List Questions
```
GET /api/v1/questions?topic_id=uuid&difficulty=EASY&type=MCQ&page=1&limit=20

Query Parameters:
topic_id: (optional)
difficulty: EASY | MEDIUM | HARD (optional)
type: MCQ | ESSAY (optional)
page: number
limit: number
search: search term (optional)

Response (200 OK):
{
  "data": [
    { "id": "uuid", "question_text": "...", "difficulty": "EASY", ... },
    // more questions
  ],
  "total": 150,
  "page": 1,
  "limit": 20
}
```

#### 40. Get Question Details
```
GET /api/v1/questions/:questionId

Response (200 OK):
{
  "id": "uuid",
  "question_type": "MCQ",
  "title": "Bone Structure",
  "question_text": "...",
  "explanation": "...",
  "difficulty": "EASY",
  "marks": 1.0,
  "topic": { "id": "uuid", "topic_name": "Skeletal System", ... },
  "created_by": { "id": "uuid", "fullName": "Dr. Smith", ... },
  
  // For MCQ questions:
  "options": [
    { "id": "uuid", "option_text": "Femur", "is_correct": true, "display_order": 1 },
    { "id": "uuid", "option_text": "Tibia", "is_correct": false, "display_order": 2 },
    { "id": "uuid", "option_text": "Fibula", "is_correct": false, "display_order": 3 }
  ],
  
  // For Essay questions:
  "essay_config": {
    "minimum_word_count": 100,
    "maximum_word_count": 500,
    "model_answer": "...",
    "grading_rubric": "..."
  },
  
  "tags": ["Anatomy", "Bones", "Difficult"],
  "created_at": "...",
  "updated_at": "..."
}
```

#### 41. Update Question
```
PUT /api/v1/questions/:questionId

Request Body:
{
  "title": "Updated Title",
  "question_text": "Updated question",
  "explanation": "...",
  "difficulty": "MEDIUM"
}

Response (200 OK):
{ "id": "...", "title": "Updated Title", ... }
```

#### 42. Delete Question
```
DELETE /api/v1/questions/:questionId

Response (204 No Content):
{}
```

#### 43. Add MCQ Option
```
POST /api/v1/questions/:questionId/options

Request Body:
{
  "option_text": "Humerus",
  "is_correct": false,
  "display_order": 4
}

Response (201 Created):
{
  "id": "uuid",
  "question_id": "uuid",
  "option_text": "Humerus",
  "is_correct": false,
  "display_order": 4,
  "created_at": "..."
}
```

#### 44. Update MCQ Option
```
PUT /api/v1/options/:optionId

Request Body:
{
  "option_text": "Updated text",
  "is_correct": true
}

Response (200 OK):
{ "id": "...", "option_text": "Updated text", ... }
```

#### 45. Delete MCQ Option
```
DELETE /api/v1/options/:optionId

Response (204 No Content):
{}
```

---

## 📝 TEST/ASSESSMENT ENDPOINTS (Tests continue...)

Due to length, I'll create a separate document for Tests, Flashcards, Progress, and Notifications endpoints.

---

## SUMMARY

This specification includes:
- ✅ All 45 endpoints for Auth, Users, and Academic modules
- ✅ Complete request/response examples
- ✅ Error handling
- ✅ Query parameters
- ✅ Authentication requirements
- ✅ Status codes

**See COMPLETE_API_PART_2.md for:**
- Test/Assessment endpoints
- Flashcard endpoints
- Progress tracking endpoints
- Notification endpoints
- Admin endpoints

