import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  UploadedFile,
  UseInterceptors,
  Body,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { GuestListsService, UpdateGuestRecordDto, CreateGuestRecordDto } from './guest-lists.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard)
export class GuestListsController {
  constructor(private readonly service: GuestListsService) {}

  // ── Уникальные даты выезда (для дропдауна импорта) ───────────────────────
  @Get('trips/:tripId/guest-lists/dates')
  getUniqueDates(@Param('tripId') tripId: string) {
    return this.service.getUniqueDates(tripId);
  }

  // ── Импорт CSV для выезда ─────────────────────────────────────────────────
  @Post('trips/:tripId/guest-lists/import')
  @UseInterceptors(FileInterceptor('file'))
  async importGuestList(
    @Param('tripId') tripId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('date') date: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.importGuestList(
      tripId,
      date,
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

  // ── Ручное создание записи гостя ─────────────────────────────────────────
  @Post('guest-lists/:id/records')
  createRecord(
    @Param('id') guestListId: string,
    @Body() dto: CreateGuestRecordDto,
  ) {
    return this.service.createGuestRecord(guestListId, dto);
  }

  // ── Обновление записи гостя ───────────────────────────────────────────────
  @Patch('guest-lists/:id/records/:recordId')
  updateRecord(
    @Param('id') guestListId: string,
    @Param('recordId') recordId: string,
    @Body() dto: UpdateGuestRecordDto,
  ) {
    return this.service.updateGuestRecord(guestListId, recordId, dto);
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
