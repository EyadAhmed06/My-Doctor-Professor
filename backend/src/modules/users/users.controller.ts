import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RateLimit } from '../auth/decorators/rate-limit.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ChangePasswordDto, DeleteOwnAccountDto, UpdateUserProfileDto } from './dtos/users.dto';
import { ProfilePictureStorageService } from './profile-picture-storage.service';
import { UsersService } from './users.service';
const uuid=new ParseUUIDPipe({version:'4'});

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
 constructor(
  private readonly users:UsersService,
  private readonly profilePictures:ProfilePictureStorageService,
 ){}

 @Get(':userId')
 getOne(@Param('userId',uuid) id:string,@CurrentUser() actor:AuthenticatedUser){
  this.assertSelf(id,actor);return this.users.getUserProfile(id);
 }
 @Put(':userId')
 update(@Param('userId',uuid) id:string,@Body() dto:UpdateUserProfileDto,@CurrentUser() actor:AuthenticatedUser){
  this.assertSelf(id,actor);
  return this.users.updateProfile(id,{
   fullName:dto.full_name,phoneNumber:dto.phone_number,
   dateOfBirth:dto.date_of_birth?new Date(dto.date_of_birth):undefined,
   gender:dto.gender,
  });
 }
 @Put(':userId/profile-picture')
 @RateLimit({limit:8,windowMs:60_000})
 async uploadProfilePicture(
  @Param('userId',uuid) id:string,
  @CurrentUser() actor:AuthenticatedUser,
  @Req() request:Request,
 ){
  this.assertSelf(id,actor);
  const existing=await this.users.getUserProfile(id);
  const body=await this.readPictureBody(request);
  const key=await this.profilePictures.store(body,request.headers['content-type']);
  const nextUrl=this.profilePictures.publicUrl(key);
  try{
   const updated=await this.users.updateProfile(id,{profilePictureUrl:nextUrl});
   await this.profilePictures.deleteByUrl(existing.profilePictureUrl);
   return updated;
  }catch(error){
   await this.profilePictures.deleteByUrl(nextUrl);
   throw error;
  }
 }
 @Delete(':userId/profile-picture') @HttpCode(HttpStatus.NO_CONTENT)
 @RateLimit({limit:8,windowMs:60_000})
 async deleteProfilePicture(@Param('userId',uuid) id:string,@CurrentUser() actor:AuthenticatedUser){
  this.assertSelf(id,actor);
  const existing=await this.users.getUserProfile(id);
  await this.users.updateProfile(id,{profilePictureUrl:''});
  await this.profilePictures.deleteByUrl(existing.profilePictureUrl);
 }
 @Delete(':userId') @HttpCode(HttpStatus.NO_CONTENT)
 async deleteOwnAccount(@Param('userId',uuid) id:string,@Body() dto:DeleteOwnAccountDto,@CurrentUser() actor:AuthenticatedUser){
  this.assertSelf(id,actor);
  await this.users.deactivateOwnAccount(id,dto.current_password);
 }
 @Post(':userId/change-password') @HttpCode(HttpStatus.NO_CONTENT)
 async changePassword(@Param('userId',uuid) id:string,@Body() dto:ChangePasswordDto,@CurrentUser() actor:AuthenticatedUser){
  this.assertSelf(id,actor);
  await this.users.changePassword(id,dto.current_password,dto.new_password);
 }
 private assertSelf(id:string,actor:AuthenticatedUser){
  if(id!==actor.userId) throw new ForbiddenException('You can access only your own user profile');
 }
 private async readPictureBody(request:Request):Promise<Buffer>{
  const contentLength=Number(request.headers['content-length']??0);
  if(Number.isFinite(contentLength)&&contentLength>this.profilePictures.maxBytes){
   throw new BadRequestException(`Profile picture must be ${Math.floor(this.profilePictures.maxBytes/1024/1024)} MB or smaller`);
  }
  const chunks:Buffer[]=[];
  let size=0;
  for await(const chunk of request){
   const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk as Uint8Array);
   size+=buffer.length;
   if(size>this.profilePictures.maxBytes){
    throw new BadRequestException(`Profile picture must be ${Math.floor(this.profilePictures.maxBytes/1024/1024)} MB or smaller`);
   }
   chunks.push(buffer);
  }
  return Buffer.concat(chunks,size);
 }
}
