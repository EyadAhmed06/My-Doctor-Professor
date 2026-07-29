import { Body, Controller, ForbiddenException, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ChangePasswordDto, UpdateUserProfileDto } from './dtos/users.dto';
import { UsersService } from './users.service';
const uuid=new ParseUUIDPipe({version:'4'});

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
 constructor(private readonly users:UsersService){}

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
   gender:dto.gender,profilePictureUrl:dto.profile_picture_url,
  });
 }
 @Post(':userId/change-password') @HttpCode(HttpStatus.NO_CONTENT)
 async changePassword(@Param('userId',uuid) id:string,@Body() dto:ChangePasswordDto,@CurrentUser() actor:AuthenticatedUser){
  this.assertSelf(id,actor);
  await this.users.changePassword(id,dto.current_password,dto.new_password);
 }
 private assertSelf(id:string,actor:AuthenticatedUser){
  if(id!==actor.userId) throw new ForbiddenException('You can access only your own user profile');
 }
}
