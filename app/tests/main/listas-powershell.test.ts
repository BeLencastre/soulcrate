// A pré-visualização da lista usa o baixar-lista.ps1 de verdade (-SoAnalisar, P5): o parsing não é duplicado em TS.
// Aqui o script real analisa listas num diretório temporário, pelo ListasService, como o app faz.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExecutorReal } from '../../src/main/processos';
import { ListasService } from '../../src/main/services/listas-service';
import { removerPasta } from './ajudantes';

const REPO = join(import.meta.dirname, '..', '..', '..');
const temPowerShell =
  process.platform === 'win32' && spawnSync('powershell', ['-NoProfile', '-Command', '1']).status === 0;

let dir: string;
let svc: ListasService;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sc analise '));
  for (const f of ['baixar-lista.ps1', 'baixar-lista.lib.ps1']) copyFileSync(join(REPO, f), join(dir, f));
  svc = new ListasService({ executor: new ExecutorReal(), agora: Date.now });
});
afterEach(() => removerPasta(dir));

describe.skipIf(!temPowerShell)('análise da lista pelo baixar-lista.ps1 de verdade', () => {
  it('limpa, separa artista/título/mix e marca duplicadas e linhas com problema', async () => {
    svc.salvar(
      dir,
      'set.txt',
      [
        '# Set de sábado',
        'Azyr - No Escape',
        'Creeds - Push Up (Original Mix)',
        'RIOT CODE - Direct It To The Roof (Azyr Remix)',
        '',
        '01. Azyr – No Escape 4:12',
        'Sem traço nenhum',
      ].join('\n'),
    );
    const { analise, ultimaExecucaoEm } = await svc.analisar(dir, 'set.txt', { biblioteca: false, retentar: false });
    expect(analise.ok).toBe(true);
    if (!analise.ok) return;

    expect(analise.total).toBe(5);
    expect(analise.duplicates).toBe(1);
    expect(analise.unique).toBe(4);
    expect(analise.toProcess).toBe(4);
    expect(analise.libraryChecked).toBe(false);
    expect(ultimaExecucaoEm).toBeNull();

    const [azyr, creeds, riot, repetida, semTraco] = analise.lines;
    expect(azyr).toMatchObject({ sourceLine: 2, artist: 'Azyr', title: 'No Escape', status: 'nova' });
    expect(creeds).toMatchObject({ sourceLine: 3, artist: 'Creeds', title: 'Push Up', status: 'nova' });
    expect(riot).toMatchObject({ artist: 'RIOT CODE', mix: 'Azyr Remix' });
    // "01. Azyr – No Escape 4:12" é limpo e reconhecido como a mesma faixa da linha 2
    expect(repetida).toMatchObject({
      sourceLine: 6,
      status: 'repetida',
      duplicateOf: 2,
      artist: 'Azyr',
      title: 'No Escape',
    });
    expect(semTraco?.warnings.join(' ')).toMatch(/sem ' - '/);
  });

  it('o que já foi feito (estado-<lista>.tsv) aparece como "já feita"; -Retentar traz de volta o que falhou', async () => {
    svc.salvar(dir, 'set.txt', 'Azyr - No Escape\nVendex - Abaddon\nNovah - ACID');
    mkdirSync(join(dir, 'lotes'));
    // formato do estado (tests/fixtures/lote/estado-lista.tsv): status<TAB>chave<TAB>linha
    writeFileSync(
      join(dir, 'lotes', 'estado-set.tsv'),
      ['baixada\tazyr no escape\tAzyr - No Escape', 'nao encontrada\tvendex abaddon\tVendex - Abaddon'].join('\n') +
        '\n',
    );
    const sem = await svc.analisar(dir, 'set.txt', { biblioteca: false, retentar: false });
    const com = await svc.analisar(dir, 'set.txt', { biblioteca: false, retentar: true });
    if (!sem.analise.ok || !com.analise.ok) throw new Error('análise falhou');
    expect(sem.analise.alreadyDone).toBe(2);
    expect(sem.analise.toProcess).toBe(1);
    expect(sem.analise.lines.map((l) => l.status)).toEqual(['ja feita', 'ja feita', 'nova']);
    expect(com.analise.alreadyDone).toBe(1);
    expect(com.analise.toProcess).toBe(2);
    expect(sem.ultimaExecucaoEm).toBeGreaterThan(0);
    // são dois PowerShell de verdade em sequência: com o resto da suíte rodando em paralelo, 5 s não bastam
  }, 30_000);

  it('CSV do Spotify é lido pelas colunas', async () => {
    writeFileSync(
      join(dir, 'spotify.csv'),
      'Track Name,Artist Name(s),Album\nNo Escape,Azyr,X\nPush Up - Original Mix,Creeds,Y\n',
    );
    const { analise } = await svc.analisar(dir, 'spotify.csv', { biblioteca: false, retentar: false });
    if (!analise.ok) throw new Error(analise.error);
    expect(analise.total).toBe(2);
    expect(analise.lines.map((l) => l.artist)).toEqual(['Azyr', 'Creeds']);
  });

  it('CSV sem as colunas conhecidas: a análise volta com o erro do script', async () => {
    writeFileSync(join(dir, 'ruim.csv'), 'a,b\n1,2\n');
    const { analise } = await svc.analisar(dir, 'ruim.csv', { biblioteca: false, retentar: false });
    expect(analise.ok).toBe(false);
    if (!analise.ok) expect(analise.error).toMatch(/CSV sem colunas/);
  });

  it('pasta com espaço no caminho e lista com acento no nome funcionam', async () => {
    svc.salvar(dir, 'set de sábado.txt', 'Azyr - No Escape');
    const { analise } = await svc.analisar(dir, 'set de sábado.txt', { biblioteca: false, retentar: false });
    expect(analise.ok).toBe(true);
  });
});
