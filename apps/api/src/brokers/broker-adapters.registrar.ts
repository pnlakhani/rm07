import { Injectable, type OnModuleInit } from '@nestjs/common';
import { registerDhanAdapter } from '@rm07/broker-adapters';

/** Registers the concrete broker adapters into the registry at API startup. */
@Injectable()
export class BrokerAdaptersRegistrar implements OnModuleInit {
  onModuleInit(): void {
    registerDhanAdapter();
  }
}
