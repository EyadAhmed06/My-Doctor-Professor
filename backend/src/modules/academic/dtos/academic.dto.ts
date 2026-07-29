import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ResourceType } from '../../../common/entities/resource.entity';

const BooleanQuery = () =>
  Transform(({ value }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  });

export class CreateSemesterDto {
  @IsInt() @Min(1) semester_number: number;
  @IsOptional() @IsString() @MaxLength(100) title?: string;
  @IsOptional() @IsString() description?: string;
}

export class UpdateSemesterDto {
  @IsOptional() @IsString() @MaxLength(100) title?: string;
  @IsOptional() @IsString() description?: string;
}

export class CreateCourseDto {
  @IsString() @IsNotEmpty() @MaxLength(20)
  course_code: string;

  @IsString() @IsNotEmpty() @MaxLength(150)
  course_name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must contain lowercase letters, numbers, and single hyphens only',
  })
  slug: string;

  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(1) credit_hours?: number;
  @IsOptional() @IsInt() @Min(1) display_order?: number;
}

export class UpdateCourseDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(150)
  course_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug?: string;

  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(1) credit_hours?: number;
  @IsOptional() @IsBoolean() is_active?: boolean;
  @IsOptional() @IsInt() @Min(1) display_order?: number;
}

export class CourseQueryDto {
  @IsOptional() @IsUUID()
  semester_id?: string;

  @IsOptional() @BooleanQuery() @IsBoolean()
  is_active?: boolean;

  @IsOptional() @IsString() @MaxLength(100)
  search?: string;

  @IsOptional() @IsInt() @Min(1)
  page?: number;

  @IsOptional() @IsInt() @Min(1) @Max(100)
  limit?: number;
}

export class CreateWeekDto {
  @IsInt() @Min(1) week_number: number;
  @IsOptional() @IsString() @MaxLength(150) title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(1) display_order?: number;
}

export class UpdateWeekDto {
  @IsOptional() @IsString() @MaxLength(150) title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(1) display_order?: number;
}

export class CreateLectureDto {
  @IsInt() @Min(1) lecture_number: number;
  @IsString() @IsNotEmpty() @MaxLength(200) title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(1) estimated_duration_minutes?: number;
  @IsOptional() @IsInt() @Min(1) display_order?: number;
}

export class UpdateLectureDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200)
  title?: string;

  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(1) estimated_duration_minutes?: number;
  @IsOptional() @IsBoolean() is_published?: boolean;
  @IsOptional() @IsInt() @Min(1) display_order?: number;
}

export class CreateTopicDto {
  @IsString() @IsNotEmpty() @MaxLength(150) topic_name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(1) display_order?: number;
}

export class UpdateTopicDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(150)
  topic_name?: string;

  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(1) display_order?: number;
}

export class CreateResourceDto {
  @IsString() @IsNotEmpty() @MaxLength(200)
  resource_name: string;

  @IsEnum(ResourceType)
  resource_type: ResourceType;

  @IsUrl({ require_tld: false, protocols: ['https'] })
  file_url: string;

  @IsOptional() @IsInt() @Min(0)
  file_size?: number;

  @IsOptional() @IsString()
  description?: string;
}
