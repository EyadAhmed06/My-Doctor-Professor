import { Module } from '@nestjs/common';
import { EssayCasesController } from './essay-cases.controller';
import { EssayCasesService } from './essay-cases.service';

@Module({ controllers: [EssayCasesController], providers: [EssayCasesService] })
export class EssayCasesModule {}
