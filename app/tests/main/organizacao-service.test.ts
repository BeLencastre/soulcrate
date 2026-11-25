// OrganizacaoService: lê e grava os níveis (subgênero e artista) de cada destino, disco e Rekordbox, em
// soulbeet/data/pastas.json, diz se o config.yaml usa as do disco e se há conta do Beatport, e avisa quando a do
// Rekordbox muda (para o rekordbox XML refazer a árvore). O disco é um dublê.
import { beforeEach, describe, expect, it } from 'vitest';
import { OrganizacaoService } from '../../src/main/services/organizacao-service';

const ARQUIVO = 'C:\\Soulcrate\\soulbeet\\data\\pastas.json';
const CONFIG = 'C:\\Soulcrate\\soulbeet\\config\\config.yaml';
const CONFIG_NOVO = "paths:\n  singleton: '$genero_pasta/%if{$organizar_por_artista,$artista_pasta/$title,$title}'\n";

const PADRAO = { subgenero: false, artista: true };
const SO_GENERO = { subgenero: false, artista: false };
const COM_SUBGENERO = { subgenero: true, artista: true };

let arquivos: Map<string, string>;
let dir: string | null;
let falharGravacao: boolean;
let mudancasRekordbox: number;
let conta: boolean;
let svc: OrganizacaoService;

beforeEach(() => {
  arquivos = new Map([[CONFIG, CONFIG_NOVO]]);
  dir = 'C:\\Soulcrate';
  falharGravacao = false;
  mudancasRekordbox = 0;
  conta = false;
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
    contaBeatport: () => conta,
  });
});

describe('ler', () => {
  it('sem arquivo: gênero e artista nos dois, o jeito de sempre', () => {
    expect(svc.estado()).toEqual({
      disco: PADRAO,
      rekordbox: PADRAO,
      configAtende: true,
      configAtendeSubgenero: false,
      contaBeatport: false,
    });
  });

  it('um config.yaml editado que não usa a escolha do disco é apontado', () => {
    arquivos.set(CONFIG, "paths:\n  singleton: '$genero_pasta/$artista_pasta/$title'\n");
    expect(svc.estado()?.configAtende).toBe(false);
  });

  it('diz se o config.yaml entende o subgênero e se há conta do Beatport', () => {
    arquivos.set(
      CONFIG,
      "paths:\n  singleton: '$genero_pasta/$subgenero_pasta/%if{$organizar_por_artista,$artista_pasta,}'\n",
    );
    conta = true;
    const estado = svc.estado();
    expect(estado?.configAtendeSubgenero).toBe(true);
    expect(estado?.contaBeatport).toBe(true);
  });

  it('sem pasta do Soulcrate: sem estado', () => {
    dir = null;
    expect(svc.estado()).toBeNull();
  });
});

describe('definir', () => {
  it('disco e Rekordbox são independentes: gravar um não muda o outro', () => {
    const r = svc.definir('disco', SO_GENERO);
    expect(r.ok ? r.estado.disco : null).toEqual(SO_GENERO);
    expect(r.ok ? r.estado.rekordbox : null).toEqual(PADRAO);
    expect(JSON.parse(arquivos.get(ARQUIVO) ?? '')).toEqual({
      disco: 'genero',
      rekordbox: 'genero-artista',
      subgenero: { disco: false, rekordbox: false },
    });
    svc.definir('rekordbox', COM_SUBGENERO);
    svc.definir('disco', { subgenero: true, artista: false });
    expect(svc.organizacoes('C:\\Soulcrate')).toEqual({
      disco: { subgenero: true, artista: false },
      rekordbox: COM_SUBGENERO,
    });
  });

  it('guarda as chaves que o app não conhece', () => {
    arquivos.set(ARQUIVO, '{"futuro":true}');
    svc.definir('disco', SO_GENERO);
    expect(JSON.parse(arquivos.get(ARQUIVO) ?? '')).toHaveProperty('futuro', true);
  });

  it('só a escolha do Rekordbox refaz o arquivo de playlists, e só quando os níveis mudam', () => {
    svc.definir('disco', SO_GENERO);
    expect(mudancasRekordbox).toBe(0);
    svc.definir('rekordbox', SO_GENERO);
    svc.definir('rekordbox', SO_GENERO);
    expect(mudancasRekordbox).toBe(1);
    svc.definir('rekordbox', COM_SUBGENERO);
    expect(mudancasRekordbox).toBe(2);
    svc.definir('rekordbox', COM_SUBGENERO);
    expect(mudancasRekordbox).toBe(2);
    svc.definir('rekordbox', { subgenero: true, artista: false });
    expect(mudancasRekordbox).toBe(3);
  });

  it('não conseguiu gravar: o erro do catálogo, com o caminho, e nada muda', () => {
    falharGravacao = true;
    const r = svc.definir('rekordbox', SO_GENERO);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.codigo).toBe('organizacao.nao-gravou');
    expect(r.erro.detalhes).toContain(ARQUIVO);
    expect(svc.estado()?.rekordbox).toEqual(PADRAO);
    expect(mudancasRekordbox).toBe(0);
  });

  it('sem pasta do Soulcrate: o erro de sempre, sem gravar', () => {
    dir = null;
    const r = svc.definir('disco', SO_GENERO);
    expect(r.ok ? null : r.erro.codigo).toBe('projeto.ausente');
    expect(arquivos.has(ARQUIVO)).toBe(false);
  });
});
