// Navidrome e Soulbeet de mentira, só com as rotas que o assistente usa (as gravadas nos spikes SP5 e SP6).
// Sobem num servidor HTTP local, em porta livre, e guardam o que receberam. Servem aos testes dos serviços e aos
// testes ponta a ponta: nada aqui toca na stack de verdade.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface NavidromeFalso {
  url: string;
  /** usuário → senha */
  usuarios: Map<string, string>;
  chamadas: string[];
  fechar(): Promise<void>;
}

export interface SoulbeetFalso {
  url: string;
  config: { slskd_url: string | null; slskd_api_key: string | null };
  pastas: { id: number; name: string; path: string }[];
  chamadas: string[];
  /** quantas vezes o health devolve `downloader_online: false` antes de passar a true */
  saudeOffline: { restantes: number };
  fechar(): Promise<void>;
}

function lerCorpo(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const partes: Buffer[] = [];
    req.on('data', (c: Buffer) => partes.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(partes).toString('utf8') || 'null'));
      } catch {
        resolve(null);
      }
    });
  });
}

function json(
  res: ServerResponse,
  status: number,
  corpo: unknown,
  cabecalhos: Record<string, string | string[]> = {},
): void {
  res.writeHead(status, { 'content-type': 'application/json', ...cabecalhos });
  res.end(JSON.stringify(corpo));
}

async function escutar(server: Server, porta = 0): Promise<string> {
  await new Promise<void>((ok, erro) => {
    server.once('error', erro);
    server.listen(porta, '127.0.0.1', () => ok());
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const fechar = (server: Server) => () =>
  new Promise<void>((ok) => {
    server.closeAllConnections();
    server.close(() => ok());
  });

/** Navidrome 0.64: `POST /auth/createAdmin` só funciona uma vez (depois, 403); `POST /auth/login`; `GET /ping`. */
export async function iniciarNavidromeFalso(
  opcoes: { adminExistente?: { usuario: string; senha: string }; porta?: number } = {},
): Promise<NavidromeFalso> {
  const usuarios = new Map<string, string>();
  if (opcoes.adminExistente) usuarios.set(opcoes.adminExistente.usuario, opcoes.adminExistente.senha);
  const chamadas: string[] = [];

  const server = createServer((req, res) => {
    void (async () => {
      const rota = `${req.method} ${req.url}`;
      chamadas.push(rota);
      if (rota === 'GET /ping') return void res.end('pong');
      const corpo = (await lerCorpo(req)) as { username?: string; password?: string } | null;
      if (rota === 'POST /auth/createAdmin') {
        if (usuarios.size > 0) return json(res, 403, { error: 'Cannot create another first admin' });
        if (!corpo?.username || !corpo.password) return json(res, 400, { error: 'missing fields' });
        usuarios.set(corpo.username, corpo.password);
        return json(res, 200, { id: 'abc', isAdmin: true, name: corpo.username, token: 'jwt-falso' });
      }
      if (rota === 'POST /auth/login') {
        if (corpo?.username && usuarios.get(corpo.username) === corpo.password) {
          return json(res, 200, { id: 'abc', isAdmin: true, name: corpo.username, token: 'jwt-falso' });
        }
        return json(res, 401, { error: 'Invalid username or password' });
      }
      json(res, 404, { error: 'not found' });
    })();
  });
  const url = await escutar(server, opcoes.porta);
  return { url, usuarios, chamadas, fechar: fechar(server) };
}

/**
 * Soulbeet: login pelas credenciais do Navidrome (cookie `auth_token`), `/api/config` (com o objeto `config` em volta),
 * `/api/folders` (o POST NÃO é idempotente), `/api/system/health`. Rota desconhecida devolve 200 com a SPA, como o real.
 */
export async function iniciarSoulbeetFalso(
  navidrome: NavidromeFalso,
  opcoes: { porta?: number } = {},
): Promise<SoulbeetFalso> {
  const estado: Omit<SoulbeetFalso, 'url' | 'fechar'> = {
    config: { slskd_url: null, slskd_api_key: null },
    pastas: [],
    chamadas: [],
    saudeOffline: { restantes: 0 },
  };
  const COOKIE = 'auth_token=sessao-falsa';

  const server = createServer((req, res) => {
    void (async () => {
      const rota = `${req.method} ${req.url}`;
      estado.chamadas.push(rota);
      const corpo = (await lerCorpo(req)) as Record<string, unknown> | null;

      if (rota === 'POST /api/auth/login') {
        const u = corpo?.username as string | undefined;
        if (u && navidrome.usuarios.get(u) === corpo?.password) {
          return json(
            res,
            200,
            { username: u, user_id: 'u1', navidrome_status: 'Connected' },
            { 'set-cookie': `${COOKIE}; HttpOnly; Path=/; Max-Age=2592000` },
          );
        }
        return json(res, 401, 'Invalid credentials');
      }
      if (!rota.includes('/api/')) {
        res.writeHead(200, { 'content-type': 'text/html' });
        return void res.end('<!doctype html><title>Soulbeet</title>');
      }
      if (!(req.headers.cookie ?? '').includes(COOKIE)) return json(res, 401, 'No auth token found');

      if (rota === 'GET /api/config') return json(res, 200, estado.config);
      if (rota === 'POST /api/config') {
        const c = corpo?.config as { slskd_url?: string; slskd_api_key?: string } | undefined;
        if (!c) return json(res, 500, "missing field 'config'");
        estado.config = { slskd_url: c.slskd_url ?? null, slskd_api_key: c.slskd_api_key ?? null };
        return json(res, 200, {});
      }
      if (rota === 'GET /api/folders') return json(res, 200, estado.pastas);
      if (rota === 'POST /api/folders') {
        estado.pastas.push({ id: estado.pastas.length + 1, name: String(corpo?.name), path: String(corpo?.path) });
        return json(res, 200, estado.pastas.at(-1));
      }
      if (rota === 'GET /api/system/health') {
        const offline = estado.saudeOffline.restantes > 0 || !estado.config.slskd_url;
        if (estado.saudeOffline.restantes > 0) estado.saudeOffline.restantes--;
        return json(res, 200, { downloader_online: !offline, beets_ready: true, navidrome_online: true });
      }
      json(res, 404, 'not found');
    })();
  });
  const url = await escutar(server, opcoes.porta);
  return Object.assign(estado, { url, fechar: fechar(server) });
}
