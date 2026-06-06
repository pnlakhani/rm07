/** Market-data service config. Port injected from env; defaults for local dev. */
export interface MdConfig {
  readonly port: number;
}

export function loadMdConfig(env: NodeJS.ProcessEnv = process.env): MdConfig {
  const raw = env['MD_SVC_PORT'] ?? '8100';
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid MD_SVC_PORT: ${raw}`);
  }
  return { port };
}
