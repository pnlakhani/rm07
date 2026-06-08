import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import type { BillingService } from './billing.service';
import { RequiresPlanGuard } from './requires-plan.guard';

function ctx(auth: unknown): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ auth }) }),
  } as unknown as ExecutionContext;
}

function make(
  required: string | undefined,
  activePlan: string,
): { guard: RequiresPlanGuard; billing: { getActivePlan: ReturnType<typeof vi.fn> } } {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(required),
  } as unknown as Reflector;
  const billing = { getActivePlan: vi.fn().mockResolvedValue(activePlan) };
  return {
    guard: new RequiresPlanGuard(reflector, billing as unknown as BillingService),
    billing,
  };
}

describe('RequiresPlanGuard', () => {
  it('allows routes with no @RequiresPlan', async () => {
    const { guard, billing } = make(undefined, 'free');
    await expect(guard.canActivate(ctx({ accountId: 1n }))).resolves.toBe(true);
    expect(billing.getActivePlan).not.toHaveBeenCalled();
  });

  it('allows when the active plan meets the requirement', async () => {
    const { guard } = make('pro', 'pro');
    await expect(guard.canActivate(ctx({ accountId: 1n }))).resolves.toBe(true);
  });

  it('allows a higher tier than required', async () => {
    const { guard } = make('basic', 'elite');
    await expect(guard.canActivate(ctx({ accountId: 1n }))).resolves.toBe(true);
  });

  it('forbids when the active plan is below the requirement', async () => {
    const { guard } = make('pro', 'free');
    await expect(guard.canActivate(ctx({ accountId: 1n }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects when no authenticated principal is present', async () => {
    const { guard } = make('pro', 'free');
    await expect(guard.canActivate(ctx(undefined))).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
