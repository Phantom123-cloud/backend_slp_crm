import { Module } from '@nestjs/common';
import { DirectoriesController } from './directories.controller';
import { DirectoriesService } from './directories.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [DirectoriesController],
  providers: [DirectoriesService],
  exports: [DirectoriesService],
})
export class DirectoriesModule {}
