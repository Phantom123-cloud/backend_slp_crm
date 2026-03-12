import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
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
  ExportTransactionsDto,
} from './dto/wallets.dto';

@ApiTags('Wallets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('wallets')
export class WalletsController {
  constructor(private walletsService: WalletsService) {}

  // ==================== WALLETS ====================

  @Get()
  @RequireAnyPermission('wallets.view-all', 'wallets.view-person', 'wallets.manage', 'wallets.edit', 'wallets.transaction')
  @ApiOperation({ summary: 'Список кошельков (фильтруется по правам)' })
  findAll(@CurrentUser('id') userId: string) {
    return this.walletsService.findAll(userId);
  }

  @Get(':id')
  @RequireAnyPermission('wallets.view-all', 'wallets.view-person', 'wallets.manage', 'wallets.edit', 'wallets.transaction')
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

  @Get(':id/pending-transfers')
  @RequireAnyPermission('wallets.view-all', 'wallets.view-person', 'wallets.manage', 'wallets.edit', 'wallets.auditor', 'wallets.transaction')
  @ApiOperation({ summary: 'Ожидающие входящие переводы для этого кошелька' })
  getPendingTransfers(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.walletsService.getPendingIncomingTransfers(id, userId);
  }

  @Get(':id/transactions')
  @RequireAnyPermission('wallets.view-all', 'wallets.view-person', 'wallets.manage', 'wallets.edit', 'wallets.auditor', 'wallets.transaction')
  @ApiOperation({ summary: 'История транзакций кошелька' })
  getTransactions(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.walletsService.getTransactions(id, userId);
  }

  @Post(':id/transactions/export')
  @RequireAnyPermission('wallets.view-all', 'wallets.view-person', 'wallets.manage', 'wallets.edit', 'wallets.auditor', 'wallets.transaction')
  @ApiOperation({ summary: 'Экспорт транзакций кошелька в xlsx/csv' })
  async exportTransactions(
    @Param('id') id: string,
    @Body() dto: ExportTransactionsDto,
    @CurrentUser('id') userId: string,
    @Res() res: Response,
  ) {
    const buffer = await this.walletsService.exportTransactions(id, dto, userId);
    const isXlsx = (dto.format || 'xlsx') === 'xlsx';
    const ext = isXlsx ? 'xlsx' : 'csv';
    const mime = isXlsx
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv; charset=utf-8';
    res.set({ 'Content-Type': mime, 'Content-Disposition': `attachment; filename="transactions.${ext}"` });
    res.send(buffer);
  }

  @Post(':id/income')
  @RequireAnyPermission('wallets.view-person', 'wallets.manage', 'wallets.transaction')
  @ApiOperation({ summary: 'Внести приход средств' })
  income(
    @Param('id') id: string,
    @Body() dto: IncomeDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.walletsService.income(id, dto, userId);
  }

  @Post(':id/expense')
  @RequireAnyPermission('wallets.view-person', 'wallets.manage', 'wallets.transaction')
  @ApiOperation({ summary: 'Внести расход средств' })
  expense(
    @Param('id') id: string,
    @Body() dto: IncomeDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.walletsService.expense(id, dto, userId);
  }

  @Post(':id/transfer')
  @RequireAnyPermission('wallets.view-person', 'wallets.manage', 'wallets.transaction')
  @ApiOperation({ summary: 'Перевод между кошельками' })
  transfer(
    @Param('id') id: string,
    @Body() dto: TransferDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.walletsService.transfer(id, dto, userId);
  }

  @Post(':id/conversion')
  @RequireAnyPermission('wallets.view-person', 'wallets.manage', 'wallets.transaction')
  @ApiOperation({ summary: 'Конвертация валюты внутри кошелька' })
  conversion(
    @Param('id') id: string,
    @Body() dto: ConversionDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.walletsService.conversion(id, dto, userId);
  }

  @Patch('transactions/:txId')
  @RequireAnyPermission('wallets.view-person', 'wallets.manage', 'wallets.edit', 'wallets.transaction')
  @ApiOperation({ summary: 'Обновить транзакцию (описание, тип расхода, фото)' })
  updateTransaction(
    @Param('txId') txId: string,
    @Body() dto: UpdateTransactionDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.walletsService.updateTransaction(txId, dto, userId);
  }

  @Post('transactions/:txId/reverse')
  @RequireAnyPermission('wallets.view-person', 'wallets.manage', 'wallets.transaction')
  @ApiOperation({ summary: 'Сторнировать транзакцию' })
  reverseTransaction(@Param('txId') txId: string, @CurrentUser('id') userId: string) {
    return this.walletsService.reverseWalletTransaction(txId, userId);
  }

  @Post('transfers/:transferId/accept')
  @RequireAnyPermission('wallets.view-person', 'wallets.manage', 'wallets.transaction')
  @ApiOperation({ summary: 'Подтвердить входящий перевод' })
  acceptTransfer(@Param('transferId') transferId: string, @CurrentUser('id') userId: string) {
    return this.walletsService.acceptWalletTransfer(transferId, userId);
  }

  @Post('transfers/:transferId/cancel')
  @RequireAnyPermission('wallets.view-person', 'wallets.manage', 'wallets.transaction')
  @ApiOperation({ summary: 'Отменить исходящий перевод' })
  cancelTransfer(@Param('transferId') transferId: string, @CurrentUser('id') userId: string) {
    return this.walletsService.cancelWalletTransfer(transferId, userId);
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
