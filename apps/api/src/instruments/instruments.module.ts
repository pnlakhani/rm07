import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../db/database.module';
import { DrizzleBrokerInstrumentsRepository } from './drizzle-repository';
import { InstrumentImportService } from './instrument-import.service';
import { InstrumentResolverService } from './instrument-resolver.service';
import { InstrumentsController } from './instruments.controller';
import { BROKER_INSTRUMENTS_REPOSITORY } from './ports';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [InstrumentsController],
  providers: [
    { provide: BROKER_INSTRUMENTS_REPOSITORY, useClass: DrizzleBrokerInstrumentsRepository },
    InstrumentResolverService,
    InstrumentImportService,
  ],
  exports: [InstrumentResolverService, InstrumentImportService],
})
export class InstrumentsModule {}
