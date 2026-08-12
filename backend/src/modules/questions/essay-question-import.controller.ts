import { Body, Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { UploadedResourceFile } from '../academic/resource-storage.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';
import { InspectEssayQuestionImportDto, PublishEssayQuestionImportDto } from './dtos/essay-question-import.dto';
import { EssayQuestionImportService } from './essay-question-import.service';

@Controller('questions/imports/essay')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EssayQuestionImportController {
  constructor(private readonly imports: EssayQuestionImportService) {}

  @Post('inspect')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024, files: 1 } }))
  inspect(
    @Body() dto: InspectEssayQuestionImportDto,
    @UploadedFile() file: UploadedResourceFile | undefined,
  ) {
    return this.imports.inspectPdf(dto.copyright_confirmed, file);
  }

  @Post('publish')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  publish(@Body() dto: PublishEssayQuestionImportDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.imports.publish(dto, actor);
  }
}
