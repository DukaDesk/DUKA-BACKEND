import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { RbacService } from '../rbac/rbac.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';

@Module({
  controllers: [UsersController],
  providers: [UsersService, RbacService],
  exports: [UsersService],
})
export class UsersModule {}