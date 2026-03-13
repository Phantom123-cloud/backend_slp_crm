import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UploadedFile,
  UseInterceptors,
  Body,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { GuestListsService } from './guest-lists.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard)
export class GuestListsController {
  constructor(private readonly service: GuestListsService) {}

  // ── Импорт CSV для выезда ─────────────────────────────────────────────────
  @Post('trips/:tripId/guest-lists/import')
  @UseInterceptors(FileInterceptor('file'))
  async importGuestList(
    @Param('tripId') tripId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('presentationId') presentationId: string | undefined,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.importGuestList(
      tripId,
      presentationId || undefined,
      file.originalname,
      file.buffer,
      userId,
    );
  }

  // ── Все списки гостей выезда ──────────────────────────────────────────────
  @Get('trips/:tripId/guest-lists')
  getGuestLists(@Param('tripId') tripId: string) {
    return this.service.getGuestLists(tripId);
  }

  // ── История импортов выезда ───────────────────────────────────────────────
  @Get('trips/:tripId/guest-lists/logs')
  getImportLogs(@Param('tripId') tripId: string) {
    return this.service.getImportLogs(tripId);
  }

  // ── Детали одного списка ──────────────────────────────────────────────────
  @Get('guest-lists/:id')
  getGuestListById(@Param('id') id: string) {
    return this.service.getGuestListById(id);
  }

  // ── Удаление одной записи ─────────────────────────────────────────────────
  @Delete('guest-lists/:id/records/:recordId')
  deleteRecord(
    @Param('id') guestListId: string,
    @Param('recordId') recordId: string,
  ) {
    return this.service.deleteGuestRecord(guestListId, recordId);
  }

  // ── Удаление по файлу с номерами ──────────────────────────────────────────
  @Post('guest-lists/:id/delete-by-file')
  @UseInterceptors(FileInterceptor('file'))
  deleteByFile(
    @Param('id') guestListId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.deleteByFile(
      guestListId,
      file.originalname,
      file.buffer,
      userId,
    );
  }
}
