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
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { TripsService } from './trips.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  CreateTripDto,
  UpdateTripDto,
  UpdateTripStatusDto,
  SetTripCrewDto,
  UpdateCoordinatorDto,
} from './dto/trips.dto';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Trips')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('trips')
export class TripsController {
  constructor(
    private tripsService: TripsService,
    private prisma: PrismaService,
  ) {}

  // Helper to get user permissions
  private async getUserPermissions(userId: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: { permissions: { include: { permission: true } } },
        },
      },
    });
    if (!user?.role) return [];
    return user.role.permissions.map((rp) => rp.permission.slug);
  }

  @Get('available-users')
  @ApiOperation({ summary: 'Список пользователей для выбора в состав' })
  getAvailableUsers() {
    return this.tripsService.getAvailableUsers();
  }

  @Get()
  @ApiOperation({ summary: 'Список поездок' })
  @ApiQuery({
    name: 'filter',
    required: false,
    enum: ['all', 'active', 'closed', 'planned'],
  })
  async findAll(
    @Query('filter') filter: string,
    @CurrentUser('id') userId: string,
  ) {
    const permissions = await this.getUserPermissions(userId);
    return this.tripsService.findAll(filter, userId, permissions);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Детали поездки' })
  findById(@Param('id') id: string) {
    return this.tripsService.findById(id);
  }

  @Post()
  @RequirePermissions('trips.create')
  @ApiOperation({ summary: 'Создать поездку' })
  create(@Body() dto: CreateTripDto, @CurrentUser('id') userId: string) {
    return this.tripsService.create(dto, userId);
  }

  @Patch(':id')
  @RequirePermissions('trips.edit')
  @ApiOperation({ summary: 'Редактировать поездку' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTripDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.tripsService.update(id, dto, userId);
  }

  @Patch(':id/status')
  @RequirePermissions('trips.admin')
  @ApiOperation({ summary: 'Изменить статус поездки' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTripStatusDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.tripsService.updateStatus(id, dto, userId);
  }

  @Delete(':id')
  @RequirePermissions('trips.delete')
  @ApiOperation({ summary: 'Удалить поездку' })
  delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.tripsService.delete(id, userId);
  }

  // === Crew ===

  @Get(':id/crew')
  @ApiOperation({ summary: 'Состав поездки' })
  getCrew(@Param('id') id: string) {
    return this.tripsService.getCrew(id);
  }

  @Patch(':id/crew')
  @RequirePermissions('trips.edit')
  @ApiOperation({ summary: 'Установить состав поездки' })
  setCrew(
    @Param('id') id: string,
    @Body() dto: SetTripCrewDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.tripsService.setCrew(id, dto, userId);
  }

  @Patch(':id/coordinator')
  @RequirePermissions('trips.edit')
  @ApiOperation({ summary: 'Сменить координатора' })
  updateCoordinator(
    @Param('id') id: string,
    @Body() dto: UpdateCoordinatorDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.tripsService.updateCoordinator(id, dto, userId);
  }
}
