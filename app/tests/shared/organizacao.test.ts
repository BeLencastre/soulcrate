// A organização das pastas (src/shared/organizacao.ts): ler e gravar as escolhas por níveis (subgênero e artista, em
// cada destino), e o contrato com o plugin pastas.py e com o config.yaml do beets, que moram na stack e precisam andar
// junto com o app.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ARQUIVO_ORGANIZACAO,
  CAMPO_DO_CONFIG,
  CAMPO_DO_SUBGENERO,
  configAtende,
  configAtendeSubgenero,
  ehAlvoDaOrganizacao,
  ehNiveis,
  ehOrganizacao,
  lerOrganizacoes,
  NIVEIS_PADRAO,
  niveisEmOrdem,
  ORGANIZACAO_PADRAO,
  SEM_SUBGENERO,
  textoDasOrganizacoes,
  type NiveisDaOrganizacao,
} from '../../src/shared/organizacao';

const RAIZ = join(__dirname, '..', '..', '..');
const daStack = (...partes: string[]) => readFileSync(join(RAIZ, ...partes), 'utf8');
const PADRAO = { disco: { subgenero: false, artista: true }, rekordbox: { subgenero: false, artista: true } };
const COMBINACOES: NiveisDaOrganizacao[] = [
  { subgenero: false, artista: false },
  { subgenero: false, artista: true },
  { subgenero: true, artista: false },
  { subgenero: true, artista: true },
];

describe('as escolhas gravadas', () => {
  it('sem arquivo vale gênero e artista nos dois, sem subgênero: o jeito de sempre', () => {
    expect(ORGANIZACAO_PADRAO).toBe('genero-artista');
    expect(NIVEIS_PADRAO).toEqual({ subgenero: false, artista: true });
    expect(lerOrganizacoes(null)).toEqual(PADRAO);
    expect(lerOrganizacoes('')).toEqual(PADRAO);
  });

  it('as quatro combinações, em cada destino, voltam como foram gravadas', () => {
    for (const disco of COMBINACOES) {
      for (const rekordbox of COMBINACOES) {
        const texto = textoDasOrganizacoes({ disco, rekordbox });
        expect(lerOrganizacoes(texto), texto).toEqual({ disco, rekordbox });
      }
    }
  });

  it('grava o artista nas chaves antigas e o subgênero na chave nova', () => {
    const texto = textoDasOrganizacoes({
      disco: { subgenero: true, artista: false },
      rekordbox: { subgenero: false, artista: true },
    });
    expect(JSON.parse(texto)).toEqual({
      disco: 'genero',
      rekordbox: 'genero-artista',
      subgenero: { disco: true, rekordbox: false },
    });
    expect(texto.endsWith('\n')).toBe(true);
  });

  it('lê o arquivo antigo, sem a chave do subgênero: o subgênero fica desligado', () => {
    expect(lerOrganizacoes('{"disco":"genero","rekordbox":"genero-artista"}')).toEqual({
      disco: { subgenero: false, artista: false },
      rekordbox: { subgenero: false, artista: true },
    });
    expect(lerOrganizacoes('{"disco":"genero","rekordbox":"genero","subgenero":{"rekordbox":true}}')).toEqual({
      disco: { subgenero: false, artista: false },
      rekordbox: { subgenero: true, artista: false },
    });
  });

  it('as chaves que o app não conhece ficam quando ele regrava', () => {
    const anterior = '{"disco":"genero","futuro":{"x":1},"subgenero":{"disco":true}}';
    expect(JSON.parse(textoDasOrganizacoes(PADRAO, anterior))).toEqual({
      disco: 'genero-artista',
      rekordbox: 'genero-artista',
      subgenero: { disco: false, rekordbox: false },
      futuro: { x: 1 },
    });
    expect(JSON.parse(textoDasOrganizacoes(PADRAO, '{ quebrado'))).not.toHaveProperty('futuro');
  });

  it('cada escolha ausente ou desconhecida cai no padrão sozinha, sem erro', () => {
    for (const texto of [
      '{',
      '[]',
      'null',
      '"genero"',
      '{"disco":"artista"}',
      '{"disco":1,"rekordbox":null}',
      '{"subgenero":"sim"}',
      '{"subgenero":{"disco":"sim","rekordbox":1}}',
      '{"subgenero":null}',
    ]) {
      expect(lerOrganizacoes(texto), texto).toEqual(PADRAO);
    }
    expect(lerOrganizacoes('{"rekordbox":"genero"}')).toEqual({
      disco: { subgenero: false, artista: true },
      rekordbox: { subgenero: false, artista: false },
    });
  });

  it('só aceita as duas organizações, os dois alvos e níveis completos', () => {
    expect(ehOrganizacao('genero')).toBe(true);
    expect(ehOrganizacao('genero-artista')).toBe(true);
    expect(ehOrganizacao('artista')).toBe(false);
    expect(ehOrganizacao(null)).toBe(false);
    expect(ehAlvoDaOrganizacao('disco')).toBe(true);
    expect(ehAlvoDaOrganizacao('rekordbox')).toBe(true);
    expect(ehAlvoDaOrganizacao('navidrome')).toBe(false);
    expect(ehNiveis({ subgenero: true, artista: false })).toBe(true);
    const invalidos = [
      null,
      'genero',
      {},
      { subgenero: true },
      { subgenero: 1, artista: true },
      { subgenero: true, artista: true, x: 1 },
    ];
    for (const ruim of invalidos) expect(ehNiveis(ruim), JSON.stringify(ruim)).toBe(false);
  });

  it('os níveis saem na ordem do caminho: gênero, subgênero, artista', () => {
    expect(niveisEmOrdem({ subgenero: false, artista: false })).toEqual(['genero']);
    expect(niveisEmOrdem({ subgenero: false, artista: true })).toEqual(['genero', 'artista']);
    expect(niveisEmOrdem({ subgenero: true, artista: false })).toEqual(['genero', 'subgenero']);
    expect(niveisEmOrdem({ subgenero: true, artista: true })).toEqual(['genero', 'subgenero', 'artista']);
    expect(SEM_SUBGENERO).toBe('_Sem Subgenero');
  });
});

describe('o contrato com a stack', () => {
  it('o config.yaml do repositório usa a escolha no paths:', () => {
    const config = daStack('soulbeet', 'config', 'config.yaml');
    expect(configAtende(config)).toBe(true);
    expect(config).toMatch(/^ {2}singleton: .*%if\{\$organizar_por_artista,/m);
    expect(config).toMatch(/^ {2}default: .*%if\{\$organizar_por_artista,/m);
    expect(config).toMatch(/^ {2}comp: .*%if\{\$organizar_por_artista,/m);
  });

  it('o config.yaml do repositório usa o subgênero nos três paths:', () => {
    const config = daStack('soulbeet', 'config', 'config.yaml');
    expect(configAtendeSubgenero(config)).toBe(true);
    for (const rota of ['singleton', 'default', 'comp']) {
      expect(config, rota).toMatch(new RegExp(`^ {2}${rota}: .*\\$subgenero_pasta`, 'm'));
    }
  });

  it('um config.yaml antigo (editado, sem o campo) não atende; um que não existe também não', () => {
    expect(configAtende("paths:\n  singleton: '$genero_pasta/$artista_pasta/$title'\n")).toBe(false);
    expect(configAtende(null)).toBe(false);
    expect(CAMPO_DO_CONFIG).toBe('$organizar_por_artista');
  });

  it('um config.yaml de antes do subgênero não atende o nível novo', () => {
    const antigo = "paths:\n  singleton: '$genero_pasta/%if{$organizar_por_artista,$artista_pasta/$title,$title}'\n";
    expect(configAtendeSubgenero(antigo)).toBe(false);
    expect(configAtendeSubgenero(null)).toBe(false);
    expect(CAMPO_DO_SUBGENERO).toBe('$subgenero_pasta');
  });

  it('o plugin lê o mesmo arquivo que o app grava, pelo volume /data do Soulbeet', () => {
    expect(ARQUIVO_ORGANIZACAO).toEqual(['soulbeet', 'data', 'pastas.json']);
    expect(daStack('docker-compose.yml')).toContain('- ./soulbeet/data:/data');
    const plugin = daStack('soulbeet', 'beets-plugins', 'pastas.py');
    expect(plugin).toContain('ARQUIVO_DA_ORGANIZACAO = "/data/pastas.json"');
    expect(plugin).toContain('ORGANIZACOES = ("genero-artista", "genero")');
    expect(plugin).toContain('ORGANIZACAO_PADRAO = "genero-artista"');
  });
});
