'use client';

import { useState } from 'react';
import { Button } from '@rm07/ui';
import { brokersApi } from '@/lib/api';
import { encryptToPublicKey } from '@/lib/ecies';
import { Alert, Card, errorMessage, Field, Input } from './ui';

/**
 * Connect a Dhan account. Credentials are ECIES-encrypted in the browser to the account's public
 * key (fetched from /connect-key) before they're sent — the server only ever receives ciphertext.
 */
export function ConnectBroker({
  token,
  onConnected,
}: {
  token: string;
  onConnected: () => void;
}): JSX.Element {
  const [clientId, setClientId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const { publicKey } = await brokersApi.connectKey(token);
      const payload = await encryptToPublicKey(
        JSON.stringify({ client_id: clientId, access_token: accessToken }),
        publicKey,
      );
      await brokersApi.connect(token, 'dhan', payload);
      setClientId('');
      setAccessToken('');
      onConnected();
    } catch (e) {
      setError(errorMessage(e, 'Could not connect. Check your Dhan client id and access token.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h3 className="mb-1 font-semibold">Connect Dhan</h3>
      <p className="mb-4 text-xs text-zinc-500">
        Credentials are encrypted in your browser before they&apos;re sent — the server never sees
        them in the clear.
      </p>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {error ? <Alert>{error}</Alert> : null}
        <Field label="Client ID">
          <Input value={clientId} onChange={(e) => setClientId(e.target.value)} required />
        </Field>
        <Field label="Access token" hint="Generated in the Dhan web portal under DhanHQ Trading APIs.">
          <Input
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            required
          />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? 'Connecting…' : 'Connect'}
        </Button>
      </form>
    </Card>
  );
}
