import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './common/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { BuilderModule } from './modules/builder/builder.module';
import { RendererModule } from './modules/renderer/renderer.module';
import { CommerceModule } from './modules/commerce/commerce.module';
import { MediaModule } from './modules/media/media.module';
import { QrModule } from './modules/qr/qr.module';
import { DiscoveryModule } from './modules/discovery/discovery.module';
import { AdminModule } from './modules/admin/admin.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { UsersModule } from './modules/users/users.module';
import { HealthModule } from './modules/health/health.module';
import { IamModule } from './modules/iam/iam.module';
import { BffModule } from './bff/bff.module';
import { PublishingModule } from './modules/publishing/publishing.module';
import { BookingModule } from './modules/booking/booking.module';
import { FormsModule } from './modules/forms/forms.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ThemeModule } from './modules/theme/theme.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { SearchModule } from './modules/search/search.module';
import { AiModule } from './modules/ai/ai.module';
import { PlatformAdminModule } from './modules/platform-admin/platform-admin.module';
import { InfrastructureModule } from './modules/infrastructure/infrastructure.module';
import { SecurityModule } from './modules/security/security.module';
import { DeveloperModule } from './modules/developer/developer.module';
import { MarketplaceModule } from './modules/marketplace/marketplace.module';
import { AssetsEnhancedModule } from './modules/assets-enhanced/assets-enhanced.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { EventBusModule } from './shared/events/event-bus.module';
import { TenantContextModule } from './shared/context/tenant-context.module';
import { RedisModule } from './common/redis/redis.module';
import { QueueModule } from './shared/queue/queue.module';
import { LoggerModule } from './common/logger/logger.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { TenantResolverMiddleware } from './shared/context/tenant-resolver.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: (config.get<number>('THROTTLE_TTL') || 60) * 1000,
            limit: config.get<number>('THROTTLE_LIMIT') || 100,
          },
        ],
      }),
    }),
    // Infrastructure
    PrismaModule,
    RedisModule,
    QueueModule,
    LoggerModule,
    EventBusModule,
    TenantContextModule,
    RbacModule,
    // Modules
    AuthModule,
    UsersModule,
    TenantsModule,
    TemplatesModule,
    BuilderModule,
    RendererModule,
    CommerceModule,
    MediaModule,
    QrModule,
    DiscoveryModule,
    AdminModule,
    NotificationsModule,
    HealthModule,
    IamModule,
    BffModule,
    PublishingModule,
    BookingModule,
    FormsModule,
    PaymentsModule,
    ThemeModule,
    IntegrationsModule,
    AnalyticsModule,
    SearchModule,
    AiModule,
    PlatformAdminModule,
    InfrastructureModule,
    SecurityModule,
    DeveloperModule,
    MarketplaceModule,
    AssetsEnhancedModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationIdMiddleware, TenantResolverMiddleware)
      .forRoutes('*');
  }
}
