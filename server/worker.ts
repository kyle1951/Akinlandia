/**
 * Cloudflare Worker entry: routes /api/* to game rooms (Durable Objects) and
 * serves the built single-page app for everything else.
 */
import { GameRoom } from './room';
import type { Env } from './room';
import { ROOM_CODE_ALPHABET } from './protocol';

export { GameRoom };

function makeCode(): string {
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  let code = '';
  for (const b of buf) code += ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length];
  return code;
}

function normalizeCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 6) return null;
  return code;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/rooms' && request.method === 'POST') {
      const code = makeCode();
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      const res = await stub.fetch(new Request(`https://room/init?code=${code}`, { method: 'POST' }));
      return new Response(await res.text(), { status: res.status, headers: { 'content-type': 'application/json' } });
    }

    const m = path.match(/^\/api\/rooms\/([A-Za-z0-9]+)(\/ws|\/info)?$/);
    if (m) {
      const code = normalizeCode(m[1]);
      if (!code) return new Response('Bad room code', { status: 400 });
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      const sub = m[2] ?? '/info';
      const target = new URL(`https://room${sub}`);
      url.searchParams.forEach((v, k) => target.searchParams.set(k, v));
      return stub.fetch(new Request(target.toString(), request));
    }

    if (path.startsWith('/api/')) return new Response('Not found', { status: 404 });
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
