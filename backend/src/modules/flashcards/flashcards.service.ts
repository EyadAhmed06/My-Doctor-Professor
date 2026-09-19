import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository } from 'typeorm';
import { Course } from '../../common/entities/course.entity';
import { CourseInstructor } from '../../common/entities/course-instructor.entity';
import { FlashcardDeck } from '../../common/entities/flashcard-deck.entity';
import { Flashcard } from '../../common/entities/flashcard.entity';
import { Lecture } from '../../common/entities/lecture.entity';
import { StudentFlashcardProgress } from '../../common/entities/student-flashcard-progress.entity';
import { Topic } from '../../common/entities/topic.entity';
import { Week } from '../../common/entities/week.entity';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { Student } from '../users/entities/student.entity';
import { UserRole } from '../users/entities/user.entity';
import {
  CardQueryDto,
  CreateDeckDto,
  CreateFlashcardDto,
  DeckQueryDto,
  ReviewFlashcardDto,
  ReviewRating,
  UpdateDeckDto,
  UpdateFlashcardDto,
} from './dtos/flashcards.dto';

@Injectable()
export class FlashcardsService {
  constructor(
    @InjectRepository(FlashcardDeck) private readonly decks: Repository<FlashcardDeck>,
    @InjectRepository(Flashcard) private readonly cards: Repository<Flashcard>,
    @InjectRepository(StudentFlashcardProgress) private readonly progress: Repository<StudentFlashcardProgress>,
    @InjectRepository(Course) private readonly courses: Repository<Course>,
    @InjectRepository(CourseInstructor) private readonly courseInstructors: Repository<CourseInstructor>,
    @InjectRepository(Week) private readonly weeks: Repository<Week>,
    @InjectRepository(Lecture) private readonly lectures: Repository<Lecture>,
    @InjectRepository(Topic) private readonly topics: Repository<Topic>,
    @InjectRepository(Student) private readonly students: Repository<Student>,
    private readonly dataSource: DataSource,
  ) {}

  async createDeck(dto: CreateDeckDto, actor: AuthenticatedUser) {
    const scope = await this.resolveScope(dto.course_id, dto.week_id, dto.lecture_id, dto.topic_id);
    if (actor.role === UserRole.INSTRUCTOR) {
      const assigned = await this.courseInstructors.exists({
        where: { courseId: scope.courseId, instructorId: actor.userId },
      });
      if (!assigned) throw new ForbiddenException('You are not assigned to manage this course');
    }
    return this.decks.save(this.decks.create({
      ...scope,
      createdBy: actor.userId,
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      isPublished: false,
      displayOrder: dto.display_order ?? 1,
    }));
  }

  async listDecks(query: DeckQueryDto, actor: AuthenticatedUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const builder = this.decks.createQueryBuilder('deck')
      .leftJoinAndSelect('deck.course', 'course')
      .leftJoinAndSelect('deck.week', 'week')
      .leftJoinAndSelect('deck.lecture', 'lecture')
      .leftJoinAndSelect('deck.topic', 'topic')
      .orderBy('deck.display_order', 'ASC')
      .addOrderBy('deck.created_at', 'DESC')
      .skip((page - 1) * limit).take(limit);
    if (actor.role === UserRole.STUDENT) {
      builder.andWhere('deck.is_published = TRUE')
        .andWhere('course.is_active = TRUE')
        .andWhere('(deck.lecture_id IS NULL OR lecture.is_published = TRUE)');
    } else if (actor.role === UserRole.INSTRUCTOR) {
      builder.andWhere('deck.created_by = :actorId', { actorId: actor.userId });
    }
    if (query.course_id) builder.andWhere('deck.course_id = :courseId', { courseId: query.course_id });
    if (query.week_id) builder.andWhere('deck.week_id = :weekId', { weekId: query.week_id });
    if (query.lecture_id) builder.andWhere('deck.lecture_id = :lectureId', { lectureId: query.lecture_id });
    if (query.topic_id) builder.andWhere('deck.topic_id = :topicId', { topicId: query.topic_id });
    if (query.is_published !== undefined && actor.role !== UserRole.STUDENT) {
      builder.andWhere('deck.is_published = :published', { published: query.is_published });
    }
    if (query.search) {
      builder.andWhere(new Brackets((where) => where
        .where('deck.title ILIKE :search')
        .orWhere('deck.description ILIKE :search')),
      { search: `%${query.search.trim()}%` });
    }
    const [decks,total] = await builder.getManyAndCount();
    const deckIds = decks.map((deck) => deck.id);
    const countRows = deckIds.length ? await this.cards.createQueryBuilder('card')
      .select('card.deck_id', 'deck_id')
      .addSelect('COUNT(*)::int', 'count')
      .where('card.deck_id IN (:...deckIds)', { deckIds })
      .andWhere('card.is_active = TRUE')
      .groupBy('card.deck_id')
      .getRawMany<{deck_id:string;count:number}>() : [];
    const counts = new Map(countRows.map((row) => [row.deck_id, Number(row.count)]));
    const data = decks.map((deck) => ({...deck,cardCount:counts.get(deck.id)??0}));
    return { data,page,limit,total,total_pages:Math.ceil(total/limit) };
  }

  async getDeck(id:string,actor:AuthenticatedUser) {
    const deck = await this.requireDeck(id);
    this.assertCanView(deck,actor);
    deck.cards = (deck.cards ?? []).filter((card) =>
      actor.role !== UserRole.STUDENT || card.isActive);
    return deck;
  }

  async updateDeck(id:string,dto:UpdateDeckDto,actor:AuthenticatedUser) {
    const deck = await this.requireOwnedDeck(id,actor);
    if (!Object.keys(dto).length) throw new BadRequestException('At least one deck field must be provided');
    const scopeFields = ['course_id','week_id','lecture_id','topic_id'] as const;
    const scopeChange = scopeFields.some((key)=>Object.prototype.hasOwnProperty.call(dto,key));
    if (deck.isPublished && scopeChange && dto.is_published !== false) {
      throw new ConflictException('Return the deck to Draft before changing its academic scope');
    }
    if (dto.title!==undefined) deck.title=dto.title.trim();
    if (dto.description!==undefined) deck.description=dto.description.trim()||null;
    if (dto.display_order!==undefined) deck.displayOrder=dto.display_order;
    if (scopeChange) {
      const scope=await this.resolveScope(
        dto.course_id===null?undefined:(dto.course_id??deck.courseId??undefined),
        dto.week_id===null?undefined:(dto.week_id??deck.weekId??undefined),
        dto.lecture_id===null?undefined:(dto.lecture_id??deck.lectureId??undefined),
        dto.topic_id===null?undefined:(dto.topic_id??deck.topicId??undefined),
      );
      if(actor.role===UserRole.INSTRUCTOR) {
        const assigned=await this.courseInstructors.exists({where:{courseId:scope.courseId,instructorId:actor.userId}});
        if(!assigned) throw new ForbiddenException('You are not assigned to manage this course');
      }
      deck.courseId=scope.courseId;
      deck.weekId=scope.weekId;
      deck.lectureId=scope.lectureId;
      deck.topicId=scope.topicId;
      deck.course=await this.courses.findOne({where:{id:scope.courseId}});
      deck.week=scope.weekId?await this.weeks.findOne({where:{id:scope.weekId}}):null;
      deck.lecture=scope.lectureId?await this.lectures.findOne({where:{id:scope.lectureId}}):null;
      deck.topic=scope.topicId?await this.topics.findOne({where:{id:scope.topicId}}):null;
    }
    if (dto.is_published!==undefined) {
      if (dto.is_published) await this.assertPublishable(deck);
      deck.isPublished=dto.is_published;
    }
    return this.decks.save(deck);
  }

  async removeDeck(id:string,actor:AuthenticatedUser):Promise<void> {
    const deck=await this.requireOwnedDeck(id,actor);
    if(deck.isPublished) throw new ConflictException('Unpublish the deck before deleting it');
    const reviewed=await this.progress.createQueryBuilder('progress')
      .innerJoin('progress.flashcard','card')
      .where('card.deck_id = :deckId',{deckId:id}).getExists();
    if(reviewed) throw new ConflictException('A reviewed deck cannot be deleted');
    await this.decks.remove(deck);
  }

  async addCard(deckId:string,dto:CreateFlashcardDto,actor:AuthenticatedUser) {
    const deck=await this.requireOwnedDeck(deckId,actor);
    this.assertDraft(deck);
    return this.cards.save(this.cards.create({
      deckId,title:dto.title.trim(),frontContent:dto.front_content.trim(),
      backContent:dto.back_content.trim(),difficulty:dto.difficulty,
      explanation:dto.explanation?.trim()||null,hint:dto.hint?.trim()||null,
      estimatedReviewSeconds:dto.estimated_review_seconds??null,
      displayOrder:dto.display_order??1,isActive:true,
    }));
  }

  async listCards(deckId:string,query:CardQueryDto,actor:AuthenticatedUser) {
    const deck=await this.requireDeck(deckId);
    this.assertCanView(deck,actor);
    const page=query.page??1,limit=query.limit??50;
    const builder=this.cards.createQueryBuilder('card')
      .where('card.deck_id = :deckId',{deckId})
      .orderBy('card.display_order','ASC')
      .skip((page-1)*limit).take(limit);
    if(actor.role===UserRole.STUDENT) builder.andWhere('card.is_active = TRUE');
    if(query.difficulty) builder.andWhere('card.difficulty = :difficulty',{difficulty:query.difficulty});
    if(query.is_active!==undefined && actor.role!==UserRole.STUDENT) {
      builder.andWhere('card.is_active = :active',{active:query.is_active});
    }
    const [data,total]=await builder.getManyAndCount();
    return {data,page,limit,total,total_pages:Math.ceil(total/limit)};
  }

  async updateCard(id:string,dto:UpdateFlashcardDto,actor:AuthenticatedUser) {
    const card=await this.requireCard(id);
    this.assertOwner(card.deck,actor);
    this.assertDraft(card.deck);
    if(!Object.keys(dto).length) throw new BadRequestException('At least one card field must be provided');
    if(await this.progress.exists({where:{flashcardId:id}})) {
      throw new ConflictException('A reviewed flashcard is immutable; create a new card instead');
    }
    if(dto.title!==undefined) card.title=dto.title.trim();
    if(dto.front_content!==undefined) card.frontContent=dto.front_content.trim();
    if(dto.back_content!==undefined) card.backContent=dto.back_content.trim();
    if(dto.difficulty!==undefined) card.difficulty=dto.difficulty;
    if(dto.explanation!==undefined) card.explanation=dto.explanation.trim()||null;
    if(dto.hint!==undefined) card.hint=dto.hint.trim()||null;
    if(dto.estimated_review_seconds!==undefined) card.estimatedReviewSeconds=dto.estimated_review_seconds;
    if(dto.display_order!==undefined) card.displayOrder=dto.display_order;
    if(dto.is_active!==undefined) card.isActive=dto.is_active;
    return this.cards.save(card);
  }

  async removeCard(id:string,actor:AuthenticatedUser):Promise<void> {
    const card=await this.requireCard(id);
    this.assertOwner(card.deck,actor);
    this.assertDraft(card.deck);
    if(await this.progress.exists({where:{flashcardId:id}})) {
      throw new ConflictException('A reviewed flashcard cannot be deleted');
    }
    await this.cards.remove(card);
  }

  async getProgress(cardId:string,actor:AuthenticatedUser) {
    await this.requireStudent(actor.userId);
    const card=await this.requireVisibleCard(cardId);
    const state=await this.progress.findOne({where:{studentId:actor.userId,flashcardId:cardId}});
    return state ?? {
      studentId:actor.userId,flashcardId:card.id,timesReviewed:0,timesCorrect:0,
      timesIncorrect:0,reviewStreak:0,lastReviewedAt:null,nextReviewAt:null,
      isMastered:false,masteredAt:null,easeFactor:'2.50',intervalDays:0,
    };
  }

  async listDue(actor:AuthenticatedUser,query:CardQueryDto) {
    await this.requireStudent(actor.userId);
    const page=query.page??1,limit=query.limit??50,now=new Date();
    const builder=this.cards.createQueryBuilder('card')
      .innerJoinAndSelect('card.deck','deck')
      .innerJoinAndSelect('deck.course','course')
      .leftJoinAndSelect('deck.lecture','lecture')
      .leftJoinAndMapOne(
        'card.progress','student_flashcard_progress','progress',
        'progress.flashcard_id = card.id AND progress.student_id = :studentId',
        {studentId:actor.userId},
      )
      .where('card.is_active = TRUE')
      .andWhere('deck.is_published = TRUE')
      .andWhere('course.is_active = TRUE')
      .andWhere('(deck.lecture_id IS NULL OR lecture.is_published = TRUE)')
      .andWhere('(progress.id IS NULL OR progress.next_review_at IS NULL OR progress.next_review_at <= :now)',{now})
      .orderBy('progress.next_review_at','ASC','NULLS FIRST')
      .addOrderBy('deck.display_order','ASC')
      .addOrderBy('card.display_order','ASC')
      .skip((page-1)*limit).take(limit);
    if(query.difficulty) builder.andWhere('card.difficulty = :difficulty',{difficulty:query.difficulty});
    const [data,total]=await builder.getManyAndCount();
    return {data,page,limit,total,total_pages:Math.ceil(total/limit)};
  }

  async review(cardId:string,dto:ReviewFlashcardDto,actor:AuthenticatedUser) {
    await this.requireStudent(actor.userId);
    await this.requireVisibleCard(cardId);
    return this.dataSource.transaction(async(manager)=>{
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`${actor.userId}:${cardId}`],
      );
      const repository=manager.getRepository(StudentFlashcardProgress);
      let state=await repository.findOne({
        where:{studentId:actor.userId,flashcardId:cardId},
        lock:{mode:'pessimistic_write'},
      });
      const now=new Date();
      if(state?.nextReviewAt && state.nextReviewAt>now) {
        throw new ConflictException('This flashcard is not due for review yet');
      }
      state??=repository.create({
        studentId:actor.userId,flashcardId:cardId,timesReviewed:0,timesCorrect:0,
        timesIncorrect:0,reviewStreak:0,lastReviewedAt:null,nextReviewAt:null,
        isMastered:false,masteredAt:null,easeFactor:'2.50',intervalDays:0,
      });
      const quality=this.quality(dto.rating);
      const successful=quality>=3;
      const oldEase=Number(state.easeFactor);
      const newEase=Math.max(1.3,oldEase+(0.1-(5-quality)*(0.08+(5-quality)*0.02)));
      state.timesReviewed+=1;
      if(successful) {
        state.timesCorrect+=1;
        state.reviewStreak+=1;
        if(state.reviewStreak===1) state.intervalDays=1;
        else if(state.reviewStreak===2) state.intervalDays=6;
        else {
          const multiplier=dto.rating===ReviewRating.EASY?1.3:
            dto.rating===ReviewRating.HARD?0.8:1;
          state.intervalDays=Math.max(1,Math.round(state.intervalDays*newEase*multiplier));
        }
      } else {
        state.timesIncorrect+=1;
        state.reviewStreak=0;
        state.intervalDays=1;
      }
      state.easeFactor=newEase.toFixed(2);
      state.lastReviewedAt=now;
      state.nextReviewAt=new Date(now.getTime()+state.intervalDays*86_400_000);
      const mastered=state.reviewStreak>=5&&state.intervalDays>=21;
      state.isMastered=mastered;
      state.masteredAt=mastered?(state.masteredAt??now):null;
      return repository.save(state);
    });
  }

  private quality(rating:ReviewRating):number {
    return {[ReviewRating.VERY_HARD]:1,[ReviewRating.HARD]:3,
      [ReviewRating.GOOD]:4,[ReviewRating.EASY]:5}[rating];
  }

  private async resolveScope(courseId?:string,weekId?:string,lectureId?:string,topicId?:string) {
    if(!courseId&&!weekId&&!lectureId&&!topicId) throw new BadRequestException('A deck requires a course, week, lecture, or topic');
    let course:Course|null=null,week:Week|null=null,lecture:Lecture|null=null,topic:Topic|null=null;
    if(topicId) {
      topic=await this.topics.findOne({where:{id:topicId},relations:{lecture:{week:{course:true}}}});
      if(!topic) throw new NotFoundException('Topic not found');
      lecture=topic.lecture;week=topic.lecture.week;course=week.course;
    } else if(lectureId) {
      lecture=await this.lectures.findOne({where:{id:lectureId},relations:{week:{course:true}}});
      if(!lecture) throw new NotFoundException('Lecture not found');
      week=lecture.week;course=week.course;
    } else if(weekId) {
      week=await this.weeks.findOne({where:{id:weekId},relations:{course:true}});
      if(!week) throw new NotFoundException('Week not found');
      course=week.course;
    } else {
      course=await this.courses.findOne({where:{id:courseId!}});
      if(!course) throw new NotFoundException('Course not found');
    }
    if(courseId&&course.id!==courseId) throw new BadRequestException('Course does not match the selected hierarchy');
    if(weekId&&week?.id!==weekId) throw new BadRequestException('Week does not match the selected hierarchy');
    if(lectureId&&lecture?.id!==lectureId) throw new BadRequestException('Lecture does not match the selected topic');
    return {courseId:course.id,weekId:week?.id??null,lectureId:lecture?.id??null,topicId:topic?.id??null};
  }

  private async requireDeck(id:string):Promise<FlashcardDeck> {
    const deck=await this.decks.findOne({
      where:{id},relations:{course:true,week:true,lecture:true,topic:true,cards:true},
      order:{cards:{displayOrder:'ASC'}},
    });
    if(!deck) throw new NotFoundException('Flashcard deck not found');
    return deck;
  }
  private async requireOwnedDeck(id:string,actor:AuthenticatedUser) {
    const deck=await this.requireDeck(id);this.assertOwner(deck,actor);return deck;
  }
  private assertOwner(deck:FlashcardDeck,actor:AuthenticatedUser) {
    if(actor.role!==UserRole.SYSTEM_ADMIN&&deck.createdBy!==actor.userId) {
      throw new ForbiddenException('You can manage only decks you created');
    }
  }
  private assertCanView(deck:FlashcardDeck,actor:AuthenticatedUser) {
    if(actor.role===UserRole.STUDENT) {
      if(!deck.isPublished||!deck.course?.isActive||(deck.lecture&&!deck.lecture.isPublished)) {
        throw new NotFoundException('Flashcard deck not found');
      }
    } else if(actor.role===UserRole.INSTRUCTOR) this.assertOwner(deck,actor);
  }
  private assertDraft(deck:FlashcardDeck) {
    if(deck.isPublished) throw new ConflictException('Unpublish the deck before changing its cards');
  }
  private async assertPublishable(deck:FlashcardDeck) {
    const active=await this.cards.count({where:{deckId:deck.id,isActive:true}});
    if(!active) throw new ConflictException('Add at least one active card before publishing');
    if(!deck.course?.isActive) throw new ConflictException('The parent course must be active');
    if(deck.lecture&&!deck.lecture.isPublished) throw new ConflictException('The parent lecture must be published');
  }
  private async requireCard(id:string):Promise<Flashcard> {
    const card=await this.cards.findOne({
      where:{id},relations:{deck:{course:true,lecture:true}},
    });
    if(!card) throw new NotFoundException('Flashcard not found');
    return card;
  }
  private async requireVisibleCard(id:string):Promise<Flashcard> {
    const card=await this.requireCard(id);
    if(!card.isActive||!card.deck.isPublished||!card.deck.course?.isActive||
      (card.deck.lecture&&!card.deck.lecture.isPublished)) {
      throw new NotFoundException('Flashcard not found');
    }
    return card;
  }
  private async requireStudent(id:string):Promise<void> {
    if(!(await this.students.exists({where:{userId:id}}))) {
      throw new ForbiddenException('Student profile is required');
    }
  }
}
