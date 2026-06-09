import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentAccount } from '../auth/current-account.decorator';
import { JwtAuthGuard } from '../auth/guards';
import type { AuthContext } from '../auth/request-context';
import {
  addItemSchema,
  createWatchlistSchema,
  type AddItemDto,
  type CreateWatchlistDto,
} from './dto';
import { WatchlistsService, type WatchlistView } from './watchlists.service';

function requireNumericId(id: string): bigint {
  if (!/^\d+$/u.test(id)) {
    throw new BadRequestException({ title: 'Invalid id', code: 'request.invalid' });
  }
  return BigInt(id);
}

@Controller('v1/watchlists')
@UseGuards(JwtAuthGuard)
export class WatchlistsController {
  constructor(private readonly watchlists: WatchlistsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createWatchlistSchema)) body: CreateWatchlistDto,
    @CurrentAccount() account: AuthContext,
  ): Promise<WatchlistView> {
    return this.watchlists.create(account.accountId, body.name);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(@CurrentAccount() account: AuthContext): Promise<readonly WatchlistView[]> {
    return this.watchlists.list(account.accountId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentAccount() account: AuthContext): Promise<void> {
    await this.watchlists.remove(account.accountId, requireNumericId(id));
  }

  @Post(':id/items')
  @HttpCode(HttpStatus.CREATED)
  async addItem(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addItemSchema)) body: AddItemDto,
    @CurrentAccount() account: AuthContext,
  ): Promise<{ status: 'added' }> {
    await this.watchlists.addItem(
      account.accountId,
      requireNumericId(id),
      body.exchange,
      body.tradingSymbol,
    );
    return { status: 'added' };
  }

  @Delete(':id/items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentAccount() account: AuthContext,
  ): Promise<void> {
    await this.watchlists.removeItem(
      account.accountId,
      requireNumericId(id),
      requireNumericId(itemId),
    );
  }
}
