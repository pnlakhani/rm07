import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BrokersController } from './brokers.controller';
import type { AccountKeysService } from './account-keys.service';
import type { BrokerConnectionService } from './broker-connection.service';
import type { AuthContext } from '../auth/request-context';

const account: AuthContext = { accountId: 7n };

function make() {
  const accountKeys = { getPublicKey: vi.fn().mockResolvedValue('PUBKEY') } as unknown as AccountKeysService;
  const connections = {
    connect: vi.fn().mockResolvedValue({ id: '1', broker: 'dhan', clientId: 'C', status: 'active' }),
    list: vi.fn().mockResolvedValue([{ id: '1', broker: 'dhan', clientId: 'C', status: 'active' }]),
    disconnect: vi.fn().mockResolvedValue(undefined),
  } as unknown as BrokerConnectionService;
  return { controller: new BrokersController(accountKeys, connections), accountKeys, connections };
}

describe('BrokersController', () => {
  it('returns the account ECIES public key', async () => {
    const { controller, accountKeys } = make();
    expect(await controller.connectKey(account)).toEqual({ publicKey: 'PUBKEY' });
    expect(accountKeys.getPublicKey).toHaveBeenCalledWith(7n);
  });

  it('connects a broker', async () => {
    const { controller, connections } = make();
    const payload = { epk: 'e', salt: 's', iv: 'i', tag: 't', ct: 'c' };
    const out = await controller.connect({ broker: 'dhan', payload }, account);
    expect(out).toMatchObject({ broker: 'dhan', status: 'active' });
    expect(connections.connect).toHaveBeenCalledWith(7n, 'dhan', payload);
  });

  it('lists connections', async () => {
    const { controller } = make();
    expect((await controller.list(account)).length).toBe(1);
  });

  it('disconnects by numeric id', async () => {
    const { controller, connections } = make();
    await controller.disconnect('1', account);
    expect(connections.disconnect).toHaveBeenCalledWith(7n, 1n);
  });

  it('rejects a non-numeric id', async () => {
    const { controller } = make();
    await expect(controller.disconnect('abc', account)).rejects.toBeInstanceOf(BadRequestException);
  });
});
