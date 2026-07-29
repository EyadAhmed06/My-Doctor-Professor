import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Brackets,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { Course } from '../../common/entities/course.entity';
import { Lecture } from '../../common/entities/lecture.entity';
import {
  Resource,
  UploadStatus,
} from '../../common/entities/resource.entity';
import { Semester } from '../../common/entities/semester.entity';
import { Topic } from '../../common/entities/topic.entity';
import { Week } from '../../common/entities/week.entity';
import { UserRole } from '../users/entities/user.entity';
import {
  CourseQueryDto,
  CreateCourseDto,
  CreateLectureDto,
  CreateResourceDto,
  CreateSemesterDto,
  CreateTopicDto,
  CreateWeekDto,
  UpdateCourseDto,
  UpdateLectureDto,
  UpdateSemesterDto,
  UpdateTopicDto,
  UpdateWeekDto,
} from './dtos/academic.dto';

interface Paginated<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

@Injectable()
export class AcademicService {
  constructor(
    @InjectRepository(Semester)
    private readonly semesters: Repository<Semester>,
    @InjectRepository(Course)
    private readonly courses: Repository<Course>,
    @InjectRepository(Week)
    private readonly weeks: Repository<Week>,
    @InjectRepository(Lecture)
    private readonly lectures: Repository<Lecture>,
    @InjectRepository(Topic)
    private readonly topics: Repository<Topic>,
    @InjectRepository(Resource)
    private readonly resources: Repository<Resource>,
    private readonly config: ConfigService,
  ) {}

  async createSemester(dto: CreateSemesterDto): Promise<Semester> {
    return this.saveUnique(
      () => this.semesters.save(this.semesters.create({
        semesterNumber: dto.semester_number,
        title: dto.title?.trim() || null,
        description: dto.description?.trim() || null,
      })),
      'Semester number already exists',
    );
  }

  listSemesters(): Promise<Semester[]> {
    return this.semesters.find({
      order: { semesterNumber: 'ASC' },
    });
  }

  async getSemester(id: string, role: UserRole): Promise<Semester> {
    const semester = await this.semesters.findOne({
      where: { id },
      relations: { courses: true },
      order: { courses: { displayOrder: 'ASC' } },
    });
    if (!semester) throw new NotFoundException('Semester not found');
    if (role === UserRole.STUDENT) {
      semester.courses = semester.courses.filter((course) => course.isActive);
    }
    return semester;
  }

  async updateSemester(id: string, dto: UpdateSemesterDto): Promise<Semester> {
    const semester = await this.requireSemester(id);
    if (dto.title !== undefined) semester.title = dto.title.trim() || null;
    if (dto.description !== undefined) {
      semester.description = dto.description.trim() || null;
    }
    return this.semesters.save(semester);
  }

  async deleteSemester(id: string): Promise<void> {
    const semester = await this.semesters.findOne({
      where: { id },
      relations: { courses: true },
    });
    if (!semester) throw new NotFoundException('Semester not found');
    if (semester.courses.length > 0) {
      throw new ConflictException('Semester cannot be deleted while it contains courses');
    }
    await this.removeProtected(() => this.semesters.remove(semester));
  }

  async createCourse(semesterId: string, dto: CreateCourseDto): Promise<Course> {
    await this.requireSemester(semesterId);
    return this.saveUnique(
      () => this.courses.save(this.courses.create({
        semesterId,
        courseCode: dto.course_code.trim().toUpperCase(),
        courseName: dto.course_name.trim(),
        slug: this.normalizeSlug(dto.slug),
        description: dto.description?.trim() || null,
        creditHours: dto.credit_hours ?? null,
        displayOrder: dto.display_order ?? 1,
        isActive: true,
      })),
      'Course code or slug already exists',
    );
  }

  async listCourses(
    query: CourseQueryDto,
    role: UserRole,
  ): Promise<Paginated<Course>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const builder = this.courses
      .createQueryBuilder('course')
      .leftJoinAndSelect('course.semester', 'semester')
      .orderBy('semester.semesterNumber', 'ASC')
      .addOrderBy('course.displayOrder', 'ASC')
      .addOrderBy('course.courseName', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.semester_id) {
      builder.andWhere('course.semester_id = :semesterId', {
        semesterId: query.semester_id,
      });
    }
    if (role === UserRole.STUDENT) {
      builder.andWhere('course.is_active = TRUE');
    } else if (query.is_active !== undefined) {
      builder.andWhere('course.is_active = :isActive', {
        isActive: query.is_active,
      });
    }
    if (query.search) {
      builder.andWhere(
        new Brackets((where) => {
          where
            .where('course.course_name ILIKE :search')
            .orWhere('course.course_code ILIKE :search');
        }),
        { search: `%${query.search.trim()}%` },
      );
    }

    const [data, total] = await builder.getManyAndCount();
    return {
      data,
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
    };
  }

  async getCourse(id: string, role: UserRole): Promise<Course> {
    const course = await this.courses.findOne({
      where: { id },
      relations: {
        semester: true,
        weeks: { lectures: { topics: true, resources: true } },
      },
      order: {
        weeks: {
          displayOrder: 'ASC',
          lectures: {
            displayOrder: 'ASC',
            topics: { displayOrder: 'ASC' },
          },
        },
      },
    });
    if (!course || (role === UserRole.STUDENT && !course.isActive)) {
      throw new NotFoundException('Course not found');
    }
    if (role === UserRole.STUDENT) {
      for (const week of course.weeks) {
        week.lectures = week.lectures.filter((lecture) => lecture.isPublished);
      }
    }
    return course;
  }

  async updateCourse(id: string, dto: UpdateCourseDto): Promise<Course> {
    const course = await this.requireCourse(id);
    if (dto.course_name !== undefined) course.courseName = dto.course_name.trim();
    if (dto.slug !== undefined) course.slug = this.normalizeSlug(dto.slug);
    if (dto.description !== undefined) {
      course.description = dto.description.trim() || null;
    }
    if (dto.credit_hours !== undefined) course.creditHours = dto.credit_hours;
    if (dto.is_active !== undefined) course.isActive = dto.is_active;
    if (dto.display_order !== undefined) course.displayOrder = dto.display_order;
    return this.saveUnique(
      () => this.courses.save(course),
      'Course slug already exists',
    );
  }

  async deleteCourse(id: string): Promise<void> {
    const course = await this.courses.findOne({
      where: { id },
      relations: { weeks: true },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (course.weeks.length > 0) {
      throw new ConflictException('Course cannot be deleted while it contains weeks');
    }
    await this.removeProtected(() => this.courses.remove(course));
  }

  async createWeek(courseId: string, dto: CreateWeekDto): Promise<Week> {
    await this.requireCourse(courseId);
    return this.saveUnique(
      () => this.weeks.save(this.weeks.create({
        courseId,
        weekNumber: dto.week_number,
        title: dto.title?.trim() || null,
        description: dto.description?.trim() || null,
        displayOrder: dto.display_order ?? dto.week_number,
      })),
      'Week number already exists in this course',
    );
  }

  async listWeeks(courseId: string, role: UserRole): Promise<Week[]> {
    await this.getCourse(courseId, role);
    const weeks = await this.weeks.find({
      where: { courseId },
      relations: { lectures: true },
      order: {
        displayOrder: 'ASC',
        lectures: { displayOrder: 'ASC' },
      },
    });
    if (role === UserRole.STUDENT) {
      for (const week of weeks) {
        week.lectures = week.lectures.filter((lecture) => lecture.isPublished);
      }
    }
    return weeks;
  }

  async getWeek(id: string, role: UserRole): Promise<Week> {
    const week = await this.weeks.findOne({
      where: { id },
      relations: {
        course: true,
        lectures: { topics: true, resources: true },
      },
      order: {
        lectures: {
          displayOrder: 'ASC',
          topics: { displayOrder: 'ASC' },
        },
      },
    });
    if (
      !week ||
      (role === UserRole.STUDENT && !week.course.isActive)
    ) {
      throw new NotFoundException('Week not found');
    }
    if (role === UserRole.STUDENT) {
      week.lectures = week.lectures.filter((lecture) => lecture.isPublished);
    }
    return week;
  }

  async updateWeek(id: string, dto: UpdateWeekDto): Promise<Week> {
    const week = await this.requireWeek(id);
    if (dto.title !== undefined) week.title = dto.title.trim() || null;
    if (dto.description !== undefined) {
      week.description = dto.description.trim() || null;
    }
    if (dto.display_order !== undefined) week.displayOrder = dto.display_order;
    return this.weeks.save(week);
  }

  async deleteWeek(id: string): Promise<void> {
    const week = await this.weeks.findOne({
      where: { id },
      relations: { lectures: true },
    });
    if (!week) throw new NotFoundException('Week not found');
    if (week.lectures.length > 0) {
      throw new ConflictException('Week cannot be deleted while it contains lectures');
    }
    await this.removeProtected(() => this.weeks.remove(week));
  }

  async createLecture(weekId: string, dto: CreateLectureDto): Promise<Lecture> {
    await this.requireWeek(weekId);
    return this.saveUnique(
      () => this.lectures.save(this.lectures.create({
        weekId,
        lectureNumber: dto.lecture_number,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        estimatedDurationMinutes: dto.estimated_duration_minutes ?? null,
        displayOrder: dto.display_order ?? dto.lecture_number,
        isPublished: false,
      })),
      'Lecture number already exists in this week',
    );
  }

  async listLectures(weekId: string, role: UserRole): Promise<Lecture[]> {
    const week = await this.weeks.findOne({
      where: { id: weekId },
      relations: { course: true },
    });
    if (!week || (role === UserRole.STUDENT && !week.course.isActive)) {
      throw new NotFoundException('Week not found');
    }
    return this.lectures.find({
      where: {
        weekId,
        ...(role === UserRole.STUDENT ? { isPublished: true } : {}),
      },
      relations: { topics: true, resources: true },
      order: {
        displayOrder: 'ASC',
        topics: { displayOrder: 'ASC' },
      },
    });
  }

  async getLecture(id: string, role: UserRole): Promise<Lecture> {
    const lecture = await this.lectures.findOne({
      where: { id },
      relations: {
        week: { course: true },
        topics: true,
        resources: true,
      },
      order: { topics: { displayOrder: 'ASC' } },
    });
    if (
      !lecture ||
      (role === UserRole.STUDENT &&
        (!lecture.isPublished || !lecture.week.course.isActive))
    ) {
      throw new NotFoundException('Lecture not found');
    }
    return lecture;
  }

  async updateLecture(id: string, dto: UpdateLectureDto): Promise<Lecture> {
    const lecture = await this.requireLecture(id);
    if (dto.title !== undefined) lecture.title = dto.title.trim();
    if (dto.description !== undefined) {
      lecture.description = dto.description.trim() || null;
    }
    if (dto.estimated_duration_minutes !== undefined) {
      lecture.estimatedDurationMinutes = dto.estimated_duration_minutes;
    }
    if (dto.display_order !== undefined) lecture.displayOrder = dto.display_order;
    if (dto.is_published !== undefined) {
      if (dto.is_published) {
        const [topicCount, resourceCount] = await Promise.all([
          this.topics.count({ where: { lectureId: id } }),
          this.resources.count({ where: { lectureId: id } }),
        ]);
        if (topicCount === 0 && resourceCount === 0) {
          throw new ConflictException(
            'Lecture requires at least one topic or resource before publishing',
          );
        }
      }
      lecture.isPublished = dto.is_published;
    }
    return this.lectures.save(lecture);
  }

  async deleteLecture(id: string): Promise<void> {
    const lecture = await this.lectures.findOne({
      where: { id },
      relations: { topics: true, resources: true },
    });
    if (!lecture) throw new NotFoundException('Lecture not found');
    if (lecture.topics.length > 0 || lecture.resources.length > 0) {
      throw new ConflictException(
        'Lecture cannot be deleted while it contains topics or resources',
      );
    }
    await this.removeProtected(() => this.lectures.remove(lecture));
  }

  async createTopic(lectureId: string, dto: CreateTopicDto): Promise<Topic> {
    const lecture = await this.requireLecture(lectureId);
    const maximumFileSize = this.config.get<number>('MAX_FILE_SIZE', 52_428_800);
    if (dto.file_size !== undefined && dto.file_size > maximumFileSize) {
      throw new ConflictException('Resource exceeds the configured maximum file size');
    }
    if (lecture.isPublished) {
      throw new ConflictException('Unpublish the lecture before changing its topics');
    }
    return this.topics.save(this.topics.create({
      lectureId,
      topicName: dto.topic_name.trim(),
      description: dto.description?.trim() || null,
      displayOrder: dto.display_order ?? 1,
    }));
  }

  async listTopics(lectureId: string, role: UserRole): Promise<Topic[]> {
    await this.getLecture(lectureId, role);
    return this.topics.find({
      where: { lectureId },
      order: { displayOrder: 'ASC', topicName: 'ASC' },
    });
  }

  async getTopic(id: string, role: UserRole): Promise<Topic> {
    const topic = await this.topics.findOne({
      where: { id },
      relations: { lecture: { week: { course: true } } },
    });
    if (
      !topic ||
      (role === UserRole.STUDENT &&
        (!topic.lecture.isPublished || !topic.lecture.week.course.isActive))
    ) {
      throw new NotFoundException('Topic not found');
    }
    return topic;
  }

  async updateTopic(id: string, dto: UpdateTopicDto): Promise<Topic> {
    const topic = await this.topics.findOne({
      where: { id },
      relations: { lecture: true },
    });
    if (!topic) throw new NotFoundException('Topic not found');
    if (topic.lecture.isPublished) {
      throw new ConflictException('Unpublish the lecture before changing its topics');
    }
    if (dto.topic_name !== undefined) topic.topicName = dto.topic_name.trim();
    if (dto.description !== undefined) {
      topic.description = dto.description.trim() || null;
    }
    if (dto.display_order !== undefined) topic.displayOrder = dto.display_order;
    return this.topics.save(topic);
  }

  async deleteTopic(id: string): Promise<void> {
    const topic = await this.topics.findOne({
      where: { id },
      relations: { lecture: true, questions: true },
    });
    if (!topic) throw new NotFoundException('Topic not found');
    if (topic.lecture.isPublished) {
      throw new ConflictException('Unpublish the lecture before deleting its topics');
    }
    if (topic.questions.length > 0) {
      throw new ConflictException('Topic cannot be deleted while questions reference it');
    }
    await this.removeProtected(() => this.topics.remove(topic));
  }

  async createResource(
    lectureId: string,
    dto: CreateResourceDto,
  ): Promise<Resource> {
    const lecture = await this.requireLecture(lectureId);
    const maximumFileSize = this.config.get<number>('MAX_FILE_SIZE', 52_428_800);
    if (dto.file_size !== undefined && dto.file_size > maximumFileSize) {
      throw new ConflictException('Resource exceeds the configured maximum file size');
    }
    if (lecture.isPublished) {
      throw new ConflictException('Unpublish the lecture before changing its resources');
    }
    return this.resources.save(this.resources.create({
      lectureId,
      resourceName: dto.resource_name.trim(),
      resourceType: dto.resource_type,
      uploadStatus: UploadStatus.UPLOADED,
      fileUrl: dto.file_url,
      fileSize: dto.file_size !== undefined ? String(dto.file_size) : null,
      description: dto.description?.trim() || null,
    }));
  }

  async listResources(lectureId: string, role: UserRole): Promise<Resource[]> {
    await this.getLecture(lectureId, role);
    return this.resources.find({
      where: { lectureId },
      order: { createdAt: 'ASC' },
    });
  }

  async deleteResource(id: string): Promise<void> {
    const resource = await this.resources.findOne({
      where: { id },
      relations: { lecture: true },
    });
    if (!resource) throw new NotFoundException('Resource not found');
    if (resource.lecture.isPublished) {
      throw new ConflictException('Unpublish the lecture before deleting its resources');
    }
    await this.removeProtected(() => this.resources.remove(resource));
  }

  private async requireSemester(id: string): Promise<Semester> {
    const entity = await this.semesters.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Semester not found');
    return entity;
  }

  private async requireCourse(id: string): Promise<Course> {
    const entity = await this.courses.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Course not found');
    return entity;
  }

  private async requireWeek(id: string): Promise<Week> {
    const entity = await this.weeks.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Week not found');
    return entity;
  }

  private async requireLecture(id: string): Promise<Lecture> {
    const entity = await this.lectures.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Lecture not found');
    return entity;
  }

  private normalizeSlug(value: string): string {
    return value.trim().toLowerCase();
  }

  private async removeProtected(operation: () => Promise<unknown>): Promise<void> {
    try {
      await operation();
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as QueryFailedError & { driverError?: { code?: string } })
          .driverError?.code === '23503'
      ) {
        throw new ConflictException('Academic record is referenced by another workflow');
      }
      throw error;
    }
  }

  private async saveUnique<T>(
    operation: () => Promise<T>,
    message: string,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as QueryFailedError & { driverError?: { code?: string } })
          .driverError?.code === '23505'
      ) {
        throw new ConflictException(message);
      }
      throw error;
    }
  }
}
