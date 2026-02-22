import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

@ApiTags('Audit Log')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('audit')
export class AuditController {
  constructor(private auditService: AuditService) {}

  @Post('export')
  @RequirePermissions('audit.view')
  @ApiOperation({ summary: 'Экспорт журнала действий' })
  async exportLogs(
    @Body()
    dto: {
      entity?: string;
      entityId?: string;
      userId?: string;
      dateFrom?: string;
      dateTo?: string;
      format?: 'xlsx' | 'csv';
      scope?: 'page' | 'all';
      page?: number;
      limit?: number;
    },
    @Res() res: Response,
  ) {
    const buffer = await this.auditService.exportLogs({
      ...dto,
      dateFrom: dto.dateFrom ? new Date(dto.dateFrom) : undefined,
      dateTo: dto.dateTo ? new Date(dto.dateTo) : undefined,
    });

    const isXlsx = (dto.format || 'xlsx') === 'xlsx';
    const ext = isXlsx ? 'xlsx' : 'csv';
    const mime = isXlsx
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv; charset=utf-8';

    res.set({
      'Content-Type': mime,
      'Content-Disposition': `attachment; filename="audit.${ext}"`,
    });
    res.send(buffer);
  }

  @Get()
  @RequirePermissions('audit.view')
  @ApiOperation({ summary: 'Получить лог действий' })
  @ApiQuery({ name: 'entity', required: false })
  @ApiQuery({ name: 'entityId', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @Query('entity') entity?: string,
    @Query('entityId') entityId?: string,
    @Query('userId') userId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditService.findAll({
      entity,
      entityId,
      userId,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }
}
