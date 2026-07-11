import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QueueService } from './queue.service';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL');
        const connOpts = {
          maxRetriesPerRequest: 3,
          retryStrategy: (times: number) => {
            if (times > 3) return null;
            return Math.min(times * 200, 1000);
          },
          enableOfflineQueue: false,
        };
        const redisConfig = redisUrl
          ? { url: redisUrl, ...connOpts }
          : { host: config.get<string>('REDIS_HOST', 'localhost'), port: config.get<number>('REDIS_PORT', 6379), ...connOpts };
        return {
          redis: redisConfig,
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: 100,
            removeOnFail: 50,
          },
        };
      },
    }),
    BullModule.registerQueue(
      { name: 'publishing' },
      { name: 'notifications' },
      { name: 'assets' },
      { name: 'webhooks' },
      { name: 'analytics' },
    ),
  ],
  providers: [QueueService],
  exports: [QueueService, BullModule],
})
export class QueueModule {}
