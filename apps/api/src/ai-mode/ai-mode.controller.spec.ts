import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AiModeController } from './ai-mode.controller';
import type { AiVerdictService } from './ai-verdict.service';

function make(): { controller: AiModeController; service: { getVerdict: ReturnType<typeof vi.fn> } } {
  const service = {
    getVerdict: vi
      .fn()
      .mockResolvedValue({ exchange: 'NSE', tradingSymbol: 'RELIANCE', verdict: 'HOLD' }),
  };
  return { controller: new AiModeController(service as unknown as AiVerdictService), service };
}

describe('AiModeController', () => {
  it('returns a verdict for a valid request (symbol uppercased)', async () => {
    const { controller, service } = make();
    const out = await controller.verdict('reliance', 'NSE');
    expect(out).toMatchObject({ verdict: 'HOLD' });
    expect(service.getVerdict).toHaveBeenCalledWith('NSE', 'RELIANCE');
  });

  it('rejects a missing symbol or invalid exchange', async () => {
    const { controller } = make();
    await expect(controller.verdict('', 'NSE')).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.verdict('RELIANCE', 'BOGUS')).rejects.toBeInstanceOf(BadRequestException);
  });
});
