import { Module } from '@nestjs/common';
import { BundleAccessModule } from '../bundle-access/bundle-access.module';
import { EssayCasesController } from './essay-cases.controller';
import { EssayCasesService } from './essay-cases.service';

@Module({
  imports: [BundleAccessModule],
  controllers: [EssayCasesController],
  providers: [EssayCasesService],
})
export class EssayCasesModule {}
