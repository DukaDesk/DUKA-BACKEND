import { Module } from '@nestjs/common';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAdminService } from './platform-admin.service';
import { PlatformRoleGuard } from '../admin/platform-role.guard';

@Module({
  controllers: [PlatformAdminController],
  providers: [PlatformAdminService, PlatformRoleGuard],
  exports: [PlatformAdminService],
})
export class PlatformAdminModule {}
