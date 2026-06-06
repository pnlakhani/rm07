import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Liveness probe for the web app (Vercel). */
export function GET(): NextResponse {
  return NextResponse.json({
    status: 'ok',
    service: 'web',
    version: process.env.npm_package_version ?? '0.1.0',
    time: new Date().toISOString(),
  });
}
