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
import { WalletsService } from './wallets.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequireAnyPermission } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  CreateWalletDto,
  UpdateWalletDto,
  IncomeDto,
  TransferDto,
  ConversionDto,
  UpdateTransactionDto,
} from './dto/wallets.dto';

@ApiTags('Wallets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('wallets')
export class WalletsController {
  constructor(private walletsService: WalletsService) {}

  // ==================== WALLETS ====================

  @Get()
  @RequireAnyPermission('wallets.view-all', 'wallets.view-person', 'wallets.manage', 'wallets.edit')
  @ApiOperation({ summary: 'Список кошельков (фильтруется по правам)' })
  findAll(@CurrentUser('id') userId: string) {
    return this.walletsService.findAll(userId);
  }

  @Get(':id')
  @RequireAnyPermission('wallets.view-all', 'wallets.view-person', 'wallets.manage', 'wallets.edit')
  @ApiOperation({ summary: 'Детальная страница кошелька' })
  findOne(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.walletsService.findOne(id, userId);
  }

  @Post()
  @RequireAnyPermission('wallets.create', 'wallets.manage')
  @ApiOperation({ summary: 'Создать личный кошелёк' })
  create(@Body() dto: CreateWalletDto, @CurrentUser('id') userId: string) {
    return this.walletsService.create(dto, userId);
  }

  @Patch(':id')
  @RequireAnyPermission('wallets.edit', 'wallets.manage')
  @ApiOperation({ summary: 'Обновить кошелёк (название, ответственный)' })
  update(@Param('id') id: string, @Body() dto: UpdateWalletDto) {
    return this.walletsService.update(id, dto);
  }

  @Post(':id/block')
  @RequireAnyPermission('wallets.manage')
  @ApiOperation({ summary: 'Заблокировать личный кошелёк (только если пуст)' })
  block(@Param('id') id: string) {
    return this.walletsService.block(id);
  }

  @Post(':id/unblock')
  @RequireAnyPermission('wallets.manage')
  @ApiOperation({ summary: 'Разблокировать кошелёк' })
  unblock(@Param('id') id: string) {
    return this.walletsService.unblock(id);
  }

  @Delete(':id')
  @RequireAnyPermission('wallets.manage')
  @ApiOperation({ summary: 'Удалить личный кошелёк (только без транзакций)' })
  remove(@Param('id') id: string) {
    return this.walletsService.remove(id);
  }

  // ==================== TRANSACTIONS ====================

  @Get(':id/transactions')
  @RequireAnyPermission('wallets.view-all', 'wallets.view-person', 'wallets.manage', 'wallets.edit', 'wallets.auditor')
  @ApiOperation({ summary: 'История транзакций кошелька' })
  getTransactions(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.walletsService.getTransactions(id, userId);
  }

  @Post(':id/income')
  @RequireAnyPermission('wallets.view-person', 'wallets.manage', 'wallets.edit')
  @ApiOperation({ summary: 'Внести приход средств' })
  income(
    @Param('id') id: string,
    @Body() dto: IncomeDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.walletsService.income(id, dto, userId);
  }

  @Post(':id/expense')
  @RequireAnyPermission('wallets.view-person', 'wallets.manage', 'wallets.edit')
  @ApiOperation({ summary: 'Внести расход средств' })
  expense(
    @Param('id') id: string,
    @Body() dto: IncomeDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.walletsService.expense(id, dto, userId);
  }

  @Post(':id/transfer')
  @RequireAnyPermission('wallets.view-person', 'wallets.manage', 'wallets.edit')
  @ApiOperation({ summary: 'Перевод между кошельками' })
  transfer(
    @Param('id') id: string,
    @Body() dto: TransferDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.walletsService.transfer(id, dto, userId);
  }

  @Post(':id/conversion')
  @RequireAnyPermission('wallets.view-person', 'wallets.manage', 'wallets.edit')
  @ApiOperation({ summary: 'Конвертация валюты внутри кошелька' })
  conversion(
    @Param('id') id: string,
    @Body() dto: ConversionDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.walletsService.conversion(id, dto, userId);
  }

  @Patch('transactions/:txId')
  @RequireAnyPermission('wallets.view-person', 'wallets.manage', 'wallets.edit')
  @ApiOperation({ summary: 'Обновить транзакцию (описание, тип расхода, фото)' })
  updateTransaction(
    @Param('txId') txId: string,
    @Body() dto: UpdateTransactionDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.walletsService.updateTransaction(txId, dto, userId);
  }

  @Post('transactions/:txId/close')
  @RequireAnyPermission('wallets.auditor', 'wallets.manage')
  @ApiOperation({ summary: 'Закрыть транзакцию (только аудитор)' })
  closeTransaction(@Param('txId') txId: string, @CurrentUser('id') userId: string) {
    return this.walletsService.closeTransaction(txId, userId);
  }

  @Post('transactions/:txId/reopen')
  @RequireAnyPermission('wallets.auditor', 'wallets.manage')
  @ApiOperation({ summary: 'Открыть (снять закрытие) транзакцию (только аудитор)' })
  reopenTransaction(@Param('txId') txId: string) {
    return this.walletsService.reopenTransaction(txId);
  }
}
