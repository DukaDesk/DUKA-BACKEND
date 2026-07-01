import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue('publishing') public readonly publishing: Queue,
    @InjectQueue('notifications') public readonly notifications: Queue,
    @InjectQueue('assets') public readonly assets: Queue,
    @InjectQueue('webhooks') public readonly webhooks: Queue,
    @InjectQueue('analytics') public readonly analytics: Queue,
  ) {}

  async addJob(
    queue: Queue,
    name: string,
    data: any,
    opts?: { delay?: number; priority?: number },
  ): Promise<string> {
    const job = await queue.add(name, data, opts);
    this.logger.debug(`Job added: ${queue.name} → ${name} [${job.id}]`);
    return job.id.toString();
  }
}
