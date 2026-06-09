export interface WatchlistItemRow {
  readonly id: bigint;
  readonly exchange: string;
  readonly tradingSymbol: string;
}

export interface WatchlistRow {
  readonly id: bigint;
  readonly accountId: bigint;
  readonly name: string;
  readonly items: readonly WatchlistItemRow[];
}

/** Just the ownership fields, for access checks. */
export interface WatchlistOwner {
  readonly id: bigint;
  readonly accountId: bigint;
}

export interface WatchlistsRepository {
  create(accountId: bigint, name: string): Promise<bigint>;
  listByAccount(accountId: bigint): Promise<readonly WatchlistRow[]>;
  findById(id: bigint): Promise<WatchlistOwner | null>;
  deleteById(id: bigint): Promise<void>;
  /** Insert an item; idempotent on (watchlist, exchange, tradingSymbol). */
  addItem(watchlistId: bigint, exchange: string, tradingSymbol: string): Promise<void>;
  removeItem(watchlistId: bigint, itemId: bigint): Promise<void>;
}

export const WATCHLISTS_REPOSITORY = Symbol('WATCHLISTS_REPOSITORY');
