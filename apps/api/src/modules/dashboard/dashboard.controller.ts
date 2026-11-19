import { DashboardSummaryResponse } from '@cdc/contracts';
import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator';
import { AuthenticatedContext } from '../../common/types/auth-context.type';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  async getSummary(
    @CurrentAuth() auth: AuthenticatedContext,
  ): Promise<DashboardSummaryResponse> {
    return this.dashboardService.getSummary(auth);
  }
}
