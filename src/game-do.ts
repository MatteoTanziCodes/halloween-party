import { DurableObject } from 'cloudflare:workers';
import type { Env } from './index';
import {
  applyTransition,
  bumpPhoto,
  bumpMeme,
  extendNight,
  GameError,
  getMe,
  hostView,
  isTransition,
  joinPlayer,
  newGame,
  pick,
  playerByToken,
  playerToken,
  castVote,
  gameTitle,
  setTitle,
  removePlayer,
  renamePlayer,
  resetGame,
  setKillerCount,
  systemCtx,
  undo,
} from './game';
import type { GameState } from './types';

const MAX_PHOTO_BYTES = 100 * 1024;
const MAX_MEME_BYTES = 400 * 1024;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export class GameDO extends DurableObject<Env> {
  private state!: GameState;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.state = (await ctx.storage.get<GameState>('game')) ?? newGame(Date.now());
    });
  }

  private async save(next: GameState, snapshot?: GameState): Promise<void> {
    this.state = next;
    if (snapshot) await this.ctx.storage.put({ game: next, undo: snapshot });
    else await this.ctx.storage.put('game', next);
  }

  private isHost(request: Request): boolean {
    const pin = request.headers.get('X-Host-Pin') ?? '';
    return !!this.env.HOST_PIN && safeEqual(pin, this.env.HOST_PIN);
  }

  private bearer(request: Request): string | null {
    const h = request.headers.get('Authorization') ?? '';
    return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
  }

  async fetch(request: Request): Promise<Response> {
    try {
      return await this.route(request);
    } catch (e) {
      if (e instanceof GameError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Something went wrong.' }, 500);
    }
  }

  private async route(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const now = Date.now();

    if (path === '/api/ping') return json({ ok: true });

    // ---- public ----
    // Only what the join screen and the printed poster need; nothing about players or roles.
    if (path === '/api/info' && method === 'GET') {
      return json({ title: gameTitle(this.state), joinable: this.state.phase === 'lobby' });
    }

    if (path === '/api/join' && method === 'POST') {
      const body = await readJson(request);
      const r = joinPlayer(this.state, body.name, systemCtx(now));
      await this.save(r.state);
      return json({ token: r.token });
    }

    // ---- player ----
    if (path === '/api/me' && method === 'GET') {
      const v = url.searchParams.get('v');
      const known = v !== null && v !== '' && Number.isInteger(Number(v)) ? Number(v) : null;
      const res = getMe(this.state, this.bearer(request), known, now);
      if (!res) return json({ error: 'Unknown player. Ask the host for a rejoin link.' }, 401);
      return json('unchanged' in res ? { unchanged: true, serverNow: now } : res);
    }

    if (path === '/api/pick' && method === 'POST') {
      const me = this.requirePlayer(request);
      const body = await readJson(request);
      await this.save(pick(this.state, me.id, body.targets, now));
      return json({ ok: true });
    }

    if (path === '/api/vote' && method === 'POST') {
      const me = this.requirePlayer(request);
      const body = await readJson(request);
      await this.save(castVote(this.state, me.id, body.target));
      return json({ ok: true });
    }

    // Face photos and meme costume pictures are stored the same way, each under its own key.
    const photo = path.match(/^\/api\/(photo|meme)\/([0-9a-f]+)$/);
    if (photo && method === 'GET') {
      if (!this.isHost(request) && !playerByToken(this.state, this.bearer(request))) {
        return json({ error: 'Not allowed.' }, 401);
      }
      const bytes = await this.ctx.storage.get<ArrayBuffer>(`${photo[1]}:${photo[2]}`);
      if (!bytes) return json({ error: 'No picture.' }, 404);
      return new Response(bytes, {
        headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable' },
      });
    }

    // ---- host ----
    if (path.startsWith('/api/host/')) {
      if (!this.isHost(request)) return json({ error: 'Wrong PIN.' }, 401);
      return this.hostRoute(request, path.slice('/api/host/'.length), now);
    }

    return json({ error: 'Not found.' }, 404);
  }

  private requirePlayer(request: Request) {
    const me = playerByToken(this.state, this.bearer(request));
    if (!me) throw new GameError(401, 'Unknown player. Ask the host for a rejoin link.');
    return me;
  }

  private async hostRoute(request: Request, sub: string, now: number): Promise<Response> {
    const method = request.method;
    const origin = new URL(request.url).origin;

    if (sub === 'state' && method === 'GET') return json(hostView(this.state, now));
    if (method !== 'POST' && !(method === 'GET' && sub.endsWith('/rejoin'))) {
      return json({ error: 'Not found.' }, 404);
    }

    if (isTransition(sub)) {
      const next = applyTransition(this.state, sub, systemCtx(now));
      await this.save(next, this.state);
      return json({ ok: true });
    }

    switch (sub) {
      case 'extend-night':
        await this.save(extendNight(this.state, now));
        return json({ ok: true });
      case 'undo': {
        const snapshot = (await this.ctx.storage.get<GameState>('undo')) ?? null;
        const next = undo(this.state, snapshot);
        await this.save(next);
        await this.ctx.storage.delete('undo');
        return json({ ok: true });
      }
      case 'title': {
        const body = await readJson(request);
        await this.save(setTitle(this.state, body.title));
        return json({ ok: true });
      }
      case 'killer-count': {
        const body = await readJson(request);
        await this.save(setKillerCount(this.state, body.count ?? null));
        return json({ ok: true });
      }
      case 'reset': {
        const body = await readJson(request);
        const next = resetGame(this.state, body.confirm, now);
        for (const prefix of ['photo:', 'meme:']) {
          const keys = await this.ctx.storage.list({ prefix });
          await this.ctx.storage.delete([...keys.keys()]);
        }
        await this.ctx.storage.delete('undo');
        await this.save(next);
        return json({ ok: true });
      }
    }

    const m = sub.match(/^player\/([0-9a-f]+)\/(remove|rename|rejoin|photo|meme)$/);
    if (m) {
      const [, id, action] = m;
      switch (action) {
        case 'remove':
          await this.save(removePlayer(this.state, id));
          return json({ ok: true });
        case 'rename': {
          const body = await readJson(request);
          await this.save(renamePlayer(this.state, id, body.name));
          return json({ ok: true });
        }
        case 'rejoin':
          return json({ url: `${origin}/?t=${playerToken(this.state, id)}` });
        case 'photo': {
          const bytes = await request.arrayBuffer();
          if (bytes.byteLength === 0 || bytes.byteLength > MAX_PHOTO_BYTES) {
            throw new GameError(413, 'Photo must be under 100 KB.');
          }
          const head = new Uint8Array(bytes, 0, 2);
          if (head[0] !== 0xff || head[1] !== 0xd8) throw new GameError(415, 'Photo must be a JPEG.');
          const next = bumpPhoto(this.state, id); // throws 404 for unknown players
          await this.ctx.storage.put(`photo:${id}`, bytes);
          await this.save(next);
          return json({ ok: true, photoVersion: next.players.find((p) => p.id === id)!.photoVersion });
        }
        case 'meme': {
          const bytes = await request.arrayBuffer();
          if (bytes.byteLength === 0 || bytes.byteLength > MAX_MEME_BYTES) {
            throw new GameError(413, 'Meme must be under 400 KB.');
          }
          const head = new Uint8Array(bytes, 0, 2);
          if (head[0] !== 0xff || head[1] !== 0xd8) throw new GameError(415, 'Meme must be a JPEG.');
          const next = bumpMeme(this.state, id);
          await this.ctx.storage.put(`meme:${id}`, bytes);
          await this.save(next);
          return json({ ok: true, memeVersion: next.players.find((p) => p.id === id)!.memeVersion });
        }
      }
    }

    return json({ error: 'Not found.' }, 404);
  }
}
