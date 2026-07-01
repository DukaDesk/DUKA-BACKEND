import { Injectable, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class PasswordService {
  constructor(private prisma: PrismaService) {}

  async validatePasswordStrength(password: string): Promise<void> {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain an uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain a lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain a number');
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain a special character');
    }

    if (errors.length > 0) {
      throw new BadRequestException(errors.join('; '));
    }
  }

  async checkHistory(userId: string, newPassword: string): Promise<void> {
    const recent = await this.prisma.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    for (const entry of recent) {
      const match = await bcrypt.compare(newPassword, entry.passwordHash);
      if (match) {
        throw new BadRequestException('Cannot reuse a recent password');
      }
    }
  }

  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  async recordHistory(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.passwordHistory.create({
      data: { userId, passwordHash },
    });
  }
}
