import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, ILike, In, Repository } from 'typeorm';
import { DrugReference } from '../../common/entities/drug-reference.entity';
import { NotebookAttachment } from '../../common/entities/notebook-attachment.entity';
import { NotebookCollection } from '../../common/entities/notebook-collection.entity';
import { NotebookNote } from '../../common/entities/notebook-note.entity';
import { NotebookTag } from '../../common/entities/notebook-tag.entity';
import { QuestionDifficulty } from '../../common/entities/question.entity';
import { StudentStudyPlan } from '../../common/entities/student-study-plan.entity';
import { StudyPlanItem } from '../../common/entities/study-plan-item.entity';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { FlashcardsService } from '../flashcards/flashcards.service';
import { UserRole } from '../users/entities/user.entity';
import {
 AddNotebookAttachmentDto, ConvertNoteToFlashcardDto, CreateNotebookNoteDto,
 DrugReferenceQueryDto, NotebookQueryDto, SaveDrugReferenceDto,
 SaveNotebookCollectionDto, SaveNotebookTagDto, StudyPlanCalendarQueryDto,
 UpdateDrugReferenceDto, UpdateNotebookCollectionDto, UpdateNotebookNoteDto,
 UpdateStudyPlanDto,
} from './dtos/workspace.dto';

@Injectable()
export class WorkspaceService {
 constructor(
  @InjectRepository(NotebookNote) private readonly notes:Repository<NotebookNote>,
  @InjectRepository(NotebookCollection) private readonly collections:Repository<NotebookCollection>,
  @InjectRepository(NotebookTag) private readonly tags:Repository<NotebookTag>,
  @InjectRepository(NotebookAttachment) private readonly attachments:Repository<NotebookAttachment>,
  @InjectRepository(StudentStudyPlan) private readonly plans:Repository<StudentStudyPlan>,
  @InjectRepository(StudyPlanItem) private readonly planItems:Repository<StudyPlanItem>,
  @InjectRepository(DrugReference) private readonly drugs:Repository<DrugReference>,
  private readonly dataSource:DataSource,
  private readonly flashcards:FlashcardsService,
 ){}

 async listNotes(userId:string,query:NotebookQueryDto){
  const page=query.page??1,limit=query.limit??20;
  const builder=this.notes.createQueryBuilder('note')
   .leftJoinAndSelect('note.collection','collection').leftJoinAndSelect('note.tags','tag')
   .leftJoinAndSelect('note.attachments','attachment').where('note.user_id=:userId',{userId})
   .orderBy('note.updated_at','DESC').skip((page-1)*limit).take(limit);
  if(query.note_type)builder.andWhere('note.note_type=:type',{type:query.note_type});
  if(query.collection_id)builder.andWhere('note.collection_id=:collectionId',{collectionId:query.collection_id});
  if(query.tag_id)builder.andWhere('tag.id=:tagId',{tagId:query.tag_id});
  if(query.favorite!==undefined)builder.andWhere('note.is_favorite=:favorite',{favorite:query.favorite});
  if(query.search)builder.andWhere('(note.title ILIKE :search OR note.content ILIKE :search)',{search:`%${query.search.trim()}%`});
  const [data,total]=await builder.getManyAndCount();
  return{data,page,limit,total,total_pages:Math.ceil(total/limit)};
 }
 async getNote(userId:string,id:string){return this.requireNote(userId,id,true);}
 async createNote(userId:string,dto:CreateNotebookNoteDto){
  await this.validateNotebookLinks(userId,dto.collection_id,dto.tag_ids);
  const note=this.notes.create({userId,title:dto.title.trim(),noteType:dto.note_type,content:dto.content.trim(),metadata:dto.metadata??{},
   collectionId:dto.collection_id??null,isFavorite:dto.is_favorite??false,reviewAt:dto.review_at?new Date(dto.review_at):null,
   linkedQuestionId:dto.linked_question_id??null,linkedLectureId:dto.linked_lecture_id??null});
  if(dto.tag_ids?.length)note.tags=await this.tags.findBy({id:In(dto.tag_ids),userId});
  return this.notes.save(note);
 }
 async updateNote(userId:string,id:string,dto:UpdateNotebookNoteDto){
  const note=await this.requireNote(userId,id,true);await this.validateNotebookLinks(userId,dto.collection_id??undefined,dto.tag_ids);
  if(dto.title!==undefined)note.title=dto.title.trim();if(dto.note_type!==undefined)note.noteType=dto.note_type;
  if(dto.content!==undefined)note.content=dto.content.trim();if(dto.metadata!==undefined)note.metadata=dto.metadata;
  if(dto.collection_id!==undefined)note.collectionId=dto.collection_id;if(dto.is_favorite!==undefined)note.isFavorite=dto.is_favorite;
  if(dto.review_at!==undefined)note.reviewAt=dto.review_at?new Date(dto.review_at):null;
  if(dto.linked_question_id!==undefined)note.linkedQuestionId=dto.linked_question_id;
  if(dto.linked_lecture_id!==undefined)note.linkedLectureId=dto.linked_lecture_id;
  if(dto.tag_ids!==undefined)note.tags=dto.tag_ids.length?await this.tags.findBy({id:In(dto.tag_ids),userId}):[];
  return this.notes.save(note);
 }
 async removeNote(userId:string,id:string){await this.notes.remove(await this.requireNote(userId,id));}
 async listCollections(userId:string){return this.collections.find({where:{userId},relations:{notes:true},order:{isPinned:'DESC',updatedAt:'DESC'}});}
 async createCollection(userId:string,dto:SaveNotebookCollectionDto){
  const name=dto.name.trim();if(await this.collectionNameExists(userId,name))throw new ConflictException('A collection with this name already exists');
  return this.collections.save(this.collections.create({userId,name,description:dto.description?.trim()||null,color:dto.color??'#5b8f8a',isPinned:dto.is_pinned??false}));
 }
 async updateCollection(userId:string,id:string,dto:UpdateNotebookCollectionDto){
  const collection=await this.requireCollection(userId,id);if(dto.name!==undefined&&await this.collectionNameExists(userId,dto.name,id))throw new ConflictException('A collection with this name already exists');
  if(dto.name!==undefined)collection.name=dto.name.trim();if(dto.description!==undefined)collection.description=dto.description.trim()||null;
  if(dto.color!==undefined)collection.color=dto.color;if(dto.is_pinned!==undefined)collection.isPinned=dto.is_pinned;
  return this.collections.save(collection);
 }
 async removeCollection(userId:string,id:string){await this.collections.remove(await this.requireCollection(userId,id));}
 async listTags(userId:string){return this.tags.find({where:{userId},order:{name:'ASC'}});}
 async createTag(userId:string,dto:SaveNotebookTagDto){
  const duplicate=await this.tags.createQueryBuilder('tag').where('tag.user_id=:userId',{userId}).andWhere('lower(tag.name)=lower(:name)',{name:dto.name.trim()}).getOne();
  if(duplicate)throw new ConflictException('A tag with this name already exists');
  return this.tags.save(this.tags.create({userId,name:dto.name.trim(),color:dto.color??'#5b8f8a'}));
 }
 async removeTag(userId:string,id:string){const tag=await this.tags.findOne({where:{id,userId}});if(!tag)throw new NotFoundException('Notebook tag not found');await this.tags.remove(tag);}
 async addAttachment(userId:string,noteId:string,dto:AddNotebookAttachmentDto){
  await this.requireNote(userId,noteId);return this.attachments.save(this.attachments.create({noteId,kind:dto.kind,fileName:dto.file_name.trim(),mimeType:dto.mime_type.trim(),fileUrl:dto.file_url.trim(),sizeBytes:dto.size_bytes?.toString()??null}));
 }
 async removeAttachment(userId:string,noteId:string,attachmentId:string){await this.requireNote(userId,noteId);const attachment=await this.attachments.findOne({where:{id:attachmentId,noteId}});if(!attachment)throw new NotFoundException('Notebook attachment not found');await this.attachments.remove(attachment);}
 async convertToFlashcard(actor:AuthenticatedUser,noteId:string,dto:ConvertNoteToFlashcardDto){
  await this.requireNote(actor.userId,noteId);
  return this.flashcards.addCard(dto.deck_id,{title:dto.title,front_content:dto.front_content,back_content:dto.back_content,difficulty:QuestionDifficulty.MEDIUM},actor);
 }

 async getPlan(studentId:string){
  let plan=await this.plans.findOne({where:{studentId}});if(plan)return plan;
  await this.plans.createQueryBuilder().insert().values({studentId,targetExam:null,examDate:null,dailyQuestionTarget:20,weeklyHoursTarget:10,dailyFlashcardTarget:20,preferences:{available_days:[1,2,3,4,5,6],rest_day:0},generatedAt:null,scheduleVersion:0}).orIgnore().execute();
  plan=await this.plans.findOne({where:{studentId}});if(!plan)throw new NotFoundException('Student study plan could not be initialized');return plan;
 }
 async updatePlan(studentId:string,dto:UpdateStudyPlanDto){
  const plan=await this.getPlan(studentId);
  if(dto.target_exam!==undefined)plan.targetExam=typeof dto.target_exam==='string'?dto.target_exam.trim()||null:null;
  if(dto.exam_date!==undefined){
   const today=this.isoDate(new Date());
   if(dto.exam_date<=today)throw new BadRequestException('Exam date must be after today');
   plan.examDate=dto.exam_date;
  }
  if(dto.daily_question_target!==undefined)plan.dailyQuestionTarget=dto.daily_question_target;
  if(dto.weekly_hours_target!==undefined)plan.weeklyHoursTarget=dto.weekly_hours_target;
  if(dto.daily_flashcard_target!==undefined)plan.dailyFlashcardTarget=dto.daily_flashcard_target;
  if(dto.preferences!==undefined)plan.preferences=this.normalizePlanPreferences(dto.preferences);

  const preferences=this.normalizePlanPreferences(plan.preferences||{});
  plan.preferences=preferences;
  const availableDays=(preferences.available_days as number[]).filter((day)=>day!==preferences.rest_day);
  const questionMinutes=Number(preferences.questions_minutes??Math.max(30,Math.ceil(plan.dailyQuestionTarget*1.5)));
  const flashcardMinutes=Number(preferences.flashcards_minutes??Math.max(15,Math.ceil(plan.dailyFlashcardTarget*.5)));
  const dailyCapacity=Math.floor(plan.weeklyHoursTarget*60/availableDays.length);
  if(questionMinutes+flashcardMinutes>dailyCapacity){
   throw new BadRequestException(
    `Saved question and flashcard sessions require ${questionMinutes+flashcardMinutes} minutes per study day, but weekly capacity allows ${dailyCapacity}. Increase weekly hours or reduce session durations.`,
   );
  }
  return this.plans.save(plan);
 }

 async getCalendar(studentId:string,query:StudyPlanCalendarQueryDto){
  await this.getPlan(studentId);const from=query.from??this.isoDate(new Date()),to=query.to??this.isoDate(new Date(Date.now()+30*86_400_000));
  if(new Date(to)<new Date(from))throw new BadRequestException('Calendar end date must not precede start date');
  const data=await this.planItems.createQueryBuilder('item').leftJoinAndSelect('item.lecture','lecture').where('item.student_id=:studentId',{studentId}).andWhere('item.scheduled_date BETWEEN :from AND :to',{from,to}).orderBy('item.scheduled_date','ASC').addOrderBy('item.created_at','ASC').getMany();
  return{from,to,data};
 }

 async readiness(studentId:string){
  await this.getPlan(studentId);
  const rows=await this.dataSource.query(`
   SELECT
    COALESCE((SELECT ROUND(100.0*COUNT(*) FILTER(WHERE answer.is_correct=TRUE)
      /NULLIF(COUNT(*) FILTER(WHERE answer.is_correct IS NOT NULL),0),2)
      FROM student_answers answer
      JOIN test_attempts attempt ON attempt.id=answer.attempt_id
      WHERE attempt.student_id=$1
        AND (answer.selected_option_id IS NOT NULL
          OR NULLIF(BTRIM(answer.essay_answer),'') IS NOT NULL)),0)::float AS accuracy,
    COALESCE((SELECT ROUND(AVG(progress.completion_percentage),2)
      FROM student_course_progress progress
      WHERE progress.student_id=$1 AND EXISTS (
       SELECT 1 FROM bundle_courses bundle_course
       JOIN bundles bundle ON bundle.id=bundle_course.bundle_id
       JOIN bundle_enrollments enrollment ON enrollment.bundle_id=bundle.id
       WHERE bundle_course.course_id=progress.course_id
        AND enrollment.student_id=$1 AND enrollment.status='ACTIVE'
        AND enrollment.starts_at<=CURRENT_TIMESTAMP
        AND (enrollment.expires_at IS NULL OR enrollment.expires_at>CURRENT_TIMESTAMP)
        AND bundle.status='PUBLISHED'
        AND (bundle.is_free=TRUE OR enrollment.payment_status='PAID')
        AND (bundle.available_from IS NULL OR bundle.available_from<=CURRENT_TIMESTAMP)
        AND (bundle.available_until IS NULL OR bundle.available_until>CURRENT_TIMESTAMP)
      )),0)::float AS curriculum,
    COALESCE((SELECT ROUND(100.0*COUNT(*) FILTER(WHERE progress.is_mastered)
      /NULLIF(COUNT(*),0),2)
      FROM student_flashcard_progress progress
      JOIN flashcards card ON card.id=progress.flashcard_id AND card.is_active=TRUE
      JOIN flashcard_decks deck ON deck.id=card.deck_id AND deck.is_published=TRUE
      WHERE progress.student_id=$1 AND progress.times_reviewed>0
       AND EXISTS (
        SELECT 1 FROM bundle_courses bundle_course
        JOIN bundles bundle ON bundle.id=bundle_course.bundle_id
        JOIN bundle_enrollments enrollment ON enrollment.bundle_id=bundle.id
        WHERE bundle_course.course_id=deck.course_id
         AND enrollment.student_id=$1 AND enrollment.status='ACTIVE'
         AND enrollment.starts_at<=CURRENT_TIMESTAMP
         AND (enrollment.expires_at IS NULL OR enrollment.expires_at>CURRENT_TIMESTAMP)
         AND bundle.status='PUBLISHED'
         AND (bundle.is_free=TRUE OR enrollment.payment_status='PAID')
         AND (bundle.available_from IS NULL OR bundle.available_from<=CURRENT_TIMESTAMP)
         AND (bundle.available_until IS NULL OR bundle.available_until>CURRENT_TIMESTAMP)
       )),0)::float AS flashcards,
    COALESCE((SELECT ROUND(100.0*COUNT(*) FILTER(WHERE status='COMPLETED')
      /NULLIF(COUNT(*),0),2)
      FROM study_plan_items
      WHERE student_id=$1 AND scheduled_date<=CURRENT_DATE
       AND item_type<>'REST'),0)::float AS consistency
  `,[studentId]);
  const components=rows[0] as {accuracy:number;curriculum:number;flashcards:number;consistency:number};
  const score=Math.max(0,Math.min(100,Math.round(
   components.accuracy*.4+components.curriculum*.25+components.flashcards*.2+components.consistency*.15,
  )));
  return{score,band:score>=80?'READY':score>=60?'ON_TRACK':score>=40?'DEVELOPING':'GETTING_STARTED',
   components,weights:{accuracy:.4,curriculum:.25,flashcards:.2,consistency:.15}};
 }

 async listDrugs(actor:AuthenticatedUser,query:DrugReferenceQueryDto){const page=query.page??1,limit=query.limit??20;const where:FindOptionsWhere<DrugReference>={};if(actor.role===UserRole.STUDENT)where.isPublished=true;if(query.category)where.category=query.category;if(query.search)where.name=ILike(`%${query.search}%`);const [data,total]=await this.drugs.findAndCount({where,order:{name:'ASC'},skip:(page-1)*limit,take:limit});return{data,page,limit,total,total_pages:Math.ceil(total/limit)};}
 async getDrug(actor:AuthenticatedUser,slug:string){const drug=await this.drugs.findOne({where:{slug}});if(!drug||(actor.role===UserRole.STUDENT&&!drug.isPublished))throw new NotFoundException('Drug reference not found');return drug;}
 async createDrug(actor:AuthenticatedUser,dto:SaveDrugReferenceDto){this.assertEditor(actor);const slug=dto.slug.trim().toLowerCase();if(await this.drugs.findOne({where:{slug}}))throw new ConflictException('Drug reference slug already exists');return this.drugs.save(this.drugs.create({name:dto.name.trim(),slug,category:dto.category.trim(),drugClass:dto.drug_class.trim(),content:dto.content,isPublished:dto.is_published??false,createdBy:actor.userId}));}
 async updateDrug(actor:AuthenticatedUser,id:string,dto:UpdateDrugReferenceDto){this.assertEditor(actor);const drug=await this.drugs.findOne({where:{id}});if(!drug)throw new NotFoundException('Drug reference not found');if(dto.slug!==undefined){const slug=dto.slug.trim().toLowerCase();const duplicate=await this.drugs.findOne({where:{slug}});if(duplicate&&duplicate.id!==id)throw new ConflictException('Drug reference slug already exists');drug.slug=slug;}if(dto.name!==undefined)drug.name=dto.name.trim();if(dto.category!==undefined)drug.category=dto.category.trim();if(dto.drug_class!==undefined)drug.drugClass=dto.drug_class.trim();if(dto.content!==undefined)drug.content=dto.content;if(dto.is_published!==undefined)drug.isPublished=dto.is_published;return this.drugs.save(drug);}

 private normalizePlanPreferences(value:Record<string,unknown>){
  const rawDays=Array.isArray(value.available_days)?value.available_days:[1,2,3,4,5,6];
  const availableDays=[...new Set(rawDays.map(Number).filter((day)=>Number.isInteger(day)&&day>=0&&day<=6))];
  const restCandidate=Number(value.rest_day);
  const restDay=Number.isInteger(restCandidate)&&restCandidate>=0&&restCandidate<=6?restCandidate:0;
  const studyDays=availableDays.filter((day)=>day!==restDay);
  if(!studyDays.length)throw new BadRequestException('Choose at least one available study day distinct from the rest day');
  const numberPreference=(key:'questions_minutes'|'flashcards_minutes')=>{
   if(value[key]===undefined)return undefined;
   const parsed=Number(value[key]);
   if(!Number.isInteger(parsed)||parsed<5||parsed>1440)throw new BadRequestException(`${key} must be an integer from 5 to 1440`);
   return parsed;
  };
  return{...value,available_days:availableDays,rest_day:restDay,
   ...(numberPreference('questions_minutes')===undefined?{}:{questions_minutes:numberPreference('questions_minutes')}),
   ...(numberPreference('flashcards_minutes')===undefined?{}:{flashcards_minutes:numberPreference('flashcards_minutes')})};
 }

 private async requireNote(userId:string,id:string,relations=false){const note=await this.notes.findOne({where:{id,userId},relations:relations?{collection:true,tags:true,attachments:true}:undefined});if(!note)throw new NotFoundException('Notebook note not found');return note;}
 private async validateNotebookLinks(userId:string,collectionId?:string,tagIds?:string[]){if(collectionId)await this.requireCollection(userId,collectionId);if(tagIds?.length&&await this.tags.count({where:{id:In(tagIds),userId}})!==new Set(tagIds).size)throw new BadRequestException('One or more tags do not belong to this account');}
 private async requireCollection(userId:string,id:string){const item=await this.collections.findOne({where:{id,userId}});if(!item)throw new NotFoundException('Notebook collection not found');return item;}
 private async collectionNameExists(userId:string,name:string,excludeId?:string){const item=await this.collections.createQueryBuilder('collection').where('collection.user_id=:userId',{userId}).andWhere('lower(collection.name)=lower(:name)',{name:name.trim()}).getOne();return !!item&&item.id!==excludeId;}
 private isoDate(value:Date){return value.toISOString().slice(0,10);}
 private assertEditor(actor:AuthenticatedUser){if(actor.role===UserRole.STUDENT)throw new ForbiddenException('Only instructors and administrators can manage drug references');}
}