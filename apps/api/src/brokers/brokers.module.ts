import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../db/database.module';
import { SecurityModule } from '../security/security.module';
import { AccountKeysService } from './account-keys.service';
import { BrokerAdaptersRegistrar } from './broker-adapters.registrar';
import { BrokerConnectionService } from './broker-connection.service';
import { BrokersController } from './brokers.controller';
import {
  DrizzleAccountKeysRepository,
  DrizzleBrokerConnectionsRepository,
} from './drizzle-repositories';
import { ACCOUNT_KEYS_REPOSITORY, BROKER_CONNECTIONS_REPOSITORY } from './ports';

/**
 * Broker-connection module: the Connect-Broker flow + per-account ECIES keypair. Concrete broker
 * adapters (Dhan, Zerodha, …) self-register into the @rm07/broker-adapters registry and are
 * resolved at connect time (Part 2).
 */
@Module({
  imports: [SecurityModule, DatabaseModule, AuthModule],
  controllers: [BrokersController],
  providers: [
    { provide: ACCOUNT_KEYS_REPOSITORY, useClass: DrizzleAccountKeysRepository },
    { provide: BROKER_CONNECTIONS_REPOSITORY, useClass: DrizzleBrokerConnectionsRepository },
    AccountKeysService,
    BrokerConnectionService,
    BrokerAdaptersRegistrar,
  ],
  exports: [BrokerConnectionService],
})
export class BrokersModule {}
