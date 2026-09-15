# My Doctor Professor - Setup & Development Guide

## ✅ Project Status

### Completed Tasks
- ✅ Environment configuration (.env files)
- ✅ Database module with TypeORM
- ✅ User entity models (User, Student, Instructor, SystemAdmin)
- ✅ Authentication module (JWT-based)
- ✅ Login/Signup endpoints
- ✅ Security vulnerabilities fixed
- ✅ CORS and validation pipes configured
- ✅ Backend compiles successfully

---

## 🗂️ Project Structure

```
My-Doctor-Professor/
├── backend/
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   │   ├── strategies/     (JWT Strategy)
│   │   │   │   ├── guards/         (JWT Auth Guard, Roles Guard)
│   │   │   │   ├── decorators/     (Roles, CurrentUser)
│   │   │   │   ├── dtos/           (Login, Signup, Auth Response)
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── auth.controller.ts
│   │   │   │   └── auth.module.ts
│   │   │   ├── users/
│   │   │   │   ├── entities/       (User, Student, Instructor, SystemAdmin)
│   │   │   │   ├── dtos/
│   │   │   │   ├── users.service.ts
│   │   │   │   └── users.module.ts
│   │   │   └── (more modules coming...)
│   │   ├── database/
│   │   │   ├── database.module.ts
│   │   │   └── data-source.ts
│   │   ├── app.module.ts
│   │   └── main.ts
│   ├── database/
│   │   ├── schemas/
│   │   │   ├── 00_extensions.sql
│   │   │   ├── 01_enums.sql
│   │   │   ├── 02_users.sql
│   │   │   ├── 03_academic_structure.sql
│   │   │   ├── 04_question_bank.sql
│   │   │   ├── 05_tests.sql
│   │   │   ├── 06_flashcards.sql
│   │   │   ├── 07_student_progress.sql
│   │   │   ├── 08_notifications.sql
│   │   │   ├── 09_audit.sql
│   │   │   ├── 10_indexes.sql
│   │   │   └── 11_permissions.sql
│   │   └── seeds/
│   ├── scripts/
│   │   ├── setup-db.sh     (Linux/Mac)
│   │   └── setup-db.bat    (Windows)
│   └── package.json
├── frontend/
│   ├── src/
│   │   └── app/
│   └── package.json
└── docs/
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 13+
- npm or yarn

### 1. Environment Setup

#### Backend
```bash
cd backend
# The .env file is already created with default values
# Modify if needed based on your PostgreSQL credentials
```

**Backend .env example:**
```
PORT=3000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=my_doctor_professor
JWT_SECRET=super-secret-jwt-key-for-local-development-12345678910!
FRONTEND_URL=http://localhost:3001
```

#### Frontend
```bash
cd frontend
# The .env.local file is already created
```

### 2. Database Setup

#### Windows
```bash
cd backend
.\scripts\setup-db.bat
```

#### Linux/Mac
```bash
cd backend
chmod +x scripts/setup-db.sh
./scripts/setup-db.sh
```

**Or manually:**
```bash
# Create database
psql -U postgres -c "CREATE DATABASE my_doctor_professor;"

# Run migrations
psql -U postgres -d my_doctor_professor -f database/schemas/00_extensions.sql
psql -U postgres -d my_doctor_professor -f database/schemas/01_enums.sql
psql -U postgres -d my_doctor_professor -f database/schemas/02_users.sql
# ... and so on for all schema files
```

### 3. Start Development Servers

**Terminal 1: Backend**
```bash
cd backend
npm run start:dev
# API will run on http://localhost:3000
```

**Terminal 2: Frontend**
```bash
cd frontend
npm run dev
# Frontend will run on http://localhost:3001
```

---

## 📚 API Endpoints

### Authentication Endpoints

#### POST `/auth/signup`
Register a new user

**Request:**
```json
{
  "full_name": "John Doe",
  "email": "john@example.com",
  "password": "SecurePass123!",
  "phone_number": "+1234567890",
  "role": "STUDENT",
  "student_number": "STU001",
  "current_semester": 1
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "john@example.com",
    "full_name": "John Doe",
    "role": "STUDENT",
    "status": "PENDING_VERIFICATION"
  }
}
```

#### POST `/auth/login`
User login

**Request:**
```json
{
  "email": "john@example.com",
  "password": "SecurePass123!"
}
```

**Response:** Same as signup response

#### POST `/auth/refresh`
Refresh access token

**Request:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

#### GET `/auth/me`
Get current user profile (Requires JWT token)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "id": "uuid",
  "email": "john@example.com",
  "fullName": "John Doe",
  "phoneNumber": "+1234567890",
  "role": "STUDENT",
  "status": "ACTIVE",
  "emailVerified": false,
  "createdAt": "2026-07-29T...",
  "updatedAt": "2026-07-29T..."
}
```

#### POST `/auth/logout`
Logout user (Requires JWT token)

---

## 🔐 Authentication & Security

### Features Implemented
- ✅ JWT-based authentication
- ✅ Password hashing with bcrypt
- ✅ Account lockout after 5 failed login attempts (15 min cooldown)
- ✅ Role-based access control (Student, Instructor, SystemAdmin)
- ✅ CORS configuration
- ✅ Input validation with class-validator
- ✅ Global validation pipe

### Using Protected Endpoints

Add the JWT token to your request header:
```
Authorization: Bearer <your_access_token>
```

### Role-Based Access

Use the `@Roles()` decorator on endpoints:
```typescript
@Get('admin-only')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SYSTEM_ADMIN')
async getAdminData() {
  // Only SYSTEM_ADMIN can access
}
```

---

## 📋 Database Schema Overview

### Core Tables
- **users** - User accounts with roles and status
- **students** - Student-specific data
- **instructors** - Instructor-specific data
- **system_admins** - Admin-specific data

### Academic Hierarchy
- **semesters** → **courses** → **weeks** → **lectures** → **topics**
- **resources** - Associated with lectures

### Assessment System
- **questions** - MCQ and essay questions
- **tests** - Test configurations
- **test_attempts** - Student test sessions
- **student_answers** - Answer tracking
- **question_flags** & **question_notes** - Student annotations

### Learning Support
- **flashcard_decks** - Flashcard collections
- **flashcards** - Individual flashcards
- **student_flashcard_progress** - Spaced repetition tracking

### Analytics
- **student_course_progress**
- **student_lecture_progress**
- **student_topic_progress**
- **student_question_progress**

---

## 🔧 Development Commands

### Backend
```bash
npm run build           # Compile TypeScript
npm run start           # Start production
npm run start:dev       # Start with watch mode
npm run start:debug     # Start with debugger
npm run lint            # Run ESLint
npm run format          # Format code with Prettier
npm run test            # Run unit tests
npm run test:e2e        # Run end-to-end tests
```

### Frontend
```bash
npm run dev             # Start development server
npm run build           # Build for production
npm run start           # Start production server
npm run lint            # Run ESLint
```

---

## 📦 Dependencies

### Backend Key Packages
- **NestJS 11** - Framework
- **TypeORM 0.3** - ORM
- **PostgreSQL (pg)** - Database driver
- **JWT** - Authentication
- **bcrypt** - Password hashing
- **class-validator** - Input validation
- **Passport** - Authentication middleware

### Frontend Key Packages
- **Next.js 16** - React framework
- **React 19** - UI library
- **TypeScript 5** - Type safety
- **Tailwind CSS 4** - Styling

---

## 🐛 Troubleshooting

### Database Connection Issues
```bash
# Check if PostgreSQL is running
psql -U postgres -c "SELECT version();"

# If database doesn't exist, create it manually
createdb my_doctor_professor -U postgres
```

### Port Already in Use
```bash
# Change port in .env
PORT=3001  # or another available port
```

### JWT Token Errors
- Ensure `JWT_SECRET` is set in `.env`
- Token might be expired (validity: 24 hours)
- Use refresh token to get a new access token

### CORS Issues
- Check `FRONTEND_URL` in backend `.env`
- Ensure frontend URL matches exactly (including port)

---

## 📋 Next Steps

### Phase 2: Additional Modules to Build
1. **Academic Module** - Semesters, Courses, Weeks, Lectures, Topics
2. **Question Bank Module** - Question management and tagging
3. **Assessment Module** - Tests and student attempts
4. **Flashcards Module** - Flashcard management and progress
5. **Student Progress Module** - Progress tracking and analytics
6. **Notifications Module** - Real-time notifications
7. **Audit Module** - Activity logging

### Phase 3: Frontend Development
1. Authentication UI (Login/Signup)
2. Dashboard (per role)
3. Course management interface
4. Question bank interface
5. Test taking interface
6. Flashcard review interface
7. Progress analytics dashboard

---

## 📝 Testing the API

### Using cURL
```bash
# Signup
curl -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "Jane Doe",
    "email": "jane@example.com",
    "password": "SecurePass123!",
    "phone_number": "+1234567891",
    "role": "STUDENT",
    "student_number": "STU002",
    "current_semester": 1
  }'

# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "jane@example.com",
    "password": "SecurePass123!"
  }'

# Get profile (replace TOKEN with actual access_token)
curl -X GET http://localhost:3000/auth/me \
  -H "Authorization: Bearer TOKEN"
```

### Using Postman
1. Import the API endpoints
2. Create environment variables for `BASE_URL` and `TOKEN`
3. Use the token from login response in subsequent requests

---

## 🔒 Security Checklist

- ✅ Passwords hashed with bcrypt
- ✅ JWT for authentication
- ✅ Account lockout protection
- ✅ CORS configured
- ✅ Input validation enabled
- ⚠️ TODO: Rate limiting
- ⚠️ TODO: HTTPS in production
- ⚠️ TODO: Environment secrets management
- ⚠️ TODO: Token blacklist/revocation
- ⚠️ TODO: 2FA support

---

## 📞 Support & Documentation

For detailed API documentation, refer to the API.md file in the docs folder.

Happy coding! 🚀

