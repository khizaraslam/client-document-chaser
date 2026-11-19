import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { RecurrencesService } from './recurrences.service';

@Processor('recurrences')
export class RecurrencesProcessor extends WorkerHost {
  private readonly logger = new Logger(RecurrencesProcessor.name);

  constructor(private readonly recurrencesService: RecurrencesService) {
    super();
  }

  async process(job: Job): Promise<{ generated: number }> {
    this.logger.log(`Processing recurrence sweep job ${job.id}`);
    const generated = await this.recurrencesService.processDueRecurrences();
    return { generated };
  }
}
