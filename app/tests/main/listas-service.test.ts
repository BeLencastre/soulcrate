import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AnaliseCanceladaError,
  decodificar,
  ListasService,
  nomeLivre,
  nomeSeguro,
} from '../../src/main/services/listas-service';
import { ExecutorFalso, OK, type Respondedor } from './ajudantes';

let dir: string;
let temp: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sc-listas-'));
  temp = mkdtempSync(join(tmpdir(), 'sc-listas-tmp-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(temp, { recursive: true, force: true });
});

const AGORA = new Date(2026, 9, 7, 16, 10, 2).getTime();
const novo = (responder: Respondedor = () => OK()) => {
  const executor = new ExecutorFalso(responder);
  return { executor, svc: new ListasService({ executor, agora: () => AGORA, pastaTemporaria: temp }) };
};
const escrever = (nome: string, conteudo: string | Buffer, mtimeSegundos?: number) => {
  writeFileSync(join(dir, nome), conteudo);
  if (mtimeSegundos !== undefined) utimesSync(join(dir, nome), mtimeSegundos, mtimeSegundos);
};

describe('recentes', () => {
  it('lista só .txt e .csv com nome válido, da mais recente para a mais antiga, sem o modelo de exemplo', () => {
    escrever('antiga.txt', 'a', 1_000);
    escrever('nova.csv', 'a', 3_000);
    escrever('meio.TXT', 'a', 2_000);
    escrever('lista.exemplo.txt', 'modelo', 4_000);
    escrever('README.md', 'x');
    escrever('.env', 'SEGREDO=1');
    escrever('docker-compose.yml', 'x');
    mkdirSync(join(dir, 'pasta.txt')); // pasta com cara de lista
    const nomes = novo()
      .svc.recentes(dir)
      .map((l) => l.nome);
    expect(nomes).toEqual(['nova.csv', 'meio.TXT', 'antiga.txt']);
  });

  it('pasta que não existe: lista vazia', () => {
    expect(novo().svc.recentes(join(dir, 'nao-existe'))).toEqual([]);
  });

  it('traz tipo, tamanho e data', () => {
    escrever('a.csv', 'abc', 5_000);
    expect(novo().svc.recentes(dir)[0]).toEqual({ nome: 'a.csv', tipo: 'csv', bytes: 3, modificadaEm: 5_000_000 });
  });
});

describe('ler e salvar', () => {
  it('lê UTF-8 com BOM e com fim de linha do Windows, devolvendo o texto limpo', () => {
    escrever(
      'a.txt',
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Azyr - No Escape\r\nByørn - 2 LOUD\r\n')]),
    );
    const l = novo().svc.ler(dir, 'a.txt');
    expect(l.texto).toBe('Azyr - No Escape\nByørn - 2 LOUD\n');
    expect(l.somenteLeitura).toBe(false);
  });

  it('lista antiga em Windows-1252 também abre (e vai ser regravada em UTF-8)', () => {
    escrever('a.txt', Buffer.from('Beyoncé - Halo\r\n', 'latin1'));
    expect(novo().svc.ler(dir, 'a.txt').texto).toBe('Beyoncé - Halo\n');
    expect(decodificar(Buffer.from([0xe9]))).toBe('é');
  });

  it('CSV abre só para leitura', () => {
    escrever('spotify.csv', 'Track Name,Artist Name(s)\nX,Y\n');
    expect(novo().svc.ler(dir, 'spotify.csv').somenteLeitura).toBe(true);
  });

  it('lista que não existe: erro claro', () => {
    expect(() => novo().svc.ler(dir, 'nada.txt')).toThrow(/não existe/);
  });

  it('recusa nome com pasta, extensão errada e arquivo grande demais', () => {
    const { svc } = novo();
    for (const nome of ['..\\.env.txt', '../x.txt', 'sub/x.txt', '.env', 'a.md']) {
      expect(() => svc.ler(dir, nome), nome).toThrow(/inv/i);
      expect(() => svc.salvar(dir, nome, 'x'), nome).toThrow(/inv/i);
    }
    escrever('grande.txt', Buffer.alloc(5_000_001, 97));
    expect(() => svc.ler(dir, 'grande.txt')).toThrow(/grande demais/);
    expect(() => svc.salvar(dir, 'a.txt', 'x'.repeat(5_000_001))).toThrow(/grande/);
  });

  it('salva em UTF-8 sem BOM, com CRLF, sem deixar arquivo temporário', () => {
    const { svc } = novo();
    const ref = svc.salvar(dir, 'a.txt', 'Azyr - No Escape\nByørn - 2 LOUD');
    const bytes = readFileSync(join(dir, 'a.txt'));
    expect(bytes.subarray(0, 3)).not.toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(bytes.toString('utf8')).toBe('Azyr - No Escape\r\nByørn - 2 LOUD');
    expect(ref).toMatchObject({ nome: 'a.txt', tipo: 'txt', bytes: bytes.length });
    expect(readdirSync(dir)).toEqual(['a.txt']);
  });

  it('ler depois de salvar devolve o mesmo texto', () => {
    const { svc } = novo();
    svc.salvar(dir, 'a.txt', 'linha 1\nlinha 2\n\n# comentário\n');
    expect(svc.ler(dir, 'a.txt').texto).toBe('linha 1\nlinha 2\n\n# comentário\n');
  });

  it('não salva CSV', () => {
    escrever('a.csv', 'x');
    expect(() => novo().svc.salvar(dir, 'a.csv', 'y')).toThrow(/CSV/);
    expect(readFileSync(join(dir, 'a.csv'), 'utf8')).toBe('x');
  });
});

describe('criar', () => {
  it('em branco: lista-AAAA-MM-DD.txt vazia', () => {
    const ref = novo().svc.criar(dir, 'vazia');
    expect(ref.nome).toBe('lista-2026-10-07.txt');
    expect(readFileSync(join(dir, ref.nome), 'utf8')).toBe('');
  });

  it('a partir do exemplo: copia o lista.exemplo.txt da pasta', () => {
    escrever('lista.exemplo.txt', '# Uma faixa por linha\nArtista - Título\n');
    const ref = novo().svc.criar(dir, 'exemplo');
    expect(readFileSync(join(dir, ref.nome), 'utf8')).toBe('# Uma faixa por linha\r\nArtista - Título\r\n');
  });

  it('sem o exemplo na pasta, usa um texto padrão', () => {
    const ref = novo().svc.criar(dir, 'exemplo');
    expect(readFileSync(join(dir, ref.nome), 'utf8')).toContain('Uma faixa por linha');
  });

  it('nunca sobrescreve: o nome ganha -2, -3', () => {
    const { svc } = novo();
    expect(svc.criar(dir, 'vazia').nome).toBe('lista-2026-10-07.txt');
    expect(svc.criar(dir, 'vazia').nome).toBe('lista-2026-10-07-2.txt');
    expect(svc.criar(dir, 'vazia').nome).toBe('lista-2026-10-07-3.txt');
  });
});

describe('importar', () => {
  it('de um arquivo de fora: copia os bytes, sem mexer na codificação', () => {
    const fora = mkdtempSync(join(tmpdir(), 'sc-fora-'));
    try {
      const bytes = Buffer.from('Track Name,Artist Name(s)\r\nBeyoncé,Halo\r\n', 'latin1');
      writeFileSync(join(fora, 'Meu Set.CSV'), bytes);
      const ref = novo().svc.importarArquivo(dir, join(fora, 'Meu Set.CSV'));
      expect(ref).toMatchObject({ nome: 'Meu Set.CSV', tipo: 'csv' });
      expect(readFileSync(join(dir, 'Meu Set.CSV'))).toEqual(bytes);
    } finally {
      rmSync(fora, { recursive: true, force: true });
    }
  });

  it('nome que já existe: não sobrescreve', () => {
    const fora = mkdtempSync(join(tmpdir(), 'sc-fora-'));
    try {
      escrever('set.txt', 'original');
      writeFileSync(join(fora, 'set.txt'), 'novo');
      const ref = novo().svc.importarArquivo(dir, join(fora, 'set.txt'));
      expect(ref.nome).toBe('set-2.txt');
      expect(readFileSync(join(dir, 'set.txt'), 'utf8')).toBe('original');
      expect(readFileSync(join(dir, 'set-2.txt'), 'utf8')).toBe('novo');
    } finally {
      rmSync(fora, { recursive: true, force: true });
    }
  });

  it('arquivo que já está na pasta do Soulcrate: só abre', () => {
    escrever('set.txt', 'x');
    expect(novo().svc.importarArquivo(dir, join(dir, 'set.txt')).nome).toBe('set.txt');
    expect(readdirSync(dir)).toEqual(['set.txt']);
  });

  it('recusa o que não é .txt/.csv e o que é grande demais', () => {
    const fora = mkdtempSync(join(tmpdir(), 'sc-fora-'));
    try {
      writeFileSync(join(fora, 'senhas.docx'), 'x');
      writeFileSync(join(fora, 'grande.txt'), Buffer.alloc(5_000_001, 97));
      expect(() => novo().svc.importarArquivo(dir, join(fora, 'senhas.docx'))).toThrow(/\.txt e \.csv/);
      expect(() => novo().svc.importarArquivo(dir, join(fora, 'grande.txt'))).toThrow(/grande demais/);
      expect(readdirSync(dir)).toEqual([]);
    } finally {
      rmSync(fora, { recursive: true, force: true });
    }
  });

  it('arquivo solto na janela (bytes): grava na pasta, com nome seguro', () => {
    const ref = novo().svc.importarBytes(dir, 'meu set: 1?.txt', new TextEncoder().encode('A - B\n'));
    expect(ref.nome).toBe('meu set_ 1_.txt');
    expect(readFileSync(join(dir, ref.nome), 'utf8')).toBe('A - B\n');
  });

  it('arquivo solto: recusa extensão errada e tamanho', () => {
    const { svc } = novo();
    expect(() => svc.importarBytes(dir, 'x.exe', new Uint8Array(1))).toThrow(/\.txt e \.csv/);
    expect(() => svc.importarBytes(dir, 'x.txt', new Uint8Array(5_000_001))).toThrow(/grande demais/);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('nomeSeguro e nomeLivre', () => {
    expect(nomeSeguro('C:\\x\\a:b*c.TXT')).toBe('a_b_c.TXT');
    expect(nomeSeguro('sem extensão')).toBe('sem extensão.txt');
    expect(nomeSeguro('..\\..\\evil.txt')).toBe('evil.txt');
    expect(nomeSeguro('CON.txt')).toBe('lista-importada.txt');
    expect(nomeLivre(dir, 'x.txt')).toBe('x.txt');
    escrever('x.txt', '');
    expect(nomeLivre(dir, 'x.txt')).toBe('x-2.txt');
  });
});

describe('analisar (baixar-lista.ps1 -SoAnalisar)', () => {
  const ANALISE = {
    v: 1,
    ok: true,
    list: 'a.txt',
    total: 1,
    unique: 1,
    duplicates: 0,
    alreadyDone: 0,
    libraryChecked: false,
    inLibrary: null,
    toProcess: 1,
    lines: [],
  };
  const saidaDe = (args: readonly string[]) => args[args.indexOf('-SaidaAnalise') + 1] as string;

  it('roda o script da pasta do Soulcrate com a lista, o arquivo de saída e as opções', async () => {
    escrever('baixar-lista.ps1', '# script');
    escrever('a.txt', 'A - B');
    mkdirSync(join(dir, 'lotes'));
    writeFileSync(join(dir, 'lotes', 'estado-a.tsv'), '');
    utimesSync(join(dir, 'lotes', 'estado-a.tsv'), 9_000, 9_000);
    let args: readonly string[] = [];
    const { svc, executor } = novo((_c, a) => {
      args = a;
      writeFileSync(saidaDe(a), JSON.stringify(ANALISE));
      return OK();
    });
    const r = await svc.analisar(dir, 'a.txt', { biblioteca: true, retentar: true });

    expect(executor.chamadas[0]).toMatch(/^powershell\.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File /);
    expect(args).toContain(join(dir, 'baixar-lista.ps1'));
    expect(args.slice(args.indexOf('-Lista'), args.indexOf('-Lista') + 3)).toEqual(['-Lista', 'a.txt', '-SoAnalisar']);
    expect(args).toContain('-AnalisarBiblioteca');
    expect(args).toContain('-Retentar');
    expect(r.analise).toMatchObject({ ok: true, toProcess: 1 });
    expect(r.ultimaExecucaoEm).toBe(9_000_000);
    expect(existsSync(saidaDe(args))).toBe(false); // o JSON temporário não fica para trás
  });

  it('sem as opções, não manda -AnalisarBiblioteca nem -Retentar', async () => {
    escrever('baixar-lista.ps1', '# script');
    escrever('a.txt', 'A - B');
    let args: readonly string[] = [];
    const { svc } = novo((_c, a) => {
      args = a;
      writeFileSync(saidaDe(a), JSON.stringify(ANALISE));
      return OK();
    });
    const r = await svc.analisar(dir, 'a.txt', { biblioteca: false, retentar: false });
    expect(args).not.toContain('-AnalisarBiblioteca');
    expect(args).not.toContain('-Retentar');
    expect(r.ultimaExecucaoEm).toBeNull();
  });

  it('o estado da lista usa o mesmo nome que o script (estado-<lista>.tsv)', async () => {
    escrever('baixar-lista.ps1', '# script');
    escrever('set de sábado.txt', 'A - B');
    mkdirSync(join(dir, 'lotes'));
    writeFileSync(join(dir, 'lotes', 'estado-set_de_sábado.tsv'), '');
    const { svc } = novo((_c, a) => {
      writeFileSync(saidaDe(a), JSON.stringify(ANALISE));
      return OK();
    });
    expect(
      (await svc.analisar(dir, 'set de sábado.txt', { biblioteca: false, retentar: false })).ultimaExecucaoEm,
    ).not.toBeNull();
  });

  it('erro do script (ok: false) volta como análise com erro, não como exceção', async () => {
    escrever('baixar-lista.ps1', '# script');
    escrever('a.csv', 'x');
    const { svc } = novo((_c, a) => {
      writeFileSync(
        saidaDe(a),
        JSON.stringify({ v: 1, ok: false, list: 'a.csv', error: 'CSV sem colunas reconhecidas.' }),
      );
      return { codigo: 4 };
    });
    const r = await svc.analisar(dir, 'a.csv', { biblioteca: false, retentar: false });
    expect(r.analise).toEqual({ v: 1, ok: false, list: 'a.csv', error: 'CSV sem colunas reconhecidas.' });
  });

  it('sem resultado do script: erro com o stderr', async () => {
    escrever('baixar-lista.ps1', '# script');
    escrever('a.txt', 'x');
    const { svc } = novo(() => ({ codigo: 1, stderr: 'ParserError: algo' }));
    await expect(svc.analisar(dir, 'a.txt', { biblioteca: false, retentar: false })).rejects.toThrow(/ParserError/);
  });

  it('lista ou script ausentes: erro claro, sem rodar nada', async () => {
    const { svc, executor } = novo();
    await expect(svc.analisar(dir, 'a.txt', { biblioteca: false, retentar: false })).rejects.toThrow(/não existe/);
    escrever('a.txt', 'x');
    await expect(svc.analisar(dir, 'a.txt', { biblioteca: false, retentar: false })).rejects.toThrow(
      /baixar-lista\.ps1/,
    );
    expect(executor.chamadas).toEqual([]);
  });

  it('uma análise nova da mesma lista cancela a anterior', async () => {
    escrever('baixar-lista.ps1', '# script');
    escrever('a.txt', 'x');
    let n = 0;
    const { svc } = novo((_c, a) => {
      const minha = ++n;
      // a primeira nunca termina sozinha: só quando o app a cancela
      if (minha === 1) return { codigo: 0, atraso: 60_000 };
      writeFileSync(saidaDe(a), JSON.stringify(ANALISE));
      return OK();
    });
    const primeira = svc.analisar(dir, 'a.txt', { biblioteca: false, retentar: false });
    const segunda = await svc.analisar(dir, 'a.txt', { biblioteca: false, retentar: false });
    expect(segunda.analise.ok).toBe(true);
    await expect(primeira).rejects.toBeInstanceOf(AnaliseCanceladaError);
  });
});

describe('arquivos temporários', () => {
  it('não deixa nada em disco depois de salvar, criar ou importar', () => {
    const { svc } = novo();
    svc.salvar(dir, 'a.txt', 'x');
    svc.criar(dir, 'vazia');
    svc.importarBytes(dir, 'b.txt', new Uint8Array([97]));
    expect(readdirSync(dir).filter((n) => n.endsWith('.tmp'))).toEqual([]);
    expect(statSync(join(dir, 'a.txt')).isFile()).toBe(true);
  });
});
