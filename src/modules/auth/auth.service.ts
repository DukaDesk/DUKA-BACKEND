import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import * as appleSignin from 'apple-signin-auth';
import { PrismaService } from '../../common/prisma.service';
import { PasswordService } from '../iam/password.service';
import { RedisService } from '../../common/redis/redis.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { GoogleLoginDto, AppleLoginDto } from './dto/social-login.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private passwordService: PasswordService,
    private redis: RedisService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    await this.passwordService.validatePasswordStrength(dto.password);
    const passwordHash = await this.passwordService.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        phoneNumber: dto.phoneNumber,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        createdAt: true,
      },
    });

    await this.passwordService.recordHistory(user.id, passwordHash);

    const tokens = await this.generateTokens(user.id, user.email);

    return { user, ...tokens };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.generateTokens(user.id, user.email);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status,
      },
      ...tokens,
    };
  }

  async refresh(dto: RefreshDto) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: dto.refreshToken },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true, status: true } } },
    });

    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true },
    });

    const tokens = await this.generateTokens(stored.user.id, stored.user.email);

    return { user: stored.user, ...tokens };
  }

  async logout(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
    return { message: 'Logged out successfully' };
  }

  async sendOtp(email: string) {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await this.redis.set(`otp:${email}`, otp, 300);
    console.log(`OTP for ${email}: ${otp}`);
    return { message: 'OTP sent successfully' };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const storedOtp = await this.redis.get(`otp:${dto.email}`);
    if (!storedOtp) {
      throw new BadRequestException('No OTP found or OTP expired');
    }
    if (storedOtp !== dto.otp) {
      throw new BadRequestException('Invalid OTP');
    }

    await this.redis.del(`otp:${dto.email}`);

    await this.prisma.user.update({
      where: { email: dto.email },
      data: { emailVerified: true },
    });

    return { message: 'Email verified successfully' };
  }

  async googleLogin(dto: GoogleLoginDto) {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) throw new BadRequestException('Google auth not configured');

    const client = new OAuth2Client(clientId);
    let payload: any;
    try {
      const ticket = await client.verifyIdToken({ idToken: dto.idToken, audience: clientId });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Invalid Google ID token');
    }

    if (!payload.email) {
      throw new BadRequestException('Google account has no email');
    }

    const googleId = payload.sub;
    const email = payload.email;
    const firstName = dto.firstName || payload.given_name || payload.name?.split(' ')[0] || '';
    const lastName = dto.lastName || payload.family_name || '';

    let user = await this.prisma.user.findFirst({
      where: { OR: [{ googleId }, { email }] },
    });

    if (user) {
      if (!user.googleId) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { googleId, emailVerified: true },
        });
      }
    } else {
      user = await this.prisma.user.create({
        data: {
          email,
          googleId,
          emailVerified: true,
          firstName,
          lastName,
        },
      });
    }

    const tokens = await this.generateTokens(user.id, user.email);
    return {
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, status: user.status },
      ...tokens,
    };
  }

  async appleLogin(dto: AppleLoginDto) {
    const clientId = this.configService.get<string>('APPLE_CLIENT_ID');
    if (!clientId) throw new BadRequestException('Apple auth not configured');

    let jwtClaims: any;
    try {
      jwtClaims = await appleSignin.verifyIdToken(dto.identityToken, {
        audience: clientId,
        ignoreExpiration: false,
      });
    } catch {
      throw new UnauthorizedException('Invalid Apple identity token');
    }

    const appleId = jwtClaims.sub;
    const email = dto.email || jwtClaims.email;
    if (!email) {
      throw new BadRequestException('Apple account has no email — provide email in request');
    }

    const firstName = dto.firstName || '';
    const lastName = dto.lastName || '';

    let user = await this.prisma.user.findFirst({
      where: { OR: [{ appleId }, { email }] },
    });

    if (user) {
      if (!user.appleId) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { appleId, emailVerified: true },
        });
      }
    } else {
      user = await this.prisma.user.create({
        data: {
          email,
          appleId,
          emailVerified: true,
          firstName,
          lastName,
        },
      });
    }

    const tokens = await this.generateTokens(user.id, user.email);
    return {
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, status: user.status },
      ...tokens,
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!user) throw new UnauthorizedException('User not found');
    const { passwordHash, googleId, appleId, ...rest } = user;
    return rest;
  }

  private async generateTokens(userId: string, email: string) {
    const payload = { sub: userId, email };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: (this.configService.get<string>('JWT_EXPIRATION') || '15m') as any,
    });

    const refreshTokenValue = randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        token: refreshTokenValue,
        expiresAt,
      },
    });

    return { accessToken, refreshToken: refreshTokenValue };
  }
}
