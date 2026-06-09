import { describe, expect, it, vi } from 'vitest';
import { InstrumentResolverService } from './instrument-resolver.service';
import type { BrokerInstrumentsRepository } from './ports';

describe('InstrumentResolverService', () => {
  it('delegates resolution to the repository', async () => {
    const repo = {
      resolve: vi.fn().mockResolvedValue('2885'),
      upsertMany: vi.fn(),
    } as unknown as BrokerInstrumentsRepository;
    const svc = new InstrumentResolverService(repo);
    expect(await svc.resolveSecurityId('dhan', 'NSE', 'RELIANCE')).toBe('2885');
    expect(repo.resolve).toHaveBeenCalledWith('dhan', 'NSE', 'RELIANCE');
  });

  it('returns null when not found', async () => {
    const repo = { resolve: vi.fn().mockResolvedValue(null), upsertMany: vi.fn() } as unknown as BrokerInstrumentsRepository;
    expect(await new InstrumentResolverService(repo).resolveSecurityId('dhan', 'NSE', 'NOPE')).toBeNull();
  });

  it('searches via the repository (trimmed, uppercased, dhan, limit 20)', async () => {
    const repo = {
      resolve: vi.fn(),
      upsertMany: vi.fn(),
      search: vi
        .fn()
        .mockResolvedValue([{ exchange: 'NSE', tradingSymbol: 'RELIANCE', symbolName: 'Reliance' }]),
    } as unknown as BrokerInstrumentsRepository;
    const svc = new InstrumentResolverService(repo);
    const out = await svc.search('NSE', '  reli ');
    expect(out).toEqual([{ exchange: 'NSE', tradingSymbol: 'RELIANCE', symbolName: 'Reliance' }]);
    expect(repo.search).toHaveBeenCalledWith('dhan', 'NSE', 'RELI', 20);
  });

  it('returns [] for a blank query without hitting the repository', async () => {
    const repo = { resolve: vi.fn(), upsertMany: vi.fn(), search: vi.fn() } as unknown as BrokerInstrumentsRepository;
    const svc = new InstrumentResolverService(repo);
    expect(await svc.search(null, '   ')).toEqual([]);
    expect(repo.search).not.toHaveBeenCalled();
  });
});
