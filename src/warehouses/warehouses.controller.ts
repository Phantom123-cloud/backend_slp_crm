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
  @RequireAnyPermission('warehouses.view-all', 'warehouses.view-person', 'warehouses.manage')
  @ApiOperation({ summary: 'Список складов (фильтруется по правам)' })
  findAll(@CurrentUser('id') userId: string) {
    return this.warehousesService.findAll(userId);
  }

  @Get(':id')
  @RequireAnyPermission(
    'warehouses.view-all', 'warehouses.view-person', 'warehouses.manage',
    'trips.admin', 'trips.view-person', 'trips.view-all',
  )
  @ApiOperation({ summary: 'Детальная страница склада' })
  findOne(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.warehousesService.findOne(id, userId);
  }

  @Post()
  @RequireAnyPermission('warehouses.create', 'warehouses.manage')
  @ApiOperation({ summary: 'Создать склад (только CENTRAL/PERSONAL; TRIP создаётся автоматически)' })
  create(@Body() dto: CreateWarehouseDto, @CurrentUser('id') userId: string) {
    return this.warehousesService.create(dto, userId);
  }

  @Patch(':id')
  @RequireAnyPermission('warehouses.manage')
  @ApiOperation({ summary: 'Обновить склад (название, ответственный)' })
  update(@Param('id') id: string, @Body() dto: UpdateWarehouseDto) {
    return this.warehousesService.update(id, dto);
  }

  @Post(':id/deactivate')
  @RequireAnyPermission('warehouses.manage')
  @ApiOperation({ summary: 'Заблокировать склад (только если склад пуст и нет зависших перемещений)' })
  deactivate(@Param('id') id: string) {
    return this.warehousesService.deactivate(id);
  }

  @Post(':id/reactivate')
  @RequireAnyPermission('warehouses.manage')
  @ApiOperation({ summary: 'Разблокировать склад' })
  reactivate(@Param('id') id: string) {
    return this.warehousesService.reactivate(id);
  }

  @Delete(':id')
  @RequireAnyPermission('warehouses.manage')
  @ApiOperation({ summary: 'Удалить склад безвозвратно (только если не было ни одной транзакции)' })
  remove(@Param('id') id: string) {
    return this.warehousesService.remove(id);
  }

  @Get(':id/transactions')
  @RequireAnyPermission(
    'warehouses.view-all', 'warehouses.view-person', 'warehouses.manage',
    'trips.admin', 'trips.view-person', 'trips.view-all',
  )
  @ApiOperation({ summary: 'История транзакций склада' })
  getTransactions(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.warehousesService.getTransactions(id, userId);
  }

  @Post(':id/transactions')
  @RequireAnyPermission(
    'warehouses.manage', 'warehouses.view-person',
    'trips.admin', 'trips.view-person', 'trips.view-all',
  )
  @ApiOperation({ summary: 'Создать транзакцию' })
  createTransaction(
    @Param('id') id: string,
    @Body() dto: CreateTransactionDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.warehousesService.createTransaction(id, dto, userId);
  }

  @Post('transfers/:txId/accept')
  @RequireAnyPermission(
    'warehouses.manage', 'warehouses.view-person',
    'trips.admin', 'trips.view-person', 'trips.view-all',
  )
  @ApiOperation({ summary: 'Принять ожидающий перевод' })
  acceptTransfer(@Param('txId') txId: string, @CurrentUser('id') userId: string) {
    return this.warehousesService.acceptTransfer(txId, userId);
  }

  @Post('transfers/:txId/cancel')
  @RequireAnyPermission(
    'warehouses.manage', 'warehouses.view-person',
    'trips.admin', 'trips.view-person', 'trips.view-all',
  )
  @ApiOperation({ summary: 'Отменить ожидающий перевод' })
  cancelTransfer(@Param('txId') txId: string, @CurrentUser('id') userId: string) {
    return this.warehousesService.cancelTransfer(txId, userId);
  }
}
