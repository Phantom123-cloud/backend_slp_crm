import { Module } from '@nestjs/common';
import { GuestListsController } from './guest-lists.controller';
import { GuestListsService } from './guest-lists.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [GuestListsController],
  providers: [GuestListsService],
})
export class GuestListsModule {}
