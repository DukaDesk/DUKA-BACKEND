import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class SuperAdminBootstrap implements OnModuleInit {
  private readonly logger = new Logger(SuperAdminBootstrap.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const email = process.env.SUPER_ADMIN_EMAIL || 'superadmin@duka.dev';
    const password = process.env.SUPER_ADMIN_PASSWORD || 'admin123';

    const role = await this.prisma.role.upsert({
      where: { name: 'super_admin' },
      update: {},
      create: { name: 'super_admin', description: 'Full platform access', isSystem: true },
    });

    const hash = await bcrypt.hash(password, 12);
    const user = await this.prisma.user.upsert({
      where: { email },
      update: { passwordHash: hash },
      create: {
        email,
        passwordHash: hash,
        firstName: 'Super',
        lastName: 'Admin',
        status: 'active',
        emailVerified: true,
      },
    });

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
