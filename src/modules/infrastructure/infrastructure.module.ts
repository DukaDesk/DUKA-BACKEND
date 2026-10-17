import { Module } from '@nestjs/common';
import { InfrastructureController } from './infrastructure.controller';
import { InfrastructureService } from './infrastructure.service';
import { PlatformRoleGuard } from '../admin/platform-role.guard';

@Module({
  controllers: [InfrastructureController],
  providers: [InfrastructureService, PlatformRoleGuard],
  exports: [InfrastructureService],
})
export class InfrastructureModule {}
