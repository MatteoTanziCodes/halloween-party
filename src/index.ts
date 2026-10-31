import { GameDO } from './game-do';

export { GameDO };

export interface Env {
  GAME: DurableObjectNamespace;
  HOST_PIN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      const stub = env.GAME.get(env.GAME.idFromName('main'));
      return stub.fetch(request);
    }
    return new Response('Not found', { status: 404 });
  },
};
