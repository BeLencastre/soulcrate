import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { instalarStack } from '../../src/main/services/pasta-service';
import {
  fsAtualizacaoReal,
  StackAtualizacaoService,
  type FsAtualizacao,
} from '../../src/main/services/stack-atualizacao-service';
import {
  ARQUIVO_MANIFESTO,
  ARQUIVO_ULTIMA_ATUALIZACAO,
  ARQUIVOS_DA_STACK,
  type Manifesto,
} from '../../src/shared/stack-arquivos';
import { decidirAcao, exigeReconstruir } from '../../src/shared/stack-atualizacao';

let raiz: string;
let origem: string;
let dir: string;
let ocupado: { lote: boolean; operacao: boolean };

const p = (base: string, rel: string) => join(base, ...rel.split('/'));
const ler = (base: string, rel: string) => readFileSync(p(base, rel), 'utf8');
function gravar(base: string, rel: string, texto: string): void {
  mkdirSync(join(p(base, rel), '..'), { recursive: true });
  writeFileSync(p(base, rel), texto);
}
const manifesto = () => JSON.parse(readFileSync(p(dir, ARQUIVO_MANIFESTO), 'utf8')) as Manifesto;

/** Uma "versão" do app: todos os arquivos da stack com um conteúdo que diz de qual versão são. */
function criarVersaoDoApp(versao: string, mudar: Record<string, string> = {}): void {
  for (const a of ARQUIVOS_DA_STACK) {
    gravar(origem, a, a === 'VERSION' ? `${versao}\n` : (mudar[a] ?? `${a}@1.0.0`));
  }
}

function servico(fs?: FsAtualizacao): StackAtualizacaoService {
  return new StackAtualizacaoService({
    origemStack: origem,
    projeto: () => ({ dir, origem: 'configurada' }),
    loteRodando: () => Promise.resolve(ocupado.lote),
    operacaoEmCurso: () => ocupado.operacao,
    agora: () => 1_700_000_000_000,
    aoErro: (e) => {
      throw e instanceof Error ? e : new Error(String(e));
    },
    ...(fs ? { fs } : {}),
  });
}

beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), 'sc-stack-'));
  origem = join(raiz, 'app', 'stack');
  dir = join(raiz, 'Soulcrate com espaço');
  ocupado = { lote: false, operacao: false };
  criarVersaoDoApp('1.0.0');
  instalarStack({ origem, destino: dir }); // a instalação do assistente, com o manifesto
});
afterEach(() => rmSync(raiz, { recursive: true, force: true }));

describe('decidirAcao (a regra da §3.3)', () => {
  const h = { atual: 'a', instalado: 'a', doApp: 'b', jaOferecido: null, novoExiste: false };
  it.each([
    ['o app não traz o arquivo', { ...h, doApp: null }, 'sem-origem'],
    ['não está na pasta', { ...h, atual: null }, 'copiar'],
    ['já é o que o app traz', { ...h, atual: 'b' }, 'igual'],
    ['é o que o app instalou antes (ninguém editou)', h, 'atualizar'],
    ['o usuário editou e o app tem versão nova', { ...h, atual: 'x' }, 'manter-e-oferecer'],
    ['o usuário editou e o app não mudou o arquivo', { ...h, atual: 'x', doApp: 'a' }, 'manter-ja-oferecido'],
    [
      'o usuário editou e a versão nova já está ao lado',
      { ...h, atual: 'x', jaOferecido: 'b', novoExiste: true },
      'manter-ja-oferecido',
    ],
    [
      '…mas o .novo sumiu: oferece de novo',
      { ...h, atual: 'x', jaOferecido: 'b', novoExiste: false },
      'manter-e-oferecer',
    ],
    [
      'o manifesto não conhece o arquivo: conta como editado',
      { ...h, atual: 'x', instalado: null },
      'manter-e-oferecer',
    ],
  ] as const)('%s', (_nome, hashes, esperado) => {
    expect(decidirAcao(hashes)).toBe(esperado);
  });

  it('reconstruir só vale para o compose e para o que entra na imagem do Soulbeet', () => {
    expect(exigeReconstruir('docker-compose.yml')).toBe(true);
    expect(exigeReconstruir('soulbeet/Dockerfile')).toBe(true);
    expect(exigeReconstruir('soulbeet/config/config.yaml')).toBe(true);
    expect(exigeReconstruir('baixar-lista.ps1')).toBe(false);
    expect(exigeReconstruir('README.md')).toBe(false);
  });
});

describe('StackAtualizacaoService', () => {
  it('sem versão nova no app, não há o que fazer', async () => {
    const s = servico();
    expect(await s.estado()).toMatchObject({
      gerenciada: true,
      pendente: false,
      versaoDaPasta: '1.0.0',
      versaoDoApp: '1.0.0',
    });
    expect(await s.aplicar()).toEqual({ ok: true, resultado: null, esperando: false });
  });

  it('substitui o que ninguém editou, copia o que sumiu e atualiza o manifesto e a versão', async () => {
    criarVersaoDoApp('1.1.0', {
      'baixar-lista.ps1': 'baixar-lista.ps1@1.1.0',
      'soulbeet/Dockerfile': 'Dockerfile@1.1.0',
    });
    rmSync(p(dir, 'subir.bat')); // o usuário apagou um arquivo
    const s = servico();
    expect(await s.estado()).toMatchObject({ pendente: true, arquivosPendentes: 4 }); // 2 mudados + VERSION + subir.bat
    const r = await s.aplicar();
    expect(r.ok && r.resultado).toMatchObject({
      versaoAnterior: '1.0.0',
      versaoNova: '1.1.0',
      atualizados: ['VERSION', 'baixar-lista.ps1', 'soulbeet/Dockerfile'],
      copiados: ['subir.bat'],
      mantidos: [],
      precisaReconstruir: true,
      dispensado: false,
    });
    expect(ler(dir, 'baixar-lista.ps1')).toBe('baixar-lista.ps1@1.1.0');
    expect(ler(dir, 'VERSION')).toBe('1.1.0\n');
    expect(ler(dir, 'subir.bat')).toBe('subir.bat@1.0.0');
    expect(manifesto().versaoDaStack).toBe('1.1.0');
    expect(manifesto().arquivos['baixar-lista.ps1']).toBeDefined();
    expect(existsSync(p(dir, 'baixar-lista.ps1.soulcrate-tmp'))).toBe(false);
    // e a pasta passa a estar em dia
    expect(await s.estado()).toMatchObject({ pendente: false, versaoDaPasta: '1.1.0' });
    expect(await s.aplicar()).toEqual({ ok: true, resultado: null, esperando: false });
  });

  it('o que o usuário editou fica como está; a versão nova vai para .novo; e só avisa uma vez', async () => {
    gravar(dir, 'soulbeet/config/config.yaml', 'meu beets personalizado');
    criarVersaoDoApp('1.1.0', {
      'soulbeet/config/config.yaml': 'beets novo do app',
      'baixar-lista.ps1': 'baixar-lista.ps1@1.1.0',
    });
    const s = servico();
    const r = await s.aplicar();
    expect(r.ok && r.resultado).toMatchObject({
      mantidos: ['soulbeet/config/config.yaml'],
      atualizados: expect.arrayContaining(['baixar-lista.ps1']),
    });
    expect(ler(dir, 'soulbeet/config/config.yaml')).toBe('meu beets personalizado');
    expect(ler(dir, 'soulbeet/config/config.yaml.novo')).toBe('beets novo do app');
    expect(manifesto().novos?.['soulbeet/config/config.yaml']).toBeDefined();

    // abrir o app de novo não regrava o .novo nem avisa outra vez
    expect(await s.estado()).toMatchObject({ pendente: false });
    const segunda = await s.aplicar();
    expect(segunda.ok && segunda.resultado).toBeNull();

    // quando o app traz uma versão ainda mais nova, o .novo é renovado
    criarVersaoDoApp('1.2.0', { 'soulbeet/config/config.yaml': 'beets mais novo ainda' });
    const terceira = await s.aplicar();
    expect(terceira.ok && terceira.resultado?.mantidos).toEqual(['soulbeet/config/config.yaml']);
    expect(ler(dir, 'soulbeet/config/config.yaml.novo')).toBe('beets mais novo ainda');
    expect(ler(dir, 'soulbeet/config/config.yaml')).toBe('meu beets personalizado');
  });

  it('o usuário editou um arquivo que o app não mudou: nada a fazer, nem .novo', async () => {
    gravar(dir, 'subir.bat', 'meu subir.bat');
    criarVersaoDoApp('1.1.0', { 'baixar-lista.ps1': 'baixar-lista.ps1@1.1.0' });
    await servico().aplicar();
    expect(ler(dir, 'subir.bat')).toBe('meu subir.bat');
    expect(existsSync(p(dir, 'subir.bat.novo'))).toBe(false);
  });

  it('um arquivo que o manifesto não conhece (já era diferente na instalação) é tratado como editado', async () => {
    // instalação sobre uma pasta que já tinha um compose diferente: o app o manteve e não guardou o hash dele
    rmSync(raiz, { recursive: true, force: true });
    raiz = mkdtempSync(join(tmpdir(), 'sc-stack-'));
    origem = join(raiz, 'app', 'stack');
    dir = join(raiz, 'Soulcrate');
    criarVersaoDoApp('1.0.0');
    gravar(dir, 'docker-compose.yml', 'compose antigo de outra versão');
    instalarStack({ origem, destino: dir });
    expect(manifesto().arquivos['docker-compose.yml']).toBeUndefined();

    criarVersaoDoApp('1.1.0', { 'docker-compose.yml': 'compose 1.1.0' });
    const r = await servico().aplicar();
    expect(r.ok && r.resultado?.mantidos).toEqual(['docker-compose.yml']);
    expect(ler(dir, 'docker-compose.yml')).toBe('compose antigo de outra versão');
    expect(ler(dir, 'docker-compose.yml.novo')).toBe('compose 1.1.0');
  });

  it('NUNCA toca no que é do usuário', async () => {
    const dele: Record<string, string> = {
      '.env': 'SLSK_PASSWORD=segredo-do-usuario',
      'slskd/slskd.yml': 'web:\n  password: x',
      'lista-sabado.txt': 'Azyr - No Escape',
      'lotes/estado-lista.tsv': 'x',
      'music/Hard Techno/Azyr/No Escape.flac': 'audio',
      'navidrome/navidrome.db': 'banco',
      'soulbeet/data/soulbeet.db': 'banco',
      '.soulcrate/correcoes-1.json': '{}',
    };
    for (const [a, t] of Object.entries(dele)) gravar(dir, a, t);
    criarVersaoDoApp('1.1.0', Object.fromEntries(ARQUIVOS_DA_STACK.map((a) => [a, `${a}@1.1.0`])));
    const r = await servico().aplicar();
    expect(r.ok && r.resultado?.atualizados.length).toBeGreaterThan(10);
    for (const [a, t] of Object.entries(dele)) expect(ler(dir, a), a).toBe(t);
    expect(ARQUIVOS_DA_STACK).not.toContain('.env');
  });

  it('um lote rodando (ou ligar/desligar em curso) adia a atualização, sem mexer em nada', async () => {
    criarVersaoDoApp('1.1.0', { 'baixar-lista.ps1': 'baixar-lista.ps1@1.1.0' });
    const s = servico();
    ocupado.lote = true;
    expect(await s.estado()).toMatchObject({ pendente: true, esperando: true });
    expect(await s.aplicar()).toEqual({ ok: true, resultado: null, esperando: true });
    expect(ler(dir, 'baixar-lista.ps1')).toBe('baixar-lista.ps1@1.0.0');
    ocupado = { lote: false, operacao: true };
    expect(await s.aplicar()).toEqual({ ok: true, resultado: null, esperando: true });
    ocupado.operacao = false;
    const r = await s.aplicar();
    expect(r.ok && r.resultado?.atualizados).toContain('baixar-lista.ps1');
  });

  it('uma pasta que o app só adotou (clone do Git, sem manifesto) nunca é atualizada', async () => {
    rmSync(p(dir, ARQUIVO_MANIFESTO));
    criarVersaoDoApp('1.1.0', { 'baixar-lista.ps1': 'baixar-lista.ps1@1.1.0' });
    const s = servico();
    expect(await s.estado()).toMatchObject({ gerenciada: false, motivoSemGestao: 'pasta-existente', pendente: false });
    expect(await s.aplicar()).toEqual({ ok: true, resultado: null, esperando: false });
    expect(ler(dir, 'baixar-lista.ps1')).toBe('baixar-lista.ps1@1.0.0');
  });

  it('manifesto corrompido: o app não arrisca e não mexe em nada', async () => {
    writeFileSync(p(dir, ARQUIVO_MANIFESTO), '{ isto não é json');
    criarVersaoDoApp('1.1.0', { 'baixar-lista.ps1': 'baixar-lista.ps1@1.1.0' });
    expect(await servico().estado()).toMatchObject({ gerenciada: false, motivoSemGestao: 'pasta-existente' });
    await servico().aplicar();
    expect(ler(dir, 'baixar-lista.ps1')).toBe('baixar-lista.ps1@1.0.0');
  });

  it('sem pasta do Soulcrate, ou sem os arquivos no app, não há gestão', async () => {
    const semPasta = new StackAtualizacaoService({
      origemStack: origem,
      projeto: () => ({ dir: null, origem: null }),
      loteRodando: () => Promise.resolve(false),
      operacaoEmCurso: () => false,
      agora: () => 0,
      aoErro: () => undefined,
    });
    expect(await semPasta.estado()).toMatchObject({ gerenciada: false, motivoSemGestao: 'sem-pasta' });
    const semOrigem = new StackAtualizacaoService({
      origemStack: join(raiz, 'nao-existe'),
      projeto: () => ({ dir, origem: 'configurada' }),
      loteRodando: () => Promise.resolve(false),
      operacaoEmCurso: () => false,
      agora: () => 0,
      aoErro: () => undefined,
    });
    expect(await semOrigem.estado()).toMatchObject({ gerenciada: false, motivoSemGestao: 'sem-origem' });
  });

  it('falha no meio (arquivo preso): devolve o erro do catálogo e a próxima tentativa termina o serviço', async () => {
    criarVersaoDoApp('1.1.0', Object.fromEntries(ARQUIVOS_DA_STACK.map((a) => [a, `${a}@1.1.0`])));
    let falhas = 1;
    const fsQueFalha: FsAtualizacao = {
      ...fsAtualizacaoReal,
      escreverAtomico(caminho, conteudo) {
        if (caminho.endsWith('subir.bat') && falhas-- > 0)
          throw Object.assign(new Error('arquivo em uso'), { code: 'EBUSY' });
        fsAtualizacaoReal.escreverAtomico(caminho, conteudo);
      },
    };
    const s = new StackAtualizacaoService({
      origemStack: origem,
      projeto: () => ({ dir, origem: 'configurada' }),
      loteRodando: () => Promise.resolve(false),
      operacaoEmCurso: () => false,
      agora: () => 1,
      aoErro: () => undefined,
      fs: fsQueFalha,
    });
    const falhou = await s.aplicar();
    expect(falhou.ok).toBe(false);
    if (!falhou.ok) {
      expect(falhou.erro.codigo).toBe('stack.atualizacao-falhou');
      expect(falhou.erro.detalhes).toContain('EBUSY');
    }
    const ok = await s.aplicar();
    expect(ok.ok).toBe(true);
    for (const a of ARQUIVOS_DA_STACK) expect(ler(dir, a), a).toBe(a === 'VERSION' ? '1.1.0\n' : `${a}@1.1.0`);
    expect(manifesto().versaoDaStack).toBe('1.1.0');
  });

  it('o aviso fica até ser dispensado', async () => {
    criarVersaoDoApp('1.1.0', { 'baixar-lista.ps1': 'baixar-lista.ps1@1.1.0' });
    const s = servico();
    await s.aplicar();
    expect((await s.estado()).aviso).toMatchObject({ versaoNova: '1.1.0', dispensado: false });
    expect(existsSync(p(dir, ARQUIVO_ULTIMA_ATUALIZACAO))).toBe(true);
    s.dispensarAviso();
    expect((await s.estado()).aviso).toBeNull();
  });
});
