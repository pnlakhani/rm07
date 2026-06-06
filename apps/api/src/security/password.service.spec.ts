import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PasswordService, WeakPasswordError, type Fetcher } from './password.service';

function hibpStub(knownPlaintext: string, count: number): Fetcher {
  const sha1 = createHash('sha1').update(knownPlaintext, 'utf8').digest('hex').toUpperCase();
  const suffix = sha1.slice(5);
  return (async (url: string | URL) => {
    const prefix = sha1.slice(0, 5);
    const requested = String(url).split('/range/')[1];
    const body =
      requested === prefix
        ? `${suffix}:${count}\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:3`
        : '0000000000000000000000000000000000A:1';
    return { ok: true, status: 200, text: async () => body } as Response;
  }) as unknown as Fetcher;
}

describe('PasswordService', () => {
  const svc = new PasswordService();

  it('hashes with Argon2id and verifies the correct password', async () => {
    const hash = await svc.hashPassword('correct horse battery staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await svc.verifyPassword(hash, 'correct horse battery staple')).toBe(true);
    expect(await svc.verifyPassword(hash, 'wrong password entirely')).toBe(false);
  });

  it('does not throw on a malformed stored hash', async () => {
    expect(await svc.verifyPassword('not-a-hash', 'whatever')).toBe(false);
  });

  it('detects a pwned password via the k-anonymity stub', async () => {
    const count = await svc.pwnedCount('hunter2hunter2', hibpStub('hunter2hunter2', 4821));
    expect(count).toBe(4821);
  });

  it('reports 0 for a non-breached password', async () => {
    const count = await svc.pwnedCount('a-very-unique-passphrase-9z', hibpStub('something-else', 9));
    expect(count).toBe(0);
  });

  it('rejects short passwords', async () => {
    await expect(svc.assertStrong('short')).rejects.toBeInstanceOf(WeakPasswordError);
    await expect(svc.assertStrong('short')).rejects.toMatchObject({ reason: 'too_short' });
  });

  it('rejects a long-but-breached password', async () => {
    await expect(
      svc.assertStrong('breachedpassword123', hibpStub('breachedpassword123', 12)),
    ).rejects.toMatchObject({ reason: 'pwned' });
  });

  it('accepts a long, unbreached password', async () => {
    await expect(
      svc.assertStrong('a-long-unbreached-passphrase', hibpStub('other', 0)),
    ).resolves.toBeUndefined();
  });

  it('does not block signup when HIBP is unavailable', async () => {
    const failing: Fetcher = (async () => {
      throw new Error('network down');
    }) as unknown as Fetcher;
    await expect(svc.assertStrong('a-long-enough-password', failing)).resolves.toBeUndefined();
  });
});
