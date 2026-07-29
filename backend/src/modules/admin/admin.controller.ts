import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';
import { AdminService } from './admin.service';
import { AdminUserQueryDto, CreateManagedUserDto, ImportUsersDto, StatisticsQueryDto, UpdateManagedUserDto, UpdateUserStatusDto } from './dtos/admin.dto';
const uuid=new ParseUUIDPipe({version:'4'});

@Controller('admin')
@UseGuards(JwtAuthGuard,RolesGuard)
@Roles(UserRole.SYSTEM_ADMIN)
export class AdminController {
 constructor(private readonly admin:AdminService){}

 @Get('users')
 listUsers(@Query() query:AdminUserQueryDto){return this.admin.listUsers(query);}
 @Post('users')
 createUser(@Body() dto:CreateManagedUserDto,@CurrentUser() actor:AuthenticatedUser){
  return this.admin.createUser(dto,actor);
 }
 @Post('users/import')
 importUsers(@Body() dto:ImportUsersDto,@CurrentUser() actor:AuthenticatedUser){
  return this.admin.importUsers(dto,actor);
 }
 @Get('users/:userId')
 getUser(@Param('userId',uuid) id:string){return this.admin.getUser(id);}
 @Put('users/:userId')
 updateUser(@Param('userId',uuid) id:string,@Body() dto:UpdateManagedUserDto,@CurrentUser() actor:AuthenticatedUser){
  return this.admin.updateUser(id,dto,actor);
 }
 @Patch('users/:userId/status')
 updateStatus(@Param('userId',uuid) id:string,@Body() dto:UpdateUserStatusDto,@CurrentUser() actor:AuthenticatedUser){
  return this.admin.updateStatus(id,dto,actor);
 }
 @Post('users/:userId/reset-password')
 resetPassword(@Param('userId',uuid) id:string,@CurrentUser() actor:AuthenticatedUser,@Req() request:any){
  return this.admin.resetPassword(id,actor,request.ip??request.socket?.remoteAddress??'unknown');
 }
 @Delete('users/:userId') @HttpCode(HttpStatus.NO_CONTENT)
 async removeUser(@Param('userId',uuid) id:string,@CurrentUser() actor:AuthenticatedUser){
  await this.admin.removeUser(id,actor);
 }
 @Get('statistics')
 statistics(@Query() query:StatisticsQueryDto){return this.admin.statistics(query);}
}
