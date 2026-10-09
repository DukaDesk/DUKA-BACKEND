import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminInviteService } from './admin-invite.service';
import { UsersModule } from '../users/users.module';
import { ReleasesModule } from '../../shared/releases/releases.module';

@Module({
  imports: [UsersModule, ReleasesModule],
  controllers: [AdminController],
  providers: [AdminService, AdminInviteService],
})
export class AdminModule {}