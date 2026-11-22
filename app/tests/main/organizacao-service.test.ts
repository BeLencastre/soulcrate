// OrganizacaoService: lê e grava as duas escolhas (disco e Rekordbox) em soulbeet/data/pastas.json, diz se o
// config.yaml usa a do disco e avisa quando a do Rekordbox muda (para o rekordbox XML refazer a árvore). O disco é um
// dublê.
import { beforeEach, describe, expect, it } from 'vitest';
import { OrganizacaoService } from '../../src/main/services/organizacao-service';

const ARQUIVO = 'C:\\Soulcrate\\soulbeet\\data\\pastas.json';
const CONFIG = 'C:\\Soulcrate\\soulbeet\\config\\config.yaml';
const CONFIG_NOVO = "paths:\n  singleton: '$genero_pasta/%if{$organizar_por_artista,$artista_pasta/$title,$title}'\n";

let arquivos: Map<string, string>;
let dir: string | null;
let falharGravacao: boolean;
let mudancasRekordbox: number;
let svc: OrganizacaoService;

beforeEach(() => {
  arquivos = new Map([[CONFIG, CONFIG_NOVO]]);
  dir = 'C:\\Soulcrate';
  falharGravacao = false;
  mudancasRekordbox = 0;
  svc = new OrganizacaoService({
    projeto: () => ({ dir, origem: 'configurada' }),
    fs: {
      lerTexto: (c) => arquivos.get(c) ?? null,
      escreverAtomico(c, conteudo) {
        if (falharGravacao) throw new Error('EPERM: operation not permitted');
        arquivos.set(c, conteudo);
      },
    },
    aoMudarRekordbox: () => mudancasRekordbox++,
  });
});

describe('ler', () => {
  it('sem arquivo: gênero e artista nos dois, o jeito de sempre', () => {
    expect(svc.estado()).toEqual({ disco: 'genero-artista', rekordbox: 'genero-artista', configAtende: true });
  });

  it('um config.yaml editado que não usa a escolha do disco é apontado', () => {
    arquivos.set(CONFIG, "paths:\n  singleton: '$genero_pasta/$artista_pasta/$title'\n");
    expect(svc.estado()?.configAtende).toBe(false);
  });

  it('sem pasta do Soulcrate: sem estado', () => {
    dir = null;
    expect(svc.estado()).toBeNull();
  });
});

describe('definir', () => {
  it('disco e Rekordbox são independentes: gravar um não muda o outro', () => {
    expect(svc.definir('disco', 'genero')).toEqual({
      ok: true,
      estado: { disco: 'genero', rekordbox: 'genero-artista', configAtende: true },
    });
    expect(arquivos.get(ARQUIVO)).toBe('{\n  "disco": "genero",\n  "rekordbox": "genero-artista"\n}\n');
    svc.definir('rekordbox', 'genero');
    svc.definir('disco', 'genero-artista');
    expect(svc.organizacoes('C:\\Soulcrate')).toEqual({ disco: 'genero-artista', rekordbox: 'genero' });
  });

  it('só a escolha do Rekordbox refaz o arquivo de playlists, e só quando muda', () => {
    svc.definir('disco', 'genero');
    expect(mudancasRekordbox).toBe(0);
    svc.definir('rekordbox', 'genero');
    svc.definir('rekordbox', 'genero');
    expect(mudancasRekordbox).toBe(1);
    svc.definir('rekordbox', 'genero-artista');
    expect(mudancasRekordbox).toBe(2);
  });

  it('não conseguiu gravar: o erro do catálogo, com o caminho, e nada muda', () => {
    falharGravacao = true;
    const r = svc.definir('rekordbox', 'genero');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.codigo).toBe('organizacao.nao-gravou');
    expect(r.erro.detalhes).toContain(ARQUIVO);
    expect(svc.estado()?.rekordbox).toBe('genero-artista');
    expect(mudancasRekordbox).toBe(0);
  });

  it('sem pasta do Soulcrate: o erro de sempre, sem gravar', () => {
    dir = null;
    const r = svc.definir('disco', 'genero');
    expect(r.ok ? null : r.erro.codigo).toBe('projeto.ausente');
    expect(arquivos.has(ARQUIVO)).toBe(false);
  });
});
