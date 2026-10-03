import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BundleAccessService } from './bundle-access.service';

@Module({
  imports: [TypeOrmModule.forFeature([])],
  providers: [BundleAccessService],
  exports: [BundleAccessService],
})
export class BundleAccessModule {}
