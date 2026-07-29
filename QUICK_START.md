# Quick Start Commands

## 🎯 Get Running in 5 Minutes

### Step 1: Start PostgreSQL (1 minute)

**Windows:**
- Open Services app (`services.msc`)
- Find "PostgreSQL"
- Click "Start"

**Mac:**
```bash
brew services start postgresql@15
```

**Linux:**
```bash
sudo systemctl start postgresql
```

**Or use Docker:**
```bash
docker run --name postgres_mdp -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:15
```

---

### Step 2: Create Database & Run Migrations (2 minutes)

**Windows:**
```cmd
cd D:\WebstormProjects\My-Doctor-Professor\backend
.\scripts\setup-db.bat
```

**Linux/Mac:**
```bash
cd ~/path/to/My-Doctor-Professor/backend
./scripts/setup-db.sh
```

**Manual (All platforms):**
```bash
# Create database
psql -U postgres -c "CREATE DATABASE my_doctor_professor;"

# Run all schemas in order
cd backend/database/schemas
for schema in *.sql; do
  psql -U postgres -d my_doctor_professor -f "$schema"
done
```

---

### Step 3: Start Backend (1 minute)

**Terminal 1:**
```bash
cd backend
npm run start:dev
```

You should see:
```
[Nest] 12345  - 07/29/2026, 2:30:00 PM     LOG [NestFactory] Starting Nest application...
[Nest] 12345  - 07/29/2026, 2:30:01 PM     LOG [InstanceLoader] AppModule dependencies initialized
Application is running on: http://localhost:3000
```

---

### Step 4: Test Authentication (1 minute)

**Terminal 2 - Test Signup:**
```bash
curl -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "Test User",
    "email": "test@example.com",
    "password": "TestPass123!",
    "phone_number": "+1234567890",
    "role": "STUDENT",
    "student_number": "STU001",
    "current_semester": 1
  }'
```

**Expected Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "12345678-1234-1234-1234-123456789012",
    "email": "test@example.com",
    "full_name": "Test User",
    "role": "STUDENT",
    "status": "PENDING_VERIFICATION"
  }
}
```

---

### Step 5: Test Login

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123!"
  }'
```

Save the `access_token` from response.

---

### Step 6: Test Protected Endpoint

```bash
# Replace TOKEN with the access_token from previous step
curl -X GET http://localhost:3000/auth/me \
  -H "Authorization: Bearer TOKEN"
```

**Expected Response:**
```json
{
  "id": "12345678-1234-1234-1234-123456789012",
  "email": "test@example.com",
  "fullName": "Test User",
  "phoneNumber": "+1234567890",
  "role": "STUDENT",
  "status": "PENDING_VERIFICATION",
  "profilePictureUrl": null,
  "dateOfBirth": null,
  "gender": null,
  "emailVerified": false,
  "createdAt": "2026-07-29T14:30:00.000Z",
  "updatedAt": "2026-07-29T14:30:00.000Z"
}
```

---

## 📱 Start Frontend (Optional)

**Terminal 3:**
```bash
cd frontend
npm run dev
```

Access at: http://localhost:3001

---

## 🧪 Testing with Postman

### Import Collection

1. Create new request
2. Method: POST
3. URL: `http://localhost:3000/auth/signup`
4. Body (JSON):
```json
{
  "full_name": "Jane Doe",
  "email": "jane@example.com",
  "password": "JanePass123!",
  "phone_number": "+1234567891",
  "role": "INSTRUCTOR",
  "specialization": "Cardiology",
  "office_location": "Room 305"
}
```

---

## 🔄 Environment & Configuration

### Default Credentials (Development Only)
```
Database: my_doctor_professor
User: postgres
Password: postgres
Host: localhost
Port: 5432
```

### JWT Configuration
```
Secret: super-secret-jwt-key-for-local-development-12345678910!
Access Token: 24 hours
Refresh Token: 7 days
```

### API Configuration
```
Backend: http://localhost:3000
Frontend: http://localhost:3001
```

---

## 🐛 Troubleshooting

### Can't Connect to Database

**Error:** `Error: connect ECONNREFUSED 127.0.0.1:5432`

**Solution:**
```bash
# Check if PostgreSQL is running
psql -U postgres -c "SELECT 1;"

# If not, start it:
# Windows: services.msc -> PostgreSQL -> Start
# Mac: brew services start postgresql@15
# Linux: sudo systemctl start postgresql
```

---

### Database Already Exists

**Error:** `ERROR: database "my_doctor_professor" already exists`

**Solution:**
```bash
# Drop existing database
psql -U postgres -c "DROP DATABASE IF EXISTS my_doctor_professor;"

# Then run setup script again
.\scripts\setup-db.bat
```

---

### Port 3000 Already in Use

**Error:** `Error: listen EADDRINUSE: address already in use :::3000`

**Solution:**

**Windows:**
```bash
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

**Mac/Linux:**
```bash
lsof -i :3000
kill -9 <PID>
```

Or change port in `.env`:
```
PORT=3001
```

---

### JWT Token Invalid

**Error:** `Unauthorized - Invalid token`

**Solution:**
```bash
# Make sure token is included with Bearer prefix
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...

# Token is valid for 24 hours only
# Get new token using refresh endpoint:
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "your_refresh_token"}'
```

---

### Account Locked

**Error:** `Unauthorized - Account is temporarily locked...`

**Solution:**
```bash
# Account locks after 5 failed login attempts
# Locked for 15 minutes automatically
# Wait 15 minutes or:

# Access database directly
psql -U postgres -d my_doctor_professor

# Update user (replace user_id)
UPDATE users 
SET locked_until = NULL, failed_login_attempts = 0 
WHERE id = 'user_uuid';
```

---

## 📊 Database Schema Verification

**Verify database was created:**
```bash
psql -U postgres -d my_doctor_professor -c "\dt"
```

**Expected output: 20+ tables**
```
users
students
instructors
instructor_availability
system_admins
semesters
courses
weeks
lectures
topics
resources
questions
mcq_options
essay_configurations
tags
question_tags
tests
test_questions
test_attempts
student_answers
question_flags
question_notes
flashcard_decks
flashcards
student_flashcard_progress
student_course_progress
student_lecture_progress
student_topic_progress
student_question_progress
notifications
user_notifications
audit_logs
```

---

## 🔐 Test Different User Roles

### Student
```json
{
  "full_name": "Alice Student",
  "email": "alice@university.edu",
  "password": "AlicePass123!",
  "phone_number": "+1234567892",
  "role": "STUDENT",
  "student_number": "STU002",
  "current_semester": 2
}
```

### Instructor
```json
{
  "full_name": "Dr. Bob Teacher",
  "email": "bob@university.edu",
  "password": "BobPass123!",
  "phone_number": "+1234567893",
  "role": "INSTRUCTOR",
  "specialization": "Neurology",
  "office_location": "Room 401"
}
```

### System Admin
```json
{
  "full_name": "Charlie Admin",
  "email": "charlie@university.edu",
  "password": "CharliePass123!",
  "phone_number": "+1234567894",
  "role": "SYSTEM_ADMIN"
}
```

---

## ✅ Verification Checklist

- [ ] PostgreSQL running
- [ ] Database `my_doctor_professor` created
- [ ] All schema files applied (11 files)
- [ ] Backend running on port 3000
- [ ] POST `/auth/signup` working
- [ ] POST `/auth/login` working
- [ ] GET `/auth/me` working (with token)
- [ ] Account lockout working (test 5 failed logins)
- [ ] Token refresh working
- [ ] CORS allowing requests from frontend

---

## 🚀 You're Ready!

Everything is set up and ready to test. Run the commands above and start building!

Next steps:
1. Test all endpoints
2. Create sample users with different roles
3. Explore database structure
4. Plan Phase 2: Academic Module
5. Start building additional endpoints

**Happy coding!** 🎉

