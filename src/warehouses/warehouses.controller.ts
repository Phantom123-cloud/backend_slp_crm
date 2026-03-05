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
import { WarehousesService } from './warehouses.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequireAnyPermission } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  CreateWarehouseDto,
  UpdateWarehouseDto,
  CreateTransactionDto,
} from './dto/warehouses.dto';

@ApiTags('Warehouses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('warehouses')
export class WarehousesController {
  constructor(private warehousesService: WarehousesService) {}

  @Get()
  @RequireAnyPermission('warehouses.view', 'warehouses.create', 'warehouses.manage', 'trips.admin', 'trips.view-person')
  @ApiOperation({ summary: 'Список складов (фильтруется по правам)' })
  findAll(@CurrentUser('id') userId: string) {
    return this.warehousesService.findAll(userId);
  }

  @Get(':id')
  @RequireAnyPermission('warehouses.view', 'warehouses.create', 'warehouses.manage', 'trips.admin', 'trips.view-person')
  @ApiOperation({ summary: 'Детальная страница склада' })
  findOne(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.warehousesService.findOne(id, userId);
  }

  @Post()
  @RequireAnyPermission('warehouses.create', 'warehouses.manage')
  @ApiOperation({ summary: 'Создать склад (CENTRAL/PERSONAL)' })
  create(@Body() dto: CreateWarehouseDto, @CurrentUser('id') userId: string) {
    return this.warehousesService.create(dto, userId);
  }

  @Patch(':id')
  @RequireAnyPermission('warehouses.manage')
  @ApiOperation({ summary: 'Обновить склад' })
  update(@Param('id') id: string, @Body() dto: UpdateWarehouseDto) {
    return this.warehousesService.update(id, dto);
  }

  @Delete(':id')
  @RequireAnyPermission('warehouses.manage')
  @ApiOperation({ summary: 'Деактивировать склад' })
  remove(@Param('id') id: string) {
    return this.warehousesService.remove(id);
  }

  @Get(':id/transactions')
  @RequireAnyPermission('warehouses.view', 'warehouses.create', 'warehouses.manage', 'trips.admin', 'trips.view-person')
  @ApiOperation({ summary: 'История транзакций склада' })
  getTransactions(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.warehousesService.getTransactions(id, userId);
  }

  @Post(':id/transactions')
  @RequireAnyPermission('warehouses.manage', 'trips.admin', 'trips.view-person')
  @ApiOperation({ summary: 'Создать транзакцию' })
  createTransaction(
    @Param('id') id: string,
    @Body() dto: CreateTransactionDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.warehousesService.createTransaction(id, dto, userId);
  }
}
