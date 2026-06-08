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
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentAccount } from '../auth/current-account.decorator';
import { JwtAuthGuard } from '../auth/guards';
import type { AuthContext } from '../auth/request-context';
import { AccountKeysService } from './account-keys.service';
import {
  BrokerConnectionService,
  type ConnectionView,
  type HoldingView,
  type QuoteView,
} from './broker-connection.service';
import { BrokerExceptionFilter } from './broker-exception.filter';
import { connectBrokerSchema, type ConnectBrokerDto } from './dto';
import type { ExchangeCode } from '@rm07/broker-adapters';

const EXCHANGE_CODES = new Set(['NSE', 'BSE', 'MCX', 'NFO', 'BFO', 'CDS']);

@Controller('v1/brokers')
@UseGuards(JwtAuthGuard)
@UseFilters(BrokerExceptionFilter)
export class BrokersController {
  constructor(
    private readonly accountKeys: AccountKeysService,
    private readonly connections: BrokerConnectionService,
  ) {}

  /** The account's ECIES public key — the browser encrypts broker credentials to it. */
  @Get('connect-key')
  @HttpCode(HttpStatus.OK)
  async connectKey(@CurrentAccount() account: AuthContext): Promise<{ publicKey: string }> {
    return { publicKey: await this.accountKeys.getPublicKey(account.accountId) };
  }

  @Post('connect')
  @HttpCode(HttpStatus.CREATED)
  async connect(
    @Body(new ZodValidationPipe(connectBrokerSchema)) body: ConnectBrokerDto,
    @CurrentAccount() account: AuthContext,
  ): Promise<ConnectionView> {
    return this.connections.connect(account.accountId, body.broker, body.payload);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(@CurrentAccount() account: AuthContext): Promise<readonly ConnectionView[]> {
    return this.connections.list(account.accountId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnect(@Param('id') id: string, @CurrentAccount() account: AuthContext): Promise<void> {
    if (!/^\d+$/u.test(id)) {
      throw new BadRequestException({ title: 'Invalid connection id', code: 'request.invalid' });
    }
    await this.connections.disconnect(account.accountId, BigInt(id));
  }

  /** Live holdings for a connection (App Flow J-02). */
  @Get(':id/holdings')
  @HttpCode(HttpStatus.OK)
  async holdings(
    @Param('id') id: string,
    @CurrentAccount() account: AuthContext,
  ): Promise<readonly HoldingView[]> {
    if (!/^\d+$/u.test(id)) {
      throw new BadRequestException({ title: 'Invalid connection id', code: 'request.invalid' });
    }
    return this.connections.getHoldings(account.accountId, BigInt(id));
  }

  /** Live LTP quote for a symbol on a connection's broker. */
  @Get(':id/quote')
  @HttpCode(HttpStatus.OK)
  async quote(
    @Param('id') id: string,
    @Query('symbol') symbol: string,
    @Query('exchange') exchange: string,
    @CurrentAccount() account: AuthContext,
  ): Promise<QuoteView> {
    if (!/^\d+$/u.test(id)) {
      throw new BadRequestException({ title: 'Invalid connection id', code: 'request.invalid' });
    }
    if (!symbol || !EXCHANGE_CODES.has(exchange)) {
      throw new BadRequestException({ title: 'symbol and a valid exchange are required', code: 'request.invalid' });
    }
    return this.connections.getQuote(account.accountId, BigInt(id), {
      symbol,
      exchange: exchange as ExchangeCode,
    });
  }
}
