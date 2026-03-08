import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DirectoriesService } from './directories.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  CreatePresentationTypeDto,
  UpdatePresentationTypeDto,
  CreateVenueDto,
  UpdateVenueDto,
  CreateExpenseTypeDto,
  UpdateExpenseTypeDto,
} from './dto/directories.dto';

@ApiTags('Directories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class DirectoriesController {
  constructor(private directoriesService: DirectoriesService) {}

  // === Presentation Types ===

  @Get('presentation-types')
  @ApiOperation({ summary: 'Список типов презентаций' })
  findAllPresentationTypes() {
    return this.directoriesService.findAllPresentationTypes();
  }

  @Post('presentation-types')
  @RequirePermissions('directories.manage')
  @ApiOperation({ summary: 'Создать тип презентации' })
  createPresentationType(
    @Body() dto: CreatePresentationTypeDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.directoriesService.createPresentationType(dto, userId);
  }

  @Patch('presentation-types/:id')
  @RequirePermissions('directories.manage')
  @ApiOperation({ summary: 'Обновить тип презентации' })
  updatePresentationType(
    @Param('id') id: string,
    @Body() dto: UpdatePresentationTypeDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.directoriesService.updatePresentationType(id, dto, userId);
  }

  @Delete('presentation-types/:id')
  @RequirePermissions('directories.manage')
  @ApiOperation({ summary: 'Удалить тип презентации' })
  deletePresentationType(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.directoriesService.deletePresentationType(id, userId);
  }

  // === Expense Types ===

  @Get('expense-types')
  @ApiOperation({ summary: 'Список типов расходов' })
  findAllExpenseTypes() {
    return this.directoriesService.findAllExpenseTypes();
  }

  @Post('expense-types')
  @RequirePermissions('directories.manage')
  @ApiOperation({ summary: 'Создать тип расхода' })
  createExpenseType(
    @Body() dto: CreateExpenseTypeDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.directoriesService.createExpenseType(dto, userId);
  }

  @Patch('expense-types/:id')
  @RequirePermissions('directories.manage')
  @ApiOperation({ summary: 'Обновить тип расхода' })
  updateExpenseType(
    @Param('id') id: string,
    @Body() dto: UpdateExpenseTypeDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.directoriesService.updateExpenseType(id, dto, userId);
  }

  @Delete('expense-types/:id')
  @RequirePermissions('directories.manage')
  @ApiOperation({ summary: 'Удалить тип расхода' })
  deleteExpenseType(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.directoriesService.deleteExpenseType(id, userId);
  }

  // === Venues ===

  @Get('venues')
  @ApiOperation({ summary: 'Список мест проведения' })
  findAllVenues() {
    return this.directoriesService.findAllVenues();
  }

  @Post('venues')
  @RequirePermissions('directories.manage')
  @ApiOperation({ summary: 'Создать место проведения' })
  createVenue(@Body() dto: CreateVenueDto, @CurrentUser('id') userId: string) {
    return this.directoriesService.createVenue(dto, userId);
  }

  @Patch('venues/:id')
  @RequirePermissions('directories.manage')
  @ApiOperation({ summary: 'Обновить место проведения' })
  updateVenue(
    @Param('id') id: string,
    @Body() dto: UpdateVenueDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.directoriesService.updateVenue(id, dto, userId);
  }

  @Delete('venues/:id')
  @RequirePermissions('directories.manage')
  @ApiOperation({ summary: 'Удалить место проведения' })
  deleteVenue(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.directoriesService.deleteVenue(id, userId);
  }
}
