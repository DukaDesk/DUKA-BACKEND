import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class SuperAdminBootstrap implements OnModuleInit {
  private readonly logger = new Logger(SuperAdminBootstrap.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.SUPER_ADMIN_PASSWORD;

    const role = await this.prisma.role.upsert({
      where: { name: 'super_admin' },
      update: {},
      create: { name: 'super_admin', description: 'Full platform access', isSystem: true },
    });

    if (!email || !password) {
      this.logger.warn('Super admin bootstrap skipped: set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD to provision an account');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      throw new Error('SUPER_ADMIN_EMAIL must be a valid email address');
    }
    if (password.length < 16) {
      throw new Error('SUPER_ADMIN_PASSWORD must contain at least 16 characters');
    }

    let user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          passwordHash: await bcrypt.hash(password, 12),
          firstName: 'Super',
          lastName: 'Admin',
          status: 'active',
          emailVerified: true,
        },
      });
    } else if (!user.passwordHash) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await bcrypt.hash(password, 12) },
      });
    }

    const existingRole = await this.prisma.userRole.findFirst({
      where: { userId: user.id, roleId: role.id, tenantId: null },
    });
    if (!existingRole) {
      await this.prisma.userRole.create({
        data: { userId: user.id, roleId: role.id, tenantId: null },
      });
    }

    this.logger.log(`Super admin ensured: ${email}`);
  }
}
