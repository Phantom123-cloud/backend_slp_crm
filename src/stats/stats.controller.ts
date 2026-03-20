import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StatsService } from './stats.service';

@Controller('stats')
@UseGuards(JwtAuthGuard)
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  /**
   * GET /stats/presentations
   * Возвращает статистику презентаций за указанный период.
   * Параметры:
   *   from     — дата начала (YYYY-MM-DD), обязательный
   *   to       — дата конца (YYYY-MM-DD), обязательный
   *   groupBy  — способ группировки: day | week | month | year | trip
   *   tab      — вкладка: dates | leaders | coordinators | individual
   */
  @Get('presentations')
  async getPresentationStats(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('groupBy') groupBy: string = 'month',
    @Query('tab') tab: string = 'dates',
  ) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    // Устанавливаем конец дня для toDate, чтобы включить все презентации за последний день
    toDate.setHours(23, 59, 59, 999);

    return this.statsService.getPresentationStats(fromDate, toDate, groupBy, tab);
  }
}
