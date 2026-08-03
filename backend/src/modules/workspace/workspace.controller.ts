import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';import { Roles } from '../auth/decorators/roles.decorator';import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';import { RolesGuard } from '../auth/guards/roles.guard';import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';import { UserRole } from '../users/entities/user.entity';
import { CreateNotebookNoteDto, DrugReferenceQueryDto, NotebookQueryDto, SaveDrugReferenceDto, UpdateDrugReferenceDto, UpdateNotebookNoteDto, UpdateStudyPlanDto } from './dtos/workspace.dto';import { WorkspaceService } from './workspace.service';
const uuid=new ParseUUIDPipe({version:'4'});
@Controller() @UseGuards(JwtAuthGuard,RolesGuard)
export class WorkspaceController {constructor(private readonly workspace:WorkspaceService){}
 @Get('notebook/notes') listNotes(@CurrentUser() actor:AuthenticatedUser,@Query() query:NotebookQueryDto){return this.workspace.listNotes(actor.userId,query);}
 @Post('notebook/notes') createNote(@CurrentUser() actor:AuthenticatedUser,@Body() dto:CreateNotebookNoteDto){return this.workspace.createNote(actor.userId,dto);}
 @Put('notebook/notes/:noteId') updateNote(@CurrentUser() actor:AuthenticatedUser,@Param('noteId',uuid) id:string,@Body() dto:UpdateNotebookNoteDto){return this.workspace.updateNote(actor.userId,id,dto);}
 @Delete('notebook/notes/:noteId') @HttpCode(HttpStatus.NO_CONTENT) async removeNote(@CurrentUser() actor:AuthenticatedUser,@Param('noteId',uuid) id:string){await this.workspace.removeNote(actor.userId,id);}
 @Get('study-plan') @Roles(UserRole.STUDENT) getPlan(@CurrentUser() actor:AuthenticatedUser){return this.workspace.getPlan(actor.userId);}
 @Put('study-plan') @Roles(UserRole.STUDENT) updatePlan(@CurrentUser() actor:AuthenticatedUser,@Body() dto:UpdateStudyPlanDto){return this.workspace.updatePlan(actor.userId,dto);}
 @Get('drug-references') listDrugs(@CurrentUser() actor:AuthenticatedUser,@Query() query:DrugReferenceQueryDto){return this.workspace.listDrugs(actor,query);}
 @Get('drug-references/:slug') getDrug(@CurrentUser() actor:AuthenticatedUser,@Param('slug') slug:string){return this.workspace.getDrug(actor,slug);}
 @Post('drug-references') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN) createDrug(@CurrentUser() actor:AuthenticatedUser,@Body() dto:SaveDrugReferenceDto){return this.workspace.createDrug(actor,dto);}
 @Put('drug-references/:drugId') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN) updateDrug(@CurrentUser() actor:AuthenticatedUser,@Param('drugId',uuid) id:string,@Body() dto:UpdateDrugReferenceDto){return this.workspace.updateDrug(actor,id,dto);}
}
