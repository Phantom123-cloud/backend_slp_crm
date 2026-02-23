import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PresentationsService } from './presentations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  CreatePresentationDto,
  UpdatePresentationDto,
  SetPresentationCrewDto,
} from './dto/presentations.dto';

@ApiTags('Presentations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class PresentationsController {
  constructor(private presentationsService: PresentationsService) {}

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
  delete(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
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
}
