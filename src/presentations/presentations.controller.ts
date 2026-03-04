import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PresentationsService } from './presentations.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import {
  RequirePermissions,
  RequireAnyPermission,
} from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  CreatePresentationDto,
  UpdatePresentationDto,
  SetPresentationCrewDto,
  SaveSummaryDto,
} from './dto/presentations.dto';

@ApiTags('Presentations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class PresentationsController {
  constructor(
    private presentationsService: PresentationsService,
    private prisma: PrismaService,
  ) {}

  private async getUserPermissions(userId: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });
    if (!user?.role) return [];
    return user.role.permissions.map((rp) => rp.permission.slug);
  }

  // Presentations under trips
  @Get('trips/:tripId/presentations')
  @ApiOperation({ summary: 'Презентации в поездке' })
  findByTrip(@Param('tripId') tripId: string) {
    return this.presentationsService.findByTrip(tripId);
  }

  @Post('trips/:tripId/presentations')
  @RequirePermissions('presentations.create')
  @ApiOperation({ summary: 'Создать презентацию' })
  create(
    @Param('tripId') tripId: string,
    @Body() dto: CreatePresentationDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.presentationsService.create(tripId, dto, userId);
  }

  // Standalone presentation endpoints
  @Get('presentations')
  @RequireAnyPermission('presentations.view-all', 'presentations.view-person')
  @ApiOperation({ summary: 'Все презентации' })
  async findAll(
    @Query('filter') filter: string,
    @CurrentUser('id') userId: string,
  ) {
    const permissions = await this.getUserPermissions(userId);
    return this.presentationsService.findAll(filter, userId, permissions);
  }

  @Get('presentations/:id')
  @ApiOperation({ summary: 'Детали презентации' })
  findById(@Param('id') id: string) {
    return this.presentationsService.findById(id);
  }

  @Patch('presentations/:id')
  @RequirePermissions('presentations.edit')
  @ApiOperation({ summary: 'Редактировать презентацию' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePresentationDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.presentationsService.update(id, dto, userId);
  }

  @Delete('presentations/:id')
  @RequirePermissions('presentations.delete')
  @ApiOperation({ summary: 'Удалить/отменить презентацию' })
  delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.presentationsService.delete(id, userId);
  }

  // Crew
  @Patch('presentations/:id/crew')
  @RequirePermissions('presentations.edit')
  @ApiOperation({ summary: 'Установить состав презентации' })
  setCrew(
    @Param('id') id: string,
    @Body() dto: SetPresentationCrewDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.presentationsService.setCrew(id, dto, userId);
  }

  // Summary
  @Get('presentations/:id/summary')
  @RequireAnyPermission('presentations.view-all', 'presentations.view-person')
  @ApiOperation({ summary: 'Получить итоги презентации' })
  getSummary(@Param('id') id: string) {
    return this.presentationsService.getSummary(id);
  }

  @Post('presentations/:id/summary')
  @RequirePermissions('presentations.edit')
  @ApiOperation({ summary: 'Сохранить итоги презентации' })
  saveSummary(
    @Param('id') id: string,
    @Body() dto: SaveSummaryDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.presentationsService.saveSummary(id, dto, userId);
  }
}
