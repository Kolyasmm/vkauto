import { Module } from '@nestjs/common';
import { LeadsTechService } from './leadstech.service';

@Module({
  providers: [LeadsTechService],
  exports: [LeadsTechService],
})
export class LeadsTechModule {}
