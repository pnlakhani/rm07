'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@rm07/ui';
import { instrumentsApi, watchlistsApi, type InstrumentHit, type Watchlist } from '@/lib/api';
import { Card, Input } from './ui';

/** Debounced instrument search box; calls `onPick` when the user selects a hit. */
function SymbolSearch({
  token,
  onPick,
}: {
  token: string;
  onPick: (hit: InstrumentHit) => void;
}): JSX.Element {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<InstrumentHit[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setHits([]);
      setOpen(false);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      void instrumentsApi
        .search(token, query)
        .then((result) => {
          if (active) {
            setHits(result);
            setOpen(true);
          }
        })
        .catch(() => {
          if (active) setHits([]);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [q, token]);

  return (
    <div className="relative">
      <Input
        placeholder="Add symbol… (e.g. RELI)"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {open && hits.length > 0 ? (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-zinc-700 bg-zinc-900">
          {hits.map((h) => (
            <li key={`${h.exchange}:${h.tradingSymbol}`}>
              <button
                type="button"
                onClick={() => {
                  onPick(h);
                  setQ('');
                  setHits([]);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-zinc-800"
              >
                <span className="font-medium">{h.tradingSymbol}</span>
                <span className="text-xs text-zinc-500">
                  {h.exchange}
                  {h.symbolName ? ` · ${h.symbolName}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Watchlist manager: create lists, search-and-add symbols, remove items, delete lists. */
export function Watchlists({ token }: { token: string }): JSX.Element {
  const [lists, setLists] = useState<Watchlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');

  const reload = useCallback(async (): Promise<void> => {
    try {
      setLists(await watchlistsApi.list(token));
    } catch {
      /* ignore — keep current state */
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function create(): Promise<void> {
    const name = newName.trim();
    if (!name) return;
    try {
      await watchlistsApi.create(token, name);
      setNewName('');
      await reload();
    } catch {
      /* ignore */
    }
  }

  async function removeList(id: string): Promise<void> {
    try {
      await watchlistsApi.remove(token, id);
      await reload();
    } catch {
      /* ignore */
    }
  }

  async function addItem(id: string, hit: InstrumentHit): Promise<void> {
    try {
      await watchlistsApi.addItem(token, id, hit.exchange, hit.tradingSymbol);
      await reload();
    } catch {
      /* ignore */
    }
  }

  async function removeItem(id: string, itemId: string): Promise<void> {
    try {
      await watchlistsApi.removeItem(token, id, itemId);
      await reload();
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <Input
          placeholder="New watchlist name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <Button type="submit">Create</Button>
      </form>

      {loading ? (
        <Card>
          <p className="text-sm text-zinc-500">Loading…</p>
        </Card>
      ) : lists.length === 0 ? (
        <Card>
          <p className="text-sm text-zinc-400">No watchlists yet — create one above.</p>
        </Card>
      ) : (
        lists.map((wl) => (
          <Card key={wl.id}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold">{wl.name}</h3>
              <button
                type="button"
                onClick={() => {
                  void removeList(wl.id);
                }}
                className="text-xs text-zinc-500 hover:text-red-400"
              >
                Delete
              </button>
            </div>
            {wl.items.length === 0 ? (
              <p className="mb-3 text-xs text-zinc-500">No symbols yet.</p>
            ) : (
              <ul className="mb-3 space-y-1">
                {wl.items.map((it) => (
                  <li key={it.id} className="flex items-center justify-between text-sm">
                    <span>
                      <span className="font-medium">{it.tradingSymbol}</span>{' '}
                      <span className="text-xs text-zinc-500">{it.exchange}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        void removeItem(wl.id, it.id);
                      }}
                      className="text-xs text-zinc-500 hover:text-red-400"
                      aria-label={`Remove ${it.tradingSymbol}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <SymbolSearch
              token={token}
              onPick={(hit) => {
                void addItem(wl.id, hit);
              }}
            />
          </Card>
        ))
      )}
    </div>
  );
}
