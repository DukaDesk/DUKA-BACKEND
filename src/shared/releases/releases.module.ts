import { Module } from '@nestjs/common';
import { ActiveReleaseService } from './active-release.service';

@Module({
  providers: [ActiveReleaseService],
  exports: [ActiveReleaseService],
})
export class ReleasesModule {}
