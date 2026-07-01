import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service';

@Injectable()
export class GatewayRateLimiter {
  private readonly logger = new Logger(GatewayRateLimiter.name);

  constructor(private redis: RedisService) {}

  async checkRateLimit(key: string, maxRequests: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
    const redisKey = `ratelimit:${key}`;
    const current = await this.redis.get(redisKey);
    const count = current ? parseInt(current, 10) : 0;
    const resetAt = Math.floor(Date.now() / 1000) + windowSeconds;

    if (count >= maxRequests) {
      return { allowed: false, remaining: 0, resetAt };
    }

    await this.redis.set(redisKey, (count + 1).toString(), windowSeconds);
    return { allowed: true, remaining: maxRequests - count - 1, resetAt };
  }
}
