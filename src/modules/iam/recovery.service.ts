import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { PasswordService } from './password.service';
import { RedisService } from '../../common/redis/redis.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class RecoveryService {
  private readonly logger = new Logger(RecoveryService.name);

  constructor(
    private prisma: PrismaService,
    private passwordService: PasswordService,
    private redis: RedisService,
  ) {}

  async requestReset(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      return { message: 'If the email exists, a reset link has been sent' };
    }

    const token = uuidv4();
    await this.redis.set(`password_reset:${token}`, user.id, 3600);
    this.logger.log(`Password reset token for ${email}: ${token}`);

    return { message: 'If the email exists, a reset link has been sent' };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const userId = await this.redis.get(`password_reset:${token}`);
    if (!userId) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    await this.passwordService.validatePasswordStrength(newPassword);
    await this.passwordService.checkHistory(userId, newPassword);

    const passwordHash = await this.passwordService.hash(newPassword);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    await this.passwordService.recordHistory(userId, passwordHash);

    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });

    await this.redis.del(`password_reset:${token}`);

    return { message: 'Password reset successfully' };
  }
}
