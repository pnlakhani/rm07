/**
 * Typed client for the RM07 API. Uses `credentials: 'include'` so the httpOnly refresh cookie set
 * by the API on sign-in/confirm flows through; the short-lived access token is passed as a Bearer
 * header by the caller (held in memory, never persisted).
 */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080';

export interface ApiError {
  status: number;
  code?: string;
  title?: string;
  detail?: string;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  token?: string;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.token) {
    headers.authorization = `Bearer ${options.token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    credentials: 'include',
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const err = (data ?? {}) as { code?: string; title?: string; detail?: string };
    const apiError: ApiError = { status: res.status };
    if (err.code !== undefined) apiError.code = err.code;
    if (err.title !== undefined) apiError.title = err.title;
    if (err.detail !== undefined) apiError.detail = err.detail;
    throw apiError;
  }
  return data as T;
}

export interface BrokerConnection {
  id: string;
  broker: string;
  clientId: string | null;
  status: string;
}

export interface Holding {
  tradingSymbol: string;
  exchange: string;
  quantity: number;
  avgPricePaise: string;
  ltpPaise: string;
  isin?: string;
}

export interface EciesPayloadDto {
  epk: string;
  salt: string;
  iv: string;
  tag: string;
  ct: string;
}

export interface OrderHistoryItem {
  id: string;
  exchange: string;
  tradingSymbol: string;
  side: string;
  orderType: string;
  product: string;
  quantity: number;
  status: string;
  brokerOrderId: string | null;
  pricePaise: string | null;
  filledQuantity: number;
  createdAt: string;
}

export const authApi = {
  signup: (email: string, password: string): Promise<{ status: string }> =>
    request('/v1/auth/signup', { method: 'POST', body: { email, password } }),
  verifyOtp: (email: string, code: string): Promise<{ enrolmentToken: string }> =>
    request('/v1/auth/verify-otp', { method: 'POST', body: { email, code } }),
  enrolTotp: (enrolmentToken: string): Promise<{ secret: string; keyUri: string }> =>
    request('/v1/auth/totp/enrol', { method: 'POST', token: enrolmentToken }),
  confirmTotp: (code: string, enrolmentToken: string): Promise<{ accessToken: string }> =>
    request('/v1/auth/totp/confirm', { method: 'POST', body: { code }, token: enrolmentToken }),
  signin: (email: string, password: string, totp: string): Promise<{ accessToken: string }> =>
    request('/v1/auth/signin', { method: 'POST', body: { email, password, totp } }),
  refresh: (): Promise<{ accessToken: string }> => request('/v1/auth/refresh', { method: 'POST' }),
  logoutAll: (token: string): Promise<void> =>
    request('/v1/auth/logout-all', { method: 'POST', token }),
};

export const billingApi = {
  getSubscription: (token: string): Promise<{ plan: string }> =>
    request('/v1/billing/subscription', { token }),
};

export interface WatchlistItem {
  id: string;
  exchange: string;
  tradingSymbol: string;
}

export interface Watchlist {
  id: string;
  name: string;
  items: WatchlistItem[];
}

export const watchlistsApi = {
  list: (token: string): Promise<Watchlist[]> => request('/v1/watchlists', { token }),
  create: (token: string, name: string): Promise<Watchlist> =>
    request('/v1/watchlists', { method: 'POST', token, body: { name } }),
  remove: (token: string, id: string): Promise<void> =>
    request(`/v1/watchlists/${id}`, { method: 'DELETE', token }),
  addItem: (
    token: string,
    id: string,
    exchange: string,
    tradingSymbol: string,
  ): Promise<{ status: string }> =>
    request(`/v1/watchlists/${id}/items`, {
      method: 'POST',
      token,
      body: { exchange, tradingSymbol },
    }),
  removeItem: (token: string, id: string, itemId: string): Promise<void> =>
    request(`/v1/watchlists/${id}/items/${itemId}`, { method: 'DELETE', token }),
};

export const brokersApi = {
  list: (token: string): Promise<BrokerConnection[]> => request('/v1/brokers', { token }),
  connectKey: (token: string): Promise<{ publicKey: string }> =>
    request('/v1/brokers/connect-key', { token }),
  connect: (token: string, broker: string, payload: EciesPayloadDto): Promise<BrokerConnection> =>
    request('/v1/brokers/connect', { method: 'POST', token, body: { broker, payload } }),
  holdings: (token: string, connectionId: string): Promise<Holding[]> =>
    request(`/v1/brokers/${connectionId}/holdings`, { token }),
  listOrders: (token: string, connectionId: string): Promise<OrderHistoryItem[]> =>
    request(`/v1/brokers/${connectionId}/orders`, { token }),
};
