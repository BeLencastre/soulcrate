// SlskdService: o compartilhamento do slskd (Fase 5). A API key vem do .env (ou do slskd.yml) e sai só no cabeçalho.
import { describe, expect, it } from 'vitest';
import { SlskdService } from '../../src/main/services/slskd-service';

interface Chamada {
  url: string;
  metodo: string;
  chave: string | undefined;
}

function montar(
  arquivos: Record<string, string | null>,
  http: (c: Chamada) => Response | Error,
  dir: string | null = 'C:\\Soulcrate',
) {
  const chamadas: Chamada[] = [];
  const s = new SlskdService({
    projeto: () => ({ dir, origem: dir ? 'configurada' : null }),
    lerArquivo: (p) => arquivos[p.replace(/\\/g, '/').replace('C:/Soulcrate/', '')] ?? null,
    urlBase: () => 'http://127.0.0.1:5030',
    http: ((url: string, init: RequestInit) => {
      const c: Chamada = {
        url,
        metodo: init.method ?? 'GET',
        chave: (init.headers as Record<string, string>)['x-api-key'],
      };
      chamadas.push(c);
      const r = http(c);
      return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
    }) as typeof fetch,
  });
  return { s, chamadas };
}

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
const ENV = { '.env': 'SLSKD_API_KEY_SOULBEET=chave-do-env\n' };

describe('compartilhamento', () => {
  it('GET /api/v0/application com a chave do .env no cabeçalho', async () => {
    const { s, chamadas } = montar(ENV, () => json({ shares: { files: 1204, scanning: false } }));
    expect(await s.compartilhamento()).toEqual({ ok: true, compartilhamento: { arquivos: 1204, escaneando: false } });
    expect(chamadas).toEqual([
      { url: 'http://127.0.0.1:5030/api/v0/application', metodo: 'GET', chave: 'chave-do-env' },
    ]);
  });

  it('sem a chave no .env usa a do slskd.yml (o que o baixar-lista.ps1 faz)', async () => {
    const yml = 'web:\n  authentication:\n    api_keys:\n      soulbeet:\n        key: "chave-do-yml"\n';
    const { s, chamadas } = montar({ '.env': 'SLSKD_API_KEY_SOULBEET=\n', 'slskd/slskd.yml': yml }, () => json({}));
    await s.compartilhamento();
    expect(chamadas[0]?.chave).toBe('chave-do-yml');
  });

  it('sem chave em lugar nenhum: erro de configuração, sem chamar o slskd', async () => {
    const { s, chamadas } = montar({ '.env': '' }, () => json({}));
    const r = await s.compartilhamento();
    expect(r.ok).toBe(false);
    expect(!r.ok && r.erro.codigo).toBe('config.invalida');
    expect(chamadas).toEqual([]);
  });

  it('sem pasta do Soulcrate: também erro de configuração', async () => {
    const { s } = montar({}, () => json({}), null);
    const r = await s.compartilhamento();
    expect(!r.ok && r.erro.codigo).toBe('config.invalida');
  });

  it('401 e 403: a chave foi recusada (erro próprio), não "serviço fora" nem "configuração com problemas"', async () => {
    for (const status of [401, 403]) {
      const { s } = montar(ENV, () => new Response('', { status }));
      const r = await s.compartilhamento();
      expect(!r.ok && r.erro.codigo).toBe('slskd.chave-recusada');
      expect(!r.ok && r.erro.detalhes).toContain(String(status));
    }
  });

  it('o slskd fora do ar vira "serviço inacessível" e nunca vaza a chave', async () => {
    const { s } = montar(ENV, () => new Error('connect ECONNREFUSED 127.0.0.1:5030 x-api-key: chave-do-env'));
    const r = await s.compartilhamento();
    expect(!r.ok && r.erro.codigo).toBe('servico.inacessivel');
    expect(JSON.stringify(r)).not.toContain('chave-do-env');
  });

  it('erro 500 do slskd: serviço inacessível, com o status nos detalhes', async () => {
    const { s } = montar(ENV, () => new Response('', { status: 500 }));
    const r = await s.compartilhamento();
    expect(!r.ok && r.erro.codigo).toBe('servico.inacessivel');
    expect(!r.ok && r.erro.detalhes).toContain('500');
  });
});

describe('reescanear', () => {
  it('PUT /api/v0/shares e depois lê o estado', async () => {
    const { s, chamadas } = montar(ENV, (c) =>
      c.metodo === 'PUT' ? new Response(null, { status: 204 }) : json({ shares: { files: 0, scanning: true } }),
    );
    expect(await s.reescanear()).toEqual({ ok: true, compartilhamento: { arquivos: 0, escaneando: true } });
    expect(chamadas.map((c) => `${c.metodo} ${c.url.replace('http://127.0.0.1:5030', '')}`)).toEqual([
      'PUT /api/v0/shares',
      'GET /api/v0/application',
    ]);
    expect(chamadas.every((c) => c.chave === 'chave-do-env')).toBe(true);
  });

  it('409 (já está varrendo) é o que o usuário queria: segue', async () => {
    const { s } = montar(ENV, (c) =>
      c.metodo === 'PUT' ? new Response('', { status: 409 }) : json({ shares: { files: 10, scanning: true } }),
    );
    expect((await s.reescanear()).ok).toBe(true);
  });

  it('falha do PUT vira erro e não lê o estado', async () => {
    const { s, chamadas } = montar(ENV, () => new Response('', { status: 500 }));
    const r = await s.reescanear();
    expect(r.ok).toBe(false);
    expect(chamadas).toHaveLength(1);
  });
});
