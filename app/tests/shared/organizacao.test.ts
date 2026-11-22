// A organização das pastas (src/shared/organizacao.ts): ler e gravar a escolha, e o contrato com o plugin pastas.py e
// com o config.yaml do beets, que moram na stack e precisam andar junto com o app.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ARQUIVO_ORGANIZACAO,
  CAMPO_DO_CONFIG,
  configAtende,
  ehAlvoDaOrganizacao,
  ehOrganizacao,
  lerOrganizacoes,
  ORGANIZACAO_PADRAO,
  textoDasOrganizacoes,
} from '../../src/shared/organizacao';

const RAIZ = join(__dirname, '..', '..', '..');
const daStack = (...partes: string[]) => readFileSync(join(RAIZ, ...partes), 'utf8');
const PADRAO = { disco: 'genero-artista', rekordbox: 'genero-artista' };

describe('as escolhas gravadas', () => {
  it('sem arquivo vale gênero e artista nos dois, o jeito de sempre', () => {
    expect(ORGANIZACAO_PADRAO).toBe('genero-artista');
    expect(lerOrganizacoes(null)).toEqual(PADRAO);
    expect(lerOrganizacoes('')).toEqual(PADRAO);
  });

  it('lê o que o app grava, uma escolha para o disco e outra para o Rekordbox', () => {
    const texto = textoDasOrganizacoes({ disco: 'genero', rekordbox: 'genero-artista' });
    expect(texto).toBe('{\n  "disco": "genero",\n  "rekordbox": "genero-artista"\n}\n');
    expect(lerOrganizacoes(texto)).toEqual({ disco: 'genero', rekordbox: 'genero-artista' });
    expect(lerOrganizacoes('{"disco":"genero-artista","rekordbox":"genero"}')).toEqual({
      disco: 'genero-artista',
      rekordbox: 'genero',
    });
  });

  it('cada escolha ausente ou desconhecida cai no padrão sozinha, sem erro', () => {
    for (const texto of ['{', '[]', 'null', '"genero"', '{"disco":"artista"}', '{"disco":1,"rekordbox":null}']) {
      expect(lerOrganizacoes(texto), texto).toEqual(PADRAO);
    }
    expect(lerOrganizacoes('{"rekordbox":"genero"}')).toEqual({ disco: 'genero-artista', rekordbox: 'genero' });
  });

  it('só aceita as duas organizações e os dois alvos', () => {
    expect(ehOrganizacao('genero')).toBe(true);
    expect(ehOrganizacao('genero-artista')).toBe(true);
    expect(ehOrganizacao('artista')).toBe(false);
    expect(ehOrganizacao(null)).toBe(false);
    expect(ehAlvoDaOrganizacao('disco')).toBe(true);
    expect(ehAlvoDaOrganizacao('rekordbox')).toBe(true);
    expect(ehAlvoDaOrganizacao('navidrome')).toBe(false);
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

  it('um config.yaml antigo (editado, sem o campo) não atende; um que não existe também não', () => {
    expect(configAtende("paths:\n  singleton: '$genero_pasta/$artista_pasta/$title'\n")).toBe(false);
    expect(configAtende(null)).toBe(false);
    expect(CAMPO_DO_CONFIG).toBe('$organizar_por_artista');
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
