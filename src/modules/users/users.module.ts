import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { ProfileController } from './users.controller';

@Module({
  controllers: [ProfileController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
