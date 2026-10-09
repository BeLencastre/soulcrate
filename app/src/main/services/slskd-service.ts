// SlskdService (§3.2): as chamadas do app à API do slskd. Na Fase 5 é só o compartilhamento: quantos arquivos o slskd
// anuncia no Soulseek e o pedido de nova varredura de `music/`, a mesma lógica do baixar-lista.ps1 (que reescaneia
// quando o slskd anuncia 0 arquivos). A API key vem do `.env` (ou do `slskd.yml`) e nunca sai do main.
import { join } from 'node:path';
import { criarErro, type AppError } from '@shared/erros';
import { lerCompartilhamento, type ResultadoCompartilhamento } from '@shared/biblioteca';
import { versaoDoSlskd } from '@shared/sobre';
import type { ProjetoStatus } from '@shared/stack';
import { redigirSegredos } from '../seguranca';
import { lerChaveSlskd, lerEnv } from './config-validacao';

export interface DependenciasSlskd {
  projeto(): ProjetoStatus;
  lerArquivo(caminho: string): string | null;
  /** onde o slskd responde no host (`http://127.0.0.1:5030`) */
  urlBase(): string;
  /** padrão: o `fetch` global */
  http?: typeof fetch;
}

const TIMEOUT_HTTP_MS = 15_000;

class FalhaDaChamada extends Error {
  constructor(readonly erro: AppError) {
    super(erro.titulo);
  }
}

export class SlskdService {
  constructor(private readonly dep: DependenciasSlskd) {}

  /** Quantos arquivos o slskd anuncia agora, e se está varrendo `music/`. */
  async compartilhamento(): Promise<ResultadoCompartilhamento> {
    try {
      return { ok: true, compartilhamento: await this.ler() };
    } catch (e) {
      return this.comoResultado(e);
    }
  }

  /** `PUT /shares`: o slskd varre `music/` de novo; devolve o estado logo depois (a varredura continua em segundo plano). */
  async reescanear(): Promise<ResultadoCompartilhamento> {
    try {
      const r = await this.chamar('PUT', '/shares');
      void r.body?.cancel();
      // 409: já está varrendo, o que é justamente o que o usuário queria
      if (!r.ok && r.status !== 409) throw this.falhaHttp(r, 'PUT /api/v0/shares');
      return { ok: true, compartilhamento: await this.ler() };
    } catch (e) {
      return this.comoResultado(e);
    }
  }

  /** A versão que o slskd em execução informa (`GET /api/v0/application`); null se ele não responde ou não a traz. */
  async versao(): Promise<string | null> {
    try {
      const r = await this.chamar('GET', '/application');
      if (!r.ok) {
        void r.body?.cancel();
        return null;
      }
      return versaoDoSlskd(await r.json().catch(() => null));
    } catch (e) {
      if (e instanceof FalhaDaChamada) return null;
      throw e;
    }
  }

  private async ler() {
    const r = await this.chamar('GET', '/application');
    if (!r.ok) {
      void r.body?.cancel();
      throw this.falhaHttp(r, 'GET /api/v0/application');
    }
    return lerCompartilhamento(await r.json().catch(() => null));
  }

  // ------------------------------------------------------------ internos

  private comoResultado(e: unknown): { ok: false; erro: AppError } {
    if (e instanceof FalhaDaChamada) return { ok: false, erro: e.erro };
    throw e;
  }

  private chave(): string {
    const dir = this.dep.projeto().dir;
    const env = dir ? this.dep.lerArquivo(join(dir, '.env')) : null;
    const doEnv = env === null ? '' : (lerEnv(env).get('SLSKD_API_KEY_SOULBEET') ?? '');
    if (doEnv) return doEnv;
    const yml = dir ? this.dep.lerArquivo(join(dir, 'slskd', 'slskd.yml')) : null;
    const doYml = yml === null ? null : lerChaveSlskd(yml);
    if (!doYml) {
      throw new FalhaDaChamada(
        criarErro('config.invalida', { problemas: 1, detalhes: 'API key do slskd ausente (.env e slskd.yml).' }),
      );
    }
    return doYml;
  }

  private async chamar(metodo: 'GET' | 'PUT', caminho: string): Promise<Response> {
    const chave = this.chave();
    const http = this.dep.http ?? fetch;
    try {
      return await http(`${this.dep.urlBase()}/api/v0${caminho}`, {
        method: metodo,
        headers: { accept: 'application/json', 'x-api-key': chave },
        signal: AbortSignal.timeout(TIMEOUT_HTTP_MS),
        redirect: 'manual',
      });
    } catch (e) {
      throw new FalhaDaChamada(
        criarErro('servico.inacessivel', {
          servico: 'slskd',
          detalhes: redigirSegredos(e instanceof Error ? e.message : String(e)),
        }),
      );
    }
  }

  private falhaHttp(r: Response, o_que: string): FalhaDaChamada {
    if (r.status === 401 || r.status === 403) {
      return new FalhaDaChamada(criarErro('slskd.chave-recusada', { detalhes: `${o_que} → ${r.status}` }));
    }
    return new FalhaDaChamada(
      criarErro('servico.inacessivel', { servico: 'slskd', detalhes: `${o_que} → ${r.status}` }),
    );
  }
}
