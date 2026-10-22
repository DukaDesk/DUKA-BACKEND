import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminMessagingController } from './admin-messaging.controller';
import { AdminService } from './admin.service';
import { AdminInviteService } from './admin-invite.service';
import { CommsModule } from '../comms/comms.module';
import { UsersModule } from '../users/users.module';
import { PublishingModule } from '../publishing/publishing.module';
import { BuilderModule } from '../builder/builder.module';
import { MediaModule } from '../media/media.module';
import { MerchantAppReviewService } from './merchant-app-review.service';
import { PlatformRoleGuard } from './platform-role.guard';
import { ReleasesModule } from '../../shared/releases/releases.module';

@Module({
  imports: [UsersModule, PublishingModule, BuilderModule, MediaModule, ReleasesModule, CommsModule],
  controllers: [AdminController, AdminMessagingController],
  providers: [AdminService, AdminInviteService, MerchantAppReviewService, PlatformRoleGuard],
})
export class AdminModule {}
