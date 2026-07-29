import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';
import { CardQueryDto, CreateDeckDto, CreateFlashcardDto, DeckQueryDto, ReviewFlashcardDto, UpdateDeckDto, UpdateFlashcardDto } from './dtos/flashcards.dto';
import { FlashcardsService } from './flashcards.service';
const uuid=new ParseUUIDPipe({version:'4'});

@Controller('flashcards')
@UseGuards(JwtAuthGuard,RolesGuard)
export class FlashcardsController {
 constructor(private readonly flashcards:FlashcardsService){}

 @Get('decks')
 listDecks(@Query() query:DeckQueryDto,@CurrentUser() actor:AuthenticatedUser){return this.flashcards.listDecks(query,actor);}
 @Post('decks') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN)
 createDeck(@Body() dto:CreateDeckDto,@CurrentUser() actor:AuthenticatedUser){return this.flashcards.createDeck(dto,actor);}
 @Get('decks/:deckId')
 getDeck(@Param('deckId',uuid) id:string,@CurrentUser() actor:AuthenticatedUser){return this.flashcards.getDeck(id,actor);}
 @Put('decks/:deckId') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN)
 updateDeck(@Param('deckId',uuid) id:string,@Body() dto:UpdateDeckDto,@CurrentUser() actor:AuthenticatedUser){return this.flashcards.updateDeck(id,dto,actor);}
 @Delete('decks/:deckId') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN) @HttpCode(HttpStatus.NO_CONTENT)
 async removeDeck(@Param('deckId',uuid) id:string,@CurrentUser() actor:AuthenticatedUser){await this.flashcards.removeDeck(id,actor);}

 @Post('decks/:deckId/cards') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN)
 addCard(@Param('deckId',uuid) id:string,@Body() dto:CreateFlashcardDto,@CurrentUser() actor:AuthenticatedUser){return this.flashcards.addCard(id,dto,actor);}
 @Get('decks/:deckId/cards')
 listCards(@Param('deckId',uuid) id:string,@Query() query:CardQueryDto,@CurrentUser() actor:AuthenticatedUser){return this.flashcards.listCards(id,query,actor);}
 @Get('cards/due') @Roles(UserRole.STUDENT)
 listDue(@Query() query:CardQueryDto,@CurrentUser() actor:AuthenticatedUser){return this.flashcards.listDue(actor,query);}
 @Put('cards/:cardId') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN)
 updateCard(@Param('cardId',uuid) id:string,@Body() dto:UpdateFlashcardDto,@CurrentUser() actor:AuthenticatedUser){return this.flashcards.updateCard(id,dto,actor);}
 @Delete('cards/:cardId') @Roles(UserRole.INSTRUCTOR,UserRole.SYSTEM_ADMIN) @HttpCode(HttpStatus.NO_CONTENT)
 async removeCard(@Param('cardId',uuid) id:string,@CurrentUser() actor:AuthenticatedUser){await this.flashcards.removeCard(id,actor);}
 @Get('cards/:cardId/progress') @Roles(UserRole.STUDENT)
 getProgress(@Param('cardId',uuid) id:string,@CurrentUser() actor:AuthenticatedUser){return this.flashcards.getProgress(id,actor);}
 @Post('cards/:cardId/review') @Roles(UserRole.STUDENT)
 review(@Param('cardId',uuid) id:string,@Body() dto:ReviewFlashcardDto,@CurrentUser() actor:AuthenticatedUser){return this.flashcards.review(id,dto,actor);}
}
