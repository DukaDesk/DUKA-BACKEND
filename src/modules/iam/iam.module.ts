import { Global, Module } from '@nestjs/common';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { PasswordService } from './password.service';
import { RecoveryController } from './recovery.controller';
import { RecoveryService } from './recovery.service';

@Global()
@Module({
  controllers: [DevicesController, RecoveryController],
  providers: [DevicesService, PasswordService, RecoveryService],
  exports: [DevicesService, PasswordService, RecoveryService],
})
export class IamModule {}
