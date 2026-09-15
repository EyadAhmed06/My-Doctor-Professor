import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,ArrayMinSize,IsArray,IsBoolean,IsEmail,IsEnum,IsInt,
  IsNotEmpty,IsOptional,IsPhoneNumber,IsString,Matches,Max,MaxLength,
  Min,MinLength,ValidateIf,ValidateNested,
} from 'class-validator';
import { UserRole, UserStatus } from '../../users/entities/user.entity';

const roleScoped = (role:UserRole) => ({value,obj}:{value:unknown;obj:{role?:UserRole}}) =>
  obj.role===role?value:undefined;

export class CreateManagedUserDto {
 @IsString() @IsNotEmpty() @MaxLength(150) full_name:string;
 @IsEmail() @MaxLength(320) email:string;
 @IsString() @MinLength(12) @MaxLength(128)
 @Matches(/[a-z]/,{message:'password must contain at least one lowercase letter'})
 @Matches(/[A-Z]/,{message:'password must contain at least one uppercase letter'})
 @Matches(/[0-9]/,{message:'password must contain at least one number'}) password:string;
 @IsPhoneNumber() phone_number:string;
 @IsEnum(UserRole) role:UserRole;

 @Transform(roleScoped(UserRole.STUDENT))
 @ValidateIf((dto:CreateManagedUserDto)=>dto.role===UserRole.STUDENT)
 @IsString() @IsNotEmpty() @MaxLength(30) student_number?:string;

 @Transform(roleScoped(UserRole.STUDENT))
 @ValidateIf((dto:CreateManagedUserDto)=>dto.role===UserRole.STUDENT)
 @IsInt() @Min(1) current_semester?:number;

 @Transform(roleScoped(UserRole.INSTRUCTOR))
 @IsOptional() @IsString() @MaxLength(150) specialization?:string;

 @Transform(roleScoped(UserRole.INSTRUCTOR))
 @IsOptional() @IsString() @MaxLength(100) office_location?:string;

 @Transform(roleScoped(UserRole.SYSTEM_ADMIN))
 @IsOptional() @IsString() @IsNotEmpty() @MaxLength(30) employee_number?:string;

 @Transform(roleScoped(UserRole.SYSTEM_ADMIN))
 @IsOptional() @IsBoolean() is_super_admin?:boolean;
}
export class UpdateManagedUserDto {
 @IsOptional() @IsString() @IsNotEmpty() @MaxLength(150) full_name?:string;
 @IsOptional() @IsPhoneNumber() phone_number?:string;
 @IsOptional() @IsInt() @Min(1) current_semester?:number;
 @IsOptional() @IsString() @MaxLength(150) specialization?:string;
 @IsOptional() @IsString() @MaxLength(100) office_location?:string;
 @IsOptional() @IsString() @IsNotEmpty() @MaxLength(30) employee_number?:string;
 @IsOptional() @IsBoolean() is_super_admin?:boolean;
}
export class UpdateUserStatusDto { @IsEnum(UserStatus) status:UserStatus; }
export class AdminUserQueryDto {
 @IsOptional() @Transform(({value})=>Number(value)) @IsInt() @Min(1) page?:number;
 @IsOptional() @Transform(({value})=>Number(value)) @IsInt() @Min(1) @Max(100) limit?:number;
 @IsOptional() @IsEnum(UserRole) role?:UserRole;
 @IsOptional() @IsEnum(UserStatus) status?:UserStatus;
 @IsOptional() @IsString() @MaxLength(200) search?:string;
}
export class ImportUsersDto {
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100)
 @ValidateNested({each:true}) @Type(()=>CreateManagedUserDto)
 users:CreateManagedUserDto[];
}
export class StatisticsQueryDto {
 @IsOptional() @IsEnum(UserRole) role?:UserRole;
}

export class BootstrapAdminDto {
 @IsString() @IsNotEmpty() @MaxLength(150) full_name:string;
 @IsEmail() @MaxLength(320) email:string;
 @IsString() @MinLength(12) @MaxLength(128)
 @Matches(/[a-z]/,{message:'password must contain at least one lowercase letter'})
 @Matches(/[A-Z]/,{message:'password must contain at least one uppercase letter'})
 @Matches(/[0-9]/,{message:'password must contain at least one number'}) password:string;
 @IsPhoneNumber() phone_number:string;
 @IsString() @IsNotEmpty() @MaxLength(30) employee_number:string;
}

export class BootstrapInstructorDto {
 @IsString() @IsNotEmpty() @MaxLength(150) full_name:string;
 @IsEmail() @MaxLength(320) email:string;
 @IsString() @MinLength(12) @MaxLength(128)
 @Matches(/[a-z]/,{message:'password must contain at least one lowercase letter'})
 @Matches(/[A-Z]/,{message:'password must contain at least one uppercase letter'})
 @Matches(/[0-9]/,{message:'password must contain at least one number'}) password:string;
 @IsPhoneNumber() phone_number:string;
 @IsOptional() @IsString() @MaxLength(150) specialization?:string;
 @IsOptional() @IsString() @MaxLength(100) office_location?:string;
}

export class BootstrapStudentDto {
 @IsString() @IsNotEmpty() @MaxLength(150) full_name:string;
 @IsEmail() @MaxLength(320) email:string;
 @IsString() @MinLength(12) @MaxLength(128)
 @Matches(/[a-z]/,{message:'password must contain at least one lowercase letter'})
 @Matches(/[A-Z]/,{message:'password must contain at least one uppercase letter'})
 @Matches(/[0-9]/,{message:'password must contain at least one number'}) password:string;
 @IsPhoneNumber() phone_number:string;
 @IsString() @IsNotEmpty() @MaxLength(30) student_number:string;
 @IsInt() @Min(1) current_semester:number;
}

export class BootstrapAccountsDto {
 @ValidateNested() @Type(()=>BootstrapAdminDto) admin:BootstrapAdminDto;
 @ValidateNested() @Type(()=>BootstrapInstructorDto) instructor:BootstrapInstructorDto;
 @ValidateNested() @Type(()=>BootstrapStudentDto) student:BootstrapStudentDto;
}
