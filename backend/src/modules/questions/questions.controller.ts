import { Body, Controller, Delete, Get, NotImplementedException, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('questions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QuestionsController {
 private pending():never{throw new NotImplementedException('Question workflow will be implemented after DTO contracts');}
 @Post() @Roles('INSTRUCTOR','SYSTEM_ADMIN') create(@Body() _body:unknown){return this.pending();}
 @Get() list(@Query() _query:Record<string,string>){return this.pending();}
 @Get('search') search(@Query() _query:Record<string,string>){return this.pending();}
 @Get(':questionId') getOne(@Param('questionId') _id:string){return this.pending();}
 @Put(':questionId') @Roles('INSTRUCTOR','SYSTEM_ADMIN') update(@Param('questionId') _id:string,@Body() _body:unknown){return this.pending();}
 @Delete(':questionId') @Roles('INSTRUCTOR','SYSTEM_ADMIN') remove(@Param('questionId') _id:string){return this.pending();}
 @Post(':questionId/duplicate') @Roles('INSTRUCTOR','SYSTEM_ADMIN') duplicate(@Param('questionId') _id:string){return this.pending();}
 @Get(':questionId/options') getOptions(@Param('questionId') _id:string){return this.pending();}
 @Post(':questionId/options') @Roles('INSTRUCTOR','SYSTEM_ADMIN') addOption(@Param('questionId') _id:string,@Body() _body:unknown){return this.pending();}
 @Put('options/:optionId') @Roles('INSTRUCTOR','SYSTEM_ADMIN') updateOption(@Param('optionId') _id:string,@Body() _body:unknown){return this.pending();}
 @Delete('options/:optionId') @Roles('INSTRUCTOR','SYSTEM_ADMIN') removeOption(@Param('optionId') _id:string){return this.pending();}
 @Post(':questionId/essay-configuration') @Roles('INSTRUCTOR','SYSTEM_ADMIN') setEssayConfiguration(@Param('questionId') _id:string,@Body() _body:unknown){return this.pending();}
 @Get(':questionId/essay-configuration') getEssayConfiguration(@Param('questionId') _id:string){return this.pending();}
 @Get('tags/all') listTags(){return this.pending();}
 @Post('tags') @Roles('INSTRUCTOR','SYSTEM_ADMIN') createTag(@Body() _body:unknown){return this.pending();}
 @Delete('tags/:tagId') @Roles('INSTRUCTOR','SYSTEM_ADMIN') removeTag(@Param('tagId') _id:string){return this.pending();}
 @Post(':questionId/tags/:tagId') @Roles('INSTRUCTOR','SYSTEM_ADMIN') addTag(@Param('questionId') _questionId:string,@Param('tagId') _tagId:string){return this.pending();}
 @Delete(':questionId/tags/:tagId') @Roles('INSTRUCTOR','SYSTEM_ADMIN') removeQuestionTag(@Param('questionId') _questionId:string,@Param('tagId') _tagId:string){return this.pending();}
}
