import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from '../../common/strategies/jwt.strategy';
import { GoogleStrategy } from '../../common/strategies/google.strategy';
import { AppleStrategy } from '../../common/strategies/apple.strategy';
import { NotificationsModule } from '../notifications/notifications.module';
import { MerchantsModule } from '../merchants/merchants.module';
import { AdminInviteService } from '../admin/admin-invite.service';

@Module({
  imports: [
    NotificationsModule,
    MerchantsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'super-secret',
        signOptions: { expiresIn: (config.get<string>('JWT_EXPIRATION') || '15m') as any },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AdminInviteService, JwtStrategy, GoogleStrategy, AppleStrategy],
  exports: [AuthService, AdminInviteService, JwtModule, JwtStrategy],
})
export class AuthModule {}
