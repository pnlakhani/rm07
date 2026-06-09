import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../db/database.module';
import { DrizzleWatchlistsRepository } from './drizzle-repository';
import { WATCHLISTS_REPOSITORY } from './ports';
import { WatchlistsController } from './watchlists.controller';
import { WatchlistsService } from './watchlists.service';

/** Watchlists: multi-list CRUD over core.watchlists / core.watchlist_items. JwtAuthGuard from AuthModule. */
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [WatchlistsController],
  providers: [
    { provide: WATCHLISTS_REPOSITORY, useClass: DrizzleWatchlistsRepository },
    WatchlistsService,
  ],
  exports: [WatchlistsService],
})
export class WatchlistsModule {}
