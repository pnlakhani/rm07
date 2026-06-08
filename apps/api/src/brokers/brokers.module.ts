import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../db/database.module';
import { InstrumentsModule } from '../instruments/instruments.module';
import { SecurityModule } from '../security/security.module';
import { AccountKeysService } from './account-keys.service';
import { BrokerAdaptersRegistrar } from './broker-adapters.registrar';
import { BrokerConnectionService } from './broker-connection.service';
import { BrokersController } from './brokers.controller';
import {
  DrizzleAccountKeysRepository,
  DrizzleBrokerConnectionsRepository,
  DrizzleOrdersRepository,
} from './drizzle-repositories';
import {
  ACCOUNT_KEYS_REPOSITORY,
  BROKER_CONNECTIONS_REPOSITORY,
  ORDERS_REPOSITORY,
} from './ports';

/**
 * Broker-connection module: the Connect-Broker flow + per-account ECIES keypair. Concrete broker
 * adapters (Dhan, Zerodha, …) self-register into the @rm07/broker-adapters registry and are
 * resolved at connect time (Part 2).
 */
@Module({
  imports: [SecurityModule, DatabaseModule, AuthModule, InstrumentsModule],
  controllers: [BrokersController],
  providers: [
    { provide: ACCOUNT_KEYS_REPOSITORY, useClass: DrizzleAccountKeysRepository },
    { provide: BROKER_CONNECTIONS_REPOSITORY, useClass: DrizzleBrokerConnectionsRepository },
    { provide: ORDERS_REPOSITORY, useClass: DrizzleOrdersRepository },
    AccountKeysService,
    BrokerConnectionService,
    BrokerAdaptersRegistrar,
  ],
  exports: [BrokerConnectionService],
})
export class BrokersModule {}
