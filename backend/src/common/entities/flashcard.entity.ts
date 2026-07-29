import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { QuestionDifficulty } from './question.entity'; import { FlashcardDeck } from './flashcard-deck.entity';
@Entity('flashcards')
export class Flashcard {
 @PrimaryGeneratedColumn('uuid') id:string; @Column('uuid',{name:'deck_id'}) deckId:string;
 @Column({type:'varchar',length:200}) title:string; @Column({type:'text',name:'front_content'}) frontContent:string; @Column({type:'text',name:'back_content'}) backContent:string;
 @Column({type:'enum',enum:QuestionDifficulty,default:QuestionDifficulty.MEDIUM}) difficulty:QuestionDifficulty;
 @Column({type:'text',nullable:true}) explanation:string|null; @Column({type:'text',nullable:true}) hint:string|null;
 @Column({type:'int',name:'estimated_review_seconds',nullable:true}) estimatedReviewSeconds:number|null;
 @Column({type:'int',default:1,name:'display_order'}) displayOrder:number; @Column({type:'boolean',default:true,name:'is_active'}) isActive:boolean;
 @CreateDateColumn({name:'created_at'}) createdAt:Date; @UpdateDateColumn({name:'updated_at'}) updatedAt:Date;
 @ManyToOne(()=>FlashcardDeck,(deck)=>deck.cards,{onDelete:'CASCADE'}) @JoinColumn({name:'deck_id'}) deck:FlashcardDeck;
}
