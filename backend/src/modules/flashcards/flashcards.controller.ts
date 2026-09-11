import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DeniedRoles } from '../auth/decorators/denied-roles.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';
import { CardQueryDto, CreateDeckDto, CreateFlashcardDto, DeckQueryDto, FlashcardDeckAcademicScope, ReviewFlashcardDto, UpdateDeckDistributionDto, UpdateDeckDto, UpdateFlashcardDto } from './dtos/flashcards.dto';
import { FlashcardAccessService } from './flashcard-access.service';
import { FlashcardDistributionService } from './flashcard-distribution.service';
import { FlashcardEditingService } from './flashcard-editing.service';
import { FlashcardsService } from './flashcards.service';
const uuid=new ParseUUIDPipe({version:'4'});

@Controller('flashcards')
@UseGuards(JwtAuthGuard,RolesGuard)
@DeniedRoles(UserRole.SYSTEM_ADMIN)
export class FlashcardsController {
 constructor(
  private readonly flashcards:FlashcardsService,
  private readonly access:FlashcardAccessService,
  private readonly distribution:FlashcardDistributionService,
  private readonly editing:FlashcardEditingService,
 ){}

 @Get('courses') @Roles(UserRole.STUDENT)
 listCourses(@CurrentUser() actor:AuthenticatedUser){return this.access.listStudentCourses(actor);}
 @Get('decks')
 listDecks(@Query() query:DeckQueryDto,@CurrentUser() actor:AuthenticatedUser){return actor.role===UserRole.STUDENT?this.access.listStudentDecks(query,actor):this.flashcards.listDecks(query,actor);}
 @Post('decks') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN)
 createDeck(@Body() dto:CreateDeckDto,@CurrentUser() actor:AuthenticatedUser){this.assertAcademicScope(dto.scope_type,dto.week_id,dto.lecture_id);return this.flashcards.createDeck(dto,actor);}
 @Get('decks/:deckId')
 async getDeck(@Param('deckId',uuid) id:string,@CurrentUser() actor:AuthenticatedUser){await this.access.assertDeckReadable(id,actor);return this.flashcards.getDeck(id,actor);}
 @Put('decks/:deckId') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN)
 updateDeck(@Param('deckId',uuid) id:string,@Body() dto:UpdateDeckDto,@CurrentUser() actor:AuthenticatedUser){if(dto.scope_type)this.assertAcademicScope(dto.scope_type,dto.week_id??undefined,dto.lecture_id??undefined);return this.flashcards.updateDeck(id,dto,actor);}
 @Get('decks/:deckId/distribution') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN)
 getDistribution(@Param('deckId',uuid) id:string,@CurrentUser() actor:AuthenticatedUser){return this.distribution.get(id,actor);}
 @Put('decks/:deckId/distribution') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN)
 updateDistribution(@Param('deckId',uuid) id:string,@Body() dto:UpdateDeckDistributionDto,@CurrentUser() actor:AuthenticatedUser){return this.distribution.update(id,dto,actor);}
 @Delete('decks/:deckId') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN) @HttpCode(HttpStatus.NO_CONTENT)
 async removeDeck(@Param('deckId',uuid) id:string,@CurrentUser() actor:AuthenticatedUser){await this.flashcards.removeDeck(id,actor);}

 @Post('decks/:deckId/cards') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN)
 addCard(@Param('deckId',uuid) id:string,@Body() dto:CreateFlashcardDto,@CurrentUser() actor:AuthenticatedUser){return this.flashcards.addCard(id,dto,actor);}
 @Get('decks/:deckId/cards')
 async listCards(@Param('deckId',uuid) id:string,@Query() query:CardQueryDto,@CurrentUser() actor:AuthenticatedUser){await this.access.assertDeckReadable(id,actor);return this.flashcards.listCards(id,query,actor);}
 @Get('cards/due') @Roles(UserRole.STUDENT)
 listDue(@Query() query:CardQueryDto,@CurrentUser() actor:AuthenticatedUser){return this.access.listStudentDue(actor,query);}
 @Get('cards/mine') @Roles(UserRole.STUDENT)
 listMine(@Query() query:CardQueryDto,@CurrentUser() actor:AuthenticatedUser){return this.access.listStudentAll(actor,query);}
 @Put('cards/:cardId') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN)
 updateCard(@Param('cardId',uuid) id:string,@Body() dto:UpdateFlashcardDto,@CurrentUser() actor:AuthenticatedUser){return this.editing.updateCard(id,dto,actor);}
 @Delete('cards/:cardId') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN) @HttpCode(HttpStatus.NO_CONTENT)
 async removeCard(@Param('cardId',uuid) id:string,@CurrentUser() actor:AuthenticatedUser){await this.flashcards.removeCard(id,actor);}
 @Get('cards/:cardId/progress') @Roles(UserRole.STUDENT)
 async getProgress(@Param('cardId',uuid) id:string,@CurrentUser() actor:AuthenticatedUser){await this.access.assertCardReadable(id,actor);return this.flashcards.getProgress(id,actor);}
 @Post('cards/:cardId/review') @Roles(UserRole.STUDENT)
 async review(@Param('cardId',uuid) id:string,@Body() dto:ReviewFlashcardDto,@CurrentUser() actor:AuthenticatedUser){await this.access.assertCardReadable(id,actor);return this.flashcards.review(id,dto,actor);}

 private assertAcademicScope(scope:FlashcardDeckAcademicScope,weekId?:string,lectureId?:string) {
  if(scope===FlashcardDeckAcademicScope.COURSE&&(weekId||lectureId)) throw new BadRequestException('Course-scoped decks cannot select a week or lecture');
  if(scope===FlashcardDeckAcademicScope.WEEK&&(!weekId||lectureId)) throw new BadRequestException('Week-scoped decks require a week and cannot select a lecture');
  if(scope===FlashcardDeckAcademicScope.LECTURE&&(!weekId||!lectureId)) throw new BadRequestException('Lecture-scoped decks require both week and lecture');
 }
}
