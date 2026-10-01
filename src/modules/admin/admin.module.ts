import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminInviteService } from './admin-invite.service';
import { UsersModule } from '../users/users.module';
import { PublishingModule } from '../publishing/publishing.module';
import { BuilderModule } from '../builder/builder.module';

@Module({
  imports: [UsersModule, PublishingModule, BuilderModule],
  controllers: [AdminController],
  providers: [AdminService, AdminInviteService],
})
export class AdminModule {}