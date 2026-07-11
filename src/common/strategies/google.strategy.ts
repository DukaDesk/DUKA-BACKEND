import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger: Logger;
  private readonly isEnabled: boolean;

  constructor(configService: ConfigService) {
    const clientID = configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = configService.get<string>('GOOGLE_CLIENT_SECRET');
    const isActive = !!(clientID && clientSecret);

    super(isActive ? {
      clientID,
      clientSecret,
      callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL') || 'http://localhost:4000/api/v1/auth/google/callback',
      scope: ['email', 'profile'],
    } : {
      clientID: 'disabled',
      clientSecret: 'disabled',
      callbackURL: '',
      scope: ['email', 'profile'],
    });

    this.isEnabled = isActive;
    this.logger = new Logger(GoogleStrategy.name);
    if (!isActive) {
      this.logger.warn('Google OAuth disabled — missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
    }
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    if (!this.isEnabled) {
      return done(new UnauthorizedException('Google OAuth is not configured'), false);
    }

    const { id, emails, name, photos } = profile;
    const email = emails?.[0]?.value;
    if (!email) {
      return done(new UnauthorizedException('Google account has no email'), false);
    }

    const user = {
      googleId: id,
      email,
      firstName: name?.givenName || profile.displayName?.split(' ')[0] || '',
      lastName: name?.familyName || '',
      avatar: photos?.[0]?.value || null,
      accessToken,
    };

    done(null, user);
  }
}
