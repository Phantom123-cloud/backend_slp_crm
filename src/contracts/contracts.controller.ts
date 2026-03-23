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
import { ContractsService } from './contracts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequireAnyPermission } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateContractDto, UpdateContractDto, RefundContractDto } from './dto/contracts.dto';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Contracts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('contracts')
export class ContractsController {
  constructor(
    private readonly contractsService: ContractsService,
    private readonly prisma: PrismaService,
  ) {}

  // Получить права юзера
  private async getUserPermissions(userId: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });
    return user?.role?.permissions.map((rp) => rp.permission.slug) ?? [];
  }

  @Get()
  @RequireAnyPermission('contracts.view-all', 'contracts.view-person')
  @ApiOperation({ summary: 'Список договоров' })
  async findAll(
    @CurrentUser('id') userId: string,
    @Query('tripId') tripId?: string,
  ) {
    const permissions = await this.getUserPermissions(userId);
    return this.contractsService.findAll(userId, permissions, tripId);
  }

  @Get(':id')
  @RequireAnyPermission('contracts.view-all', 'contracts.view-person')
  @ApiOperation({ summary: 'Получить договор' })
  findOne(@Param('id') id: string) {
    return this.contractsService.findOne(id);
  }

  @Post()
  @RequireAnyPermission('contracts.create')
  @ApiOperation({ summary: 'Создать договор' })
  create(
    @Body() dto: CreateContractDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.contractsService.create(dto, userId);
  }

  @Patch(':id')
  @RequireAnyPermission('contracts.edit')
  @ApiOperation({ summary: 'Обновить договор' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateContractDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.contractsService.update(id, dto, userId);
  }

  @Patch(':id/refund')
  @RequireAnyPermission('contracts.edit')
  @ApiOperation({ summary: 'Оформить возврат по договору' })
  refund(
    @Param('id') id: string,
    @Body() dto: RefundContractDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.contractsService.refund(id, dto, userId);
  }

  @Patch(':id/financials')
  @RequireAnyPermission('contracts.edit')
  @ApiOperation({ summary: 'Редактировать финансы договора (→ частичный возврат)' })
  updateFinancials(
    @Param('id') id: string,
    @Body() dto: UpdateContractDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.contractsService.updateFinancials(id, dto, userId);
  }

  @Patch(':id/status')
  @RequireAnyPermission('contracts.verify')
  @ApiOperation({ summary: 'Сменить статус договора' })
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string },
    @CurrentUser('id') userId: string,
  ) {
    return this.contractsService.updateStatus(id, body.status, userId);
  }

  @Patch('schedule/:scheduleItemId/pay')
  @RequireAnyPermission('contracts.edit')
  @ApiOperation({ summary: 'Подтвердить платёж по графику рассрочки' })
  payScheduleItem(
    @Param('scheduleItemId') scheduleItemId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.contractsService.payScheduleItem(scheduleItemId, userId);
  }

  @Delete(':id')
  @RequireAnyPermission('contracts.delete')
  @ApiOperation({ summary: 'Удалить договор' })
  delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.contractsService.delete(id, userId);
  }
}
