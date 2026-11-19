import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/auth.decorators';
import { PlansService } from './plans.service';

@ApiTags('Plans')
@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Public()
  @Get()
  async list() {
    return this.plansService.listPlans();
  }
}
