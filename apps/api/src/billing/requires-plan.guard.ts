import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthedRequest } from '../auth/request-context';
import { BillingService } from './billing.service';

/** Plan tiers in ascending order of entitlement. */
const PLAN_RANK: Record<string, number> = { free: 0, basic: 1, pro: 2, elite: 3 };

export const REQUIRES_PLAN_KEY = 'rm07:requiresPlan';

/** Gate a route behind a minimum subscription tier, e.g. `@RequiresPlan('pro')`. */
export const RequiresPlan = (plan: string) => SetMetadata(REQUIRES_PLAN_KEY, plan);

/**
 * Enforces the minimum plan declared by @RequiresPlan. Runs AFTER JwtAuthGuard (it needs the
 * authenticated principal on the request). The account's active plan — the plan of its live
 * subscription, or 'free' — must rank at or above the required tier.
 */
@Injectable()
export class RequiresPlanGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly billing: BillingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string | undefined>(REQUIRES_PLAN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) {
      return true;
    }

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (!req.auth) {
      throw new UnauthorizedException({ title: 'Unauthorized', code: 'auth.required' });
    }

    const activePlan = await this.billing.getActivePlan(req.auth.accountId);
    const have = PLAN_RANK[activePlan] ?? 0;
    const need = PLAN_RANK[required] ?? 0;
    if (have < need) {
      throw new ForbiddenException({
        title: 'Upgrade required',
        code: 'billing.plan_required',
        detail: `This feature requires the ${required} plan or higher.`,
      });
    }
    return true;
  }
}
