import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-apple';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppleStrategy extends PassportStrategy(Strategy, 'apple') {
  private readonly logger: Logger;
  private readonly isEnabled: boolean;

  constructor(configService: ConfigService) {
    const clientID = configService.get<string>('APPLE_CLIENT_ID');
    const teamID = configService.get<string>('APPLE_TEAM_ID');
    const keyID = configService.get<string>('APPLE_KEY_ID');
    const isActive = !!(clientID && teamID && keyID);

    super(isActive ? {
      clientID,
      teamID,
      keyID,
      privateKeyLocation: configService.get<string>('APPLE_PRIVATE_KEY_PATH') || '',
      callbackURL: configService.get<string>('APPLE_CALLBACK_URL') || 'http://localhost:4000/api/v1/auth/apple/callback',
      scope: ['name', 'email'],
    } : {
      clientID: 'disabled',
      teamID: 'disabled',
      keyID: 'disabled',
      privateKeyLocation: '',
      callbackURL: '',
      scope: ['name', 'email'],
    });

    this.isEnabled = isActive;
    this.logger = new Logger(AppleStrategy.name);
    if (!isActive) {
      this.logger.warn('Apple Sign-In disabled — missing APPLE_CLIENT_ID, APPLE_TEAM_ID, or APPLE_KEY_ID');
    }
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    idToken: string,
    profile: any,
    done: (err: any, user?: any) => void,
  ): Promise<any> {
    if (!this.isEnabled) {
      return done(new UnauthorizedException('Apple Sign-In is not configured'), false);
    }

    const { id, email, name } = profile;
    if (!email) {
      return done(new UnauthorizedException('Apple account has no email'), false);
    }

    const user = {
      appleId: id,
      email,
      firstName: name?.firstName || '',
      lastName: name?.lastName || '',
      accessToken,
      refreshToken,
    };

    done(null, user);
  }
}
