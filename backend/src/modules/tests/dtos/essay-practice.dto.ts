import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class GenerateEssayPracticeDto {
  @IsUUID() bundle_id: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ArrayUnique() @IsUUID('4', { each: true }) lecture_ids: string[];
}

export class SubmitEssayPracticeAnswerDto {
  @IsString() @IsNotEmpty() @MaxLength(50000) essay_answer: string;
}
