# IMPLEMENTATION ROADMAP: STEP-BY-STEP APPROACH

**Project:** My Doctor Professor  
**Approach:** Foundation-First (Entities → Modules → Controllers → DTOs → Services → Logic → Testing)  
**Methodology:** Iterative & Modular

---

## 🎯 IMPLEMENTATION PHILOSOPHY

### Why Foundation First?
```
Traditional (Bottom-Up): Entities → Data → Services → Controllers → Tests
Better (Top-Down): API Spec → Entities → DTOs → Services → Controllers → Tests

Our Approach (Foundation-First):
1. UNDERSTAND: Product specs, user stories, API endpoints
2. DESIGN: All entities (database structure)
3. SCAFFOLD: All modules, controllers with empty endpoints
4. DEFINE: All DTOs (request/response contracts)
5. IMPLEMENT: Service logic iteratively
6. TEST: Unit tests, integration tests, E2E tests
```

### Why This Order?
- ✅ See entire structure before coding complex logic
- ✅ All endpoints defined = clear scope
- ✅ DTOs = contract between frontend and backend
- ✅ Services = isolated business logic (testable)
- ✅ Controllers = thin, just orchestration
- ✅ Tests = written incrementally

---

## PHASE 1: FOUNDATION SETUP (Week 1 - Part 1)

### Step 1: Create All Entity Classes
**Objective:** Define database schema in TypeORM entities

**Time:** 4-6 hours  
**Files:** 30+ entity files

**Process:**
1. Create `src/common/entities/` directory
2. For each entity, create file:
   - `user.entity.ts`
   - `student.entity.ts`
   - `instructor.entity.ts`
   - ... (30+ total)

**What to Include in Each Entity:**
```typescript
@Entity('table_name')
export class EntityName {
  // 1. Primary Key
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 2. Regular Columns
  @Column({ type: 'varchar', length: 100 })
  fieldName: string;

  // 3. Enums
  @Column({ type: 'enum', enum: MyEnum })
  status: MyEnum;

  // 4. Nullable Fields
  @Column({ type: 'text', nullable: true })
  optionalField: string | null;

  // 5. Relationships
  @ManyToOne(() => ParentEntity, parent => parent.children)
  @JoinColumn({ name: 'parent_id' })
  parent: ParentEntity;

  @OneToMany(() => ChildEntity, child => child.parent)
  children: ChildEntity[];

  // 6. Timestamps
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

**Checklist:**
```
□ User entity (base)
□ Student entity
□ Instructor entity
□ SystemAdmin entity
□ InstructorAvailability entity
□ Semester entity
□ Course entity
□ Week entity
□ Lecture entity
□ Topic entity
□ Resource entity
□ Question entity
□ MCQOption entity
□ EssayConfiguration entity
□ Tag entity
□ QuestionTag entity
□ Test entity
□ TestQuestion entity
□ TestAttempt entity
□ StudentAnswer entity
□ QuestionFlag entity
□ QuestionNote entity
□ FlashcardDeck entity
□ Flashcard entity
□ StudentFlashcardProgress entity
□ StudentCourseProgress entity
□ StudentLectureProgress entity
□ StudentTopicProgress entity
□ StudentQuestionProgress entity
□ Notification entity
□ UserNotification entity
□ AuditLog entity (31 total)
```

**Success Criteria:**
- [ ] All entities created
- [ ] All relationships defined
- [ ] `npm run build` = 0 errors
- [ ] All enums defined
- [ ] TypeScript strict mode

---

### Step 2: Create All Module Files
**Objective:** Set up module structure

**Time:** 2-3 hours  
**Files:** 11 module files

**Process:**
1. Create `src/modules/` directories:
   ```
   src/modules/
   ├── auth/
   ├── users/
   ├── academic/
   ├── questions/
   ├── tests/
   ├── flashcards/
   ├── progress/
   ├── notifications/
   ├── audit/
   └── admin/
   ```

2. For each module, create `{module}.module.ts`:

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Entity1,
      Entity2,
      // All entities for this module
    ]),
  ],
  controllers: [SomeController],  // Will add later
  providers: [SomeService],        // Will add later
  exports: [SomeService],          // What other modules can import
})
export class ModuleNameModule {}
```

**Checklist:**
```
□ auth.module.ts
□ users.module.ts
□ academic.module.ts
□ questions.module.ts
□ tests.module.ts
□ flashcards.module.ts
□ progress.module.ts
□ notifications.module.ts
□ audit.module.ts
□ admin.module.ts
```

**Success Criteria:**
- [ ] All modules created
- [ ] All entities imported in correct modules
- [ ] `npm run build` = 0 errors
- [ ] Can see module hierarchy

---

### Step 3: Scaffold All Controllers with Empty Endpoints
**Objective:** Define all API endpoints (empty implementations)

**Time:** 6-8 hours  
**Files:** 11 controller files

**Process:**
1. For each module, create `{resource}.controller.ts`
2. Copy ALL endpoints from API specification
3. Leave implementations empty (just return placeholder)

**Example Controller Structure:**

```typescript
@Controller('academic/semesters')
export class SemestersController {
  constructor(private readonly service: SemestersService) {}

  // Endpoint 1: Create
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('INSTRUCTOR', 'SYSTEM_ADMIN')
  async create(@Body() createDto: CreateSemesterDto): Promise<SemesterResponseDto> {
    // TODO: Implement
    throw new NotImplementedException();
  }

  // Endpoint 2: List
  @Get()
  async list(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ): Promise<PaginatedResponse<SemesterResponseDto>> {
    // TODO: Implement
    throw new NotImplementedException();
  }

  // Endpoint 3: Get Detail
  @Get(':id')
  async getOne(@Param('id') id: string): Promise<SemesterResponseDto> {
    // TODO: Implement
    throw new NotImplementedException();
  }

  // Endpoint 4: Update
  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('INSTRUCTOR', 'SYSTEM_ADMIN')
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateSemesterDto,
  ): Promise<SemesterResponseDto> {
    // TODO: Implement
    throw new NotImplementedException();
  }

  // Endpoint 5: Delete
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SYSTEM_ADMIN')
  async delete(@Param('id') id: string): Promise<void> {
    // TODO: Implement
    throw new NotImplementedException();
  }
}
```

**Endpoints Checklist (from API spec):**
```
Auth Module:
□ POST /auth/signup
□ POST /auth/login
□ POST /auth/refresh
□ GET /auth/me
□ POST /auth/logout

Users Module:
□ GET /users/:id
□ PUT /users/:id
□ POST /users/:id/change-password
□ GET /users (admin)

Academic Module:
□ POST /semesters
□ GET /semesters
□ GET /semesters/:id
□ PUT /semesters/:id
□ DELETE /semesters/:id
□ POST /courses
□ GET /courses
□ GET /courses/:id
... (37+ more endpoints)

Questions Module:
□ POST /questions
□ GET /questions
□ GET /questions/:id
□ PUT /questions/:id
□ DELETE /questions/:id
□ POST /questions/:id/options
... (more)

Tests Module:
□ POST /tests
□ GET /tests
□ GET /tests/:id
... (more)

(Continue for all modules)
```

**Success Criteria:**
- [ ] All endpoints from API spec created
- [ ] All endpoints have @Controller/@Get/@Post/@Put/@Delete
- [ ] All endpoints have auth guards (@UseGuards)
- [ ] All endpoints have role checks (@Roles)
- [ ] Controllers have dependency injection (services in constructor)
- [ ] `npm run build` = 0 errors

---

### Step 4: Create All DTOs
**Objective:** Define request/response contracts

**Time:** 4-6 hours  
**Files:** 40+ DTO files

**Process:**
1. For each resource, create DTOs folder: `src/modules/{module}/dtos/`
2. Create 3 DTOs per resource:
   - `create-{resource}.dto.ts` - POST request
   - `update-{resource}.dto.ts` - PUT request
   - `{resource}-response.dto.ts` - Response

**Example DTO Structure:**

```typescript
// create-semester.dto.ts - Input validation
import { IsNumber, IsString, IsOptional } from 'class-validator';

export class CreateSemesterDto {
  @IsNumber()
  semester_number: number;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;
}

// semester-response.dto.ts - Output format
export class SemesterResponseDto {
  id: string;
  semester_number: number;
  title: string;
  description: string;
  created_at: Date;
  updated_at: Date;
  courses?: CourseResponseDto[];  // Optional nested data
}

// update-semester.dto.ts - Can be partial
import { PartialType } from '@nestjs/mapped-types';

export class UpdateSemesterDto extends PartialType(CreateSemesterDto) {}
```

**DTOs to Create (Checklist):**
```
Auth Module:
□ LoginDto
□ SignupDto
□ AuthResponseDto
□ UserProfileDto
□ JwtPayloadDto

Academic Module:
□ CreateSemesterDto, UpdateSemesterDto, SemesterResponseDto
□ CreateCourseDto, UpdateCourseDto, CourseResponseDto
□ CreateWeekDto, UpdateWeekDto, WeekResponseDto
□ CreateLectureDto, UpdateLectureDto, LectureResponseDto
□ CreateTopicDto, UpdateTopicDto, TopicResponseDto
□ CreateResourceDto, ResourceResponseDto
... (40+ DTOs total)
```

**Success Criteria:**
- [ ] All create DTOs with validation
- [ ] All update DTOs (PartialType)
- [ ] All response DTOs
- [ ] All DTOs have class-validator decorators
- [ ] `npm run build` = 0 errors
- [ ] Validation catches invalid input

---

### Step 5: Create All Service Stubs
**Objective:** Service structure with empty methods

**Time:** 3-4 hours  
**Files:** 11 service files

**Process:**
1. For each module, create `{resource}.service.ts`
2. Create service methods stub (no implementation)
3. Add @Injectable() decorator
4. Add constructor with repository injection

**Example Service Structure:**

```typescript
@Injectable()
export class SemestersService {
  constructor(
    @InjectRepository(Semester)
    private readonly repo: Repository<Semester>,
  ) {}

  // Create
  async create(createDto: CreateSemesterDto): Promise<SemesterResponseDto> {
    // TODO: Implement
    throw new NotImplementedException();
  }

  // List
  async list(page: number, limit: number): Promise<PaginatedResponse<SemesterResponseDto>> {
    // TODO: Implement
    throw new NotImplementedException();
  }

  // Get detail
  async findById(id: string): Promise<SemesterResponseDto> {
    // TODO: Implement
    throw new NotImplementedException();
  }

  // Update
  async update(id: string, updateDto: UpdateSemesterDto): Promise<SemesterResponseDto> {
    // TODO: Implement
    throw new NotImplementedException();
  }

  // Delete
  async delete(id: string): Promise<void> {
    // TODO: Implement
    throw new NotImplementedException();
  }
}
```

**Services Checklist:**
```
□ AuthService
□ UsersService
□ SemestersService
□ CoursesService
□ WeeksService
□ LecturesService
□ TopicsService
□ ResourcesService
□ QuestionsService
□ TestsService
□ FlashcardsService
□ ProgressService
□ NotificationService
... (11 services with all methods)
```

**Success Criteria:**
- [ ] All service methods defined
- [ ] All repository injections
- [ ] Methods structured: CRUD operations
- [ ] NotImplementedError for now
- [ ] `npm run build` = 0 errors

---

## PHASE 2: BUSINESS LOGIC IMPLEMENTATION (Week 1-2 - Part 2)

### Step 6: Implement Service Logic - Module by Module
**Objective:** Implement actual business logic

**Time:** 20-30 hours  
**Approach:** Start with Auth, then Academic, then others

**IMPLEMENT IN THIS ORDER:**
1. Auth Service (foundation for all)
2. Users Service (depends on Auth)
3. Academic Services (Semester → Course → Week → Lecture → Topic → Resource)
4. Questions Service
5. Tests Service (depends on Questions & Academic)
6. Other services

**For Each Service, Implement:**

**CRUD Operations:**
```typescript
// CREATE: Insert into database
async create(createDto): Promise<ResponseDto> {
  // 1. Validate input (DTOs handle this)
  // 2. Check business rules
  // 3. Create entity
  const entity = this.repo.create(createDto);
  // 4. Save to database
  return await this.repo.save(entity);
  // 5. Return response DTO
}

// READ: Fetch from database
async findById(id: string): Promise<ResponseDto> {
  // 1. Query database
  const entity = await this.repo.findOne({ where: { id } });
  // 2. Handle not found
  if (!entity) throw new NotFoundException();
  // 3. Return response DTO
  return this.toResponseDto(entity);
}

// LIST: Fetch multiple with pagination
async list(page: number, limit: number): Promise<PaginatedResponse> {
  // 1. Calculate skip: (page - 1) * limit
  // 2. Query with skip/take
  const [items, total] = await this.repo.findAndCount({
    skip: (page - 1) * limit,
    take: limit,
  });
  // 3. Return paginated response
  return {
    data: items.map(item => this.toResponseDto(item)),
    total,
    page,
    limit,
  };
}

// UPDATE: Modify existing
async update(id: string, updateDto): Promise<ResponseDto> {
  // 1. Find entity
  const entity = await this.repo.findOne({ where: { id } });
  if (!entity) throw new NotFoundException();
  // 2. Apply updates
  Object.assign(entity, updateDto);
  // 3. Validate (TypeORM will validate)
  // 4. Save
  return await this.repo.save(entity);
}

// DELETE: Remove from database
async delete(id: string): Promise<void> {
  // 1. Find entity
  const entity = await this.repo.findOne({ where: { id } });
  if (!entity) throw new NotFoundException();
  // 2. Check if can delete (foreign keys, business rules)
  // 3. Delete
  await this.repo.remove(entity);
}
```

**Business Rules to Implement:**
```typescript
// Example 1: Validate Uniqueness
async create(createDto) {
  // Check email is unique
  const exists = await this.repo.findOne({ 
    where: { email: createDto.email } 
  });
  if (exists) throw new ConflictException('Email already exists');
  // ... continue
}

// Example 2: Validate Related Entity
async create(createDto) {
  // Check semester exists before creating course
  const semester = await this.semesterRepo.findOne({ 
    where: { id: createDto.semester_id } 
  });
  if (!semester) throw new NotFoundException('Semester not found');
  // ... continue
}

// Example 3: Cascade Delete
async delete(id: string) {
  // When deleting course, delete related weeks
  const weeks = await this.weekRepo.find({ 
    where: { course_id: id } 
  });
  await this.weekRepo.remove(weeks);
  // Then delete course
  await this.courseRepo.delete(id);
}

// Example 4: Calculate Derived Values
async calculateProgress(studentId: string, courseId: string) {
  // Get all lectures in course
  const lectures = await this.lectureRepo.find({ /* ... */ });
  // Get completed lectures for this student
  const completed = await this.progressRepo.count({ /* ... */ });
  // Calculate percentage
  return (completed / lectures.length) * 100;
}
```

**Success Criteria:**
- [ ] All CRUD operations implemented
- [ ] Business rules enforced
- [ ] Error handling in place
- [ ] Database transactions where needed
- [ ] Response DTOs properly formatted
- [ ] Relationships populated correctly
- [ ] Pagination working
- [ ] `npm run build` = 0 errors

---

### Step 7: Wire Controllers to Services
**Objective:** Controllers call services

**Time:** 4-6 hours

**Process:**
1. Replace NotImplementedError with service calls
2. Handle exceptions
3. Format responses

**Example:**

```typescript
@Controller('academic/semesters')
export class SemestersController {
  constructor(private readonly semestersService: SemestersService) {}

  @Post()
  async create(@Body() createDto: CreateSemesterDto): Promise<SemesterResponseDto> {
    return this.semestersService.create(createDto);
  }

  @Get()
  async list(
    @Query('page', ParseIntPipe) page = 1,
    @Query('limit', ParseIntPipe) limit = 20,
  ): Promise<PaginatedResponse<SemesterResponseDto>> {
    return this.semestersService.list(page, limit);
  }

  // ... other endpoints
}
```

**Success Criteria:**
- [ ] All controllers call services
- [ ] Error responses handled
- [ ] Status codes correct (201 for POST, 200 for GET, etc.)
- [ ] Authentication/authorization working
- [ ] Pagination working
- [ ] Manual testing passes

---

## PHASE 3: TESTING & VALIDATION (Week 2-3)

### Step 8: Unit Tests
**Objective:** Test each service in isolation

**Time:** 10-15 hours  
**Target:** 80%+ coverage

**Example Test Structure:**

```typescript
describe('SemestersService', () => {
  let service: SemestersService;
  let repository: Repository<Semester>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        SemestersService,
        {
          provide: getRepositoryToken(Semester),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SemestersService>(SemestersService);
    repository = module.get<Repository<Semester>>(getRepositoryToken(Semester));
  });

  describe('create', () => {
    it('should create semester', async () => {
      // Arrange
      const createDto: CreateSemesterDto = { semester_number: 1 };
      const expected = { id: 'uuid', ...createDto };
      repository.create.mockReturnValue(expected);
      repository.save.mockResolvedValue(expected);

      // Act
      const result = await service.create(createDto);

      // Assert
      expect(result).toEqual(expected);
      expect(repository.create).toHaveBeenCalledWith(createDto);
      expect(repository.save).toHaveBeenCalled();
    });

    it('should throw error if duplicate semester_number', async () => {
      // Arrange
      const createDto: CreateSemesterDto = { semester_number: 1 };
      repository.findOne.mockResolvedValue({ id: 'uuid' });

      // Act & Assert
      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
    });
  });

  // Test other methods...
});
```

**Testing Checklist:**
```
Per Service (4-5 tests minimum):
□ Create: Happy path
□ Create: Validation error
□ Create: Uniqueness error
□ Create: Related entity not found
□ List: With pagination
□ List: Empty results
□ FindById: Entity found
□ FindById: Entity not found
□ Update: Happy path
□ Update: Validation error
□ Update: Not found
□ Delete: Happy path
□ Delete: Cannot delete (foreign keys)
□ Delete: Not found
```

**Success Criteria:**
- [ ] 80%+ coverage
- [ ] All happy paths tested
- [ ] All error cases tested
- [ ] Mocks used correctly
- [ ] Tests run successfully: `npm run test`

---

### Step 9: Integration Tests
**Objective:** Test modules working together

**Time:** 5-10 hours

**Example:**

```typescript
describe('Auth and Users Integration', () => {
  let authService: AuthService;
  let usersService: UsersService;
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AuthModule, UsersModule, DatabaseModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    authService = moduleFixture.get<AuthService>(AuthService);
    usersService = moduleFixture.get<UsersService>(UsersService);
  });

  it('should signup, then login, then access protected endpoint', async () => {
    // 1. Signup
    const signupResponse = await authService.signup({
      full_name: 'Test User',
      email: 'test@test.com',
      password: 'TestPass123!',
      phone_number: '+1234567890',
      role: UserRole.STUDENT,
    });

    // 2. Verify user created
    const user = await usersService.findByEmail('test@test.com');
    expect(user).toBeDefined();

    // 3. Login
    const loginResponse = await authService.login({
      email: 'test@test.com',
      password: 'TestPass123!',
    });

    expect(loginResponse.access_token).toBeDefined();

    // 4. Get profile with token
    const profile = await usersService.getUserProfile(loginResponse.user.id);
    expect(profile.email).toBe('test@test.com');
  });
});
```

**Integration Tests to Create:**
```
□ Auth → Users flow
□ Academic hierarchy (Semester → Course → Week → Lecture → Topic)
□ Questions → Tests flow
□ Tests → Student Answers → Grading flow
□ Progress tracking updates correctly
□ Notifications created correctly
□ Audit logs recorded correctly
```

**Success Criteria:**
- [ ] Cross-module tests passing
- [ ] Database state correct after operations
- [ ] Relationships maintained
- [ ] Cascading updates working

---

### Step 10: End-to-End (E2E) Tests
**Objective:** Test complete user flows via API

**Time:** 5-10 hours

**Example (Using Supertest):**

```typescript
describe('Student Learning Flow (E2E)', () => {
  let app: INestApplication;
  let token: string;
  let studentId: string;
  let courseId: string;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('should complete full student learning flow', async () => {
    // 1. Register as student
    const signupRes = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        full_name: 'Student Test',
        email: 'student@test.com',
        password: 'StudentPass123!',
        phone_number: '+1234567890',
        role: 'STUDENT',
        student_number: 'STU001',
        current_semester: 1,
      })
      .expect(201);

    token = signupRes.body.access_token;
    studentId = signupRes.body.user.id;

    // 2. Instructor creates course
    const courseRes = await request(app.getHttpServer())
      .post('/api/v1/academic/courses')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({
        semester_id: semesterId,
        course_code: 'ANAT101',
        course_name: 'Anatomy I',
        slug: 'anatomy-i',
      })
      .expect(201);

    courseId = courseRes.body.id;

    // 3. Student views course
    const viewRes = await request(app.getHttpServer())
      .get(`/api/v1/academic/courses/${courseId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(viewRes.body.course_name).toBe('Anatomy I');

    // 4. Continue flow...
  });
});
```

**E2E Test Scenarios:**
```
□ Student signup → login → view course → practice questions → take test
□ Instructor create course → add lectures → create questions → create test → grade essays
□ Admin manage users → view statistics → audit logs
```

**Success Criteria:**
- [ ] All happy paths work
- [ ] Error scenarios handled
- [ ] Data persists correctly
- [ ] All endpoints respond correctly

---

## PHASE 4: VALIDATION & DEPLOYMENT PREP (Week 3+)

### Step 11: Code Review & Quality Checks
```
□ TypeScript strict mode: npm run build
□ Linting: npm run lint
□ Code coverage: npm run test:cov
□ Security review: OWASP checks
□ Performance: Query optimization, N+1 queries
```

### Step 12: Documentation
```
□ API documentation (Swagger)
□ Code comments for complex logic
□ README for each module
□ Setup guide
□ Testing guide
```

---

## COMPLETE CHECKLIST

### Phase 1: Foundation (Week 1)
- [ ] All 31 entities created
- [ ] All 11 modules scaffolded
- [ ] All 45+ controller endpoints defined
- [ ] All 40+ DTOs created
- [ ] All service stubs created
- [ ] Build succeeds

### Phase 2: Logic (Week 1-2)
- [ ] Auth service implemented
- [ ] Users service implemented
- [ ] Academic services implemented
- [ ] Questions service implemented
- [ ] Tests service implemented
- [ ] Controllers wired to services
- [ ] All CRUD working

### Phase 3: Testing (Week 2-3)
- [ ] Unit tests: 80%+ coverage
- [ ] Integration tests passing
- [ ] E2E tests for main flows
- [ ] Manual testing completed
- [ ] All endpoints tested via Postman/cURL

### Phase 4: Polish (Week 3+)
- [ ] Code review passed
- [ ] Linting: 0 errors
- [ ] Tests: 0 failures
- [ ] Documentation complete
- [ ] Security audit passed
- [ ] Performance optimized

---

## SUMMARY

This roadmap provides:
✅ Step-by-step approach  
✅ Exact files to create  
✅ Implementation patterns  
✅ Testing strategy  
✅ Quality checks  

**Total Estimated Time:** 4-6 weeks for full backend  
**Recommended Pace:** 1 phase per week

**Next:** Start Phase 1, Step 1 - Create All Entities

