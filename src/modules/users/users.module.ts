import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { RbacService } from '../rbac/rbac.service';
import { PlatformRoleGuard } from '../admin/platform-role.guard';

@Module({
  controllers: [UsersController],
  providers: [UsersService, RbacService, PlatformRoleGuard],
  exports: [UsersService],
})
export class UsersModule {}