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
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentAccount } from '../auth/current-account.decorator';
import { JwtAuthGuard } from '../auth/guards';
import type { AuthContext } from '../auth/request-context';
import { AccountKeysService } from './account-keys.service';
import { BrokerConnectionService, type ConnectionView } from './broker-connection.service';
import { BrokerExceptionFilter } from './broker-exception.filter';
import { connectBrokerSchema, type ConnectBrokerDto } from './dto';

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
}
