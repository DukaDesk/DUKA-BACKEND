import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;
  private isMock = false;
  private mockStore = new Map<string, { value: string; expiresAt: number }>();

  constructor(private configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = this.configService.get<number>('REDIS_PORT', 6379);

    const isLocal = !redisUrl && host === 'localhost' && port === 6379;

    if (isLocal) {
      this.isMock = true;
      this.logger.warn('Using in-memory mock Redis (no Redis server detected)');
    } else {
      this.client = redisUrl
        ? new Redis(redisUrl, { lazyConnect: true })
        : new Redis({ host, port, lazyConnect: true });
      this.client.connect().catch((err) => {
        this.logger.warn(`Redis connection failed, using mock: ${err.message}`);
        this.isMock = true;
      });
    }
  }

  async get(key: string): Promise<string | null> {
    if (this.isMock) {
      const entry = this.mockStore.get(key);
      if (!entry) return null;
      if (entry.expiresAt < Date.now()) {
        this.mockStore.delete(key);
        return null;
      }
      return entry.value;
    }
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.isMock) {
      this.mockStore.set(key, {
        value,
        expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : Infinity,
      });
      return;
    }
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    if (this.isMock) {
      this.mockStore.delete(key);
      return;
    }
    await this.client.del(key);
  }

  async publish(channel: string, message: string): Promise<void> {
    if (this.isMock) return;
    await this.client.publish(channel, message);
  }

  async onModuleDestroy() {
    if (!this.isMock) {
      await this.client.quit();
    }
  }
}
