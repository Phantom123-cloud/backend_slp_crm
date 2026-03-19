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
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequireAnyPermission } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

// Все права группы guest_lists
const ALL_GL = [
  'guest_lists.view-all',
  'guest_lists.view-person',
  'guest_lists.create',
  'guest_lists.fill',
  'guest_lists.delete',
] as const;

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class GuestListsController {
  constructor(private readonly service: GuestListsService) {}

  // ── Глобальный список всех guest-lists (только view-all / view-person) ────
  @Get('guest-lists')
  @RequireAnyPermission('guest_lists.view-all', 'guest_lists.view-person')
  getAllGuestLists(@CurrentUser('id') userId: string) {
    return this.service.getAllGuestLists(userId);
  }

  // ── Уникальные даты выезда (для дропдауна импорта) ───────────────────────
  @Get('trips/:tripId/guest-lists/dates')
  @RequireAnyPermission(...ALL_GL)
  getUniqueDates(
    @Param('tripId') tripId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.getUniqueDates(tripId, userId);
  }

  // ── Импорт CSV для выезда ─────────────────────────────────────────────────
  @Post('trips/:tripId/guest-lists/import')
  @RequireAnyPermission('guest_lists.create')
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
  @RequireAnyPermission(...ALL_GL)
  getGuestLists(
    @Param('tripId') tripId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.getGuestLists(tripId, userId);
  }

  // ── История импортов выезда ───────────────────────────────────────────────
  @Get('trips/:tripId/guest-lists/logs')
  @RequireAnyPermission('guest_lists.view-all', 'guest_lists.view-person')
  getImportLogs(
    @Param('tripId') tripId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.getImportLogs(tripId, userId);
  }

  // ── Детали одного списка ──────────────────────────────────────────────────
  @Get('guest-lists/:id')
  @RequireAnyPermission(...ALL_GL)
  getGuestListById(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.getGuestListById(id, userId);
  }

  // ── Ручное создание записи гостя ─────────────────────────────────────────
  @Post('guest-lists/:id/records')
  @RequireAnyPermission('guest_lists.fill')
  createRecord(
    @Param('id') guestListId: string,
    @Body() dto: CreateGuestRecordDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.createGuestRecord(guestListId, dto, userId);
  }

  // ── Обновление записи гостя ───────────────────────────────────────────────
  @Patch('guest-lists/:id/records/:recordId')
  @RequireAnyPermission('guest_lists.fill')
  updateRecord(
    @Param('id') guestListId: string,
    @Param('recordId') recordId: string,
    @Body() dto: UpdateGuestRecordDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.updateGuestRecord(guestListId, recordId, dto, userId);
  }

  // ── Удаление одной записи ─────────────────────────────────────────────────
  @Delete('guest-lists/:id/records/:recordId')
  @RequireAnyPermission('guest_lists.delete')
  deleteRecord(
    @Param('id') guestListId: string,
    @Param('recordId') recordId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.deleteGuestRecord(guestListId, recordId, userId);
  }

  // ── Удаление по файлу с номерами ──────────────────────────────────────────
  @Post('guest-lists/:id/delete-by-file')
  @RequireAnyPermission('guest_lists.delete')
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
