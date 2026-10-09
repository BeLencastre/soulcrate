// O lançador de verdade (SP3), com o PowerShell de verdade e um baixar-lista.ps1 de brinquedo: confere que aspas, espaços,
// acentos e apóstrofos chegam intactos ao script, que a saída vai para arquivos e que o lote continua rodando depois que
// o lançador sai (é isso que deixa o app fechar sem matar o lote).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LancadorReal } from '../../src/main/processos';
import { argumentosDoLancador, argumentosDoLote, POWERSHELL } from '../../src/main/services/lote-comando';
import { arquivosDaExecucao } from '../../src/shared/lote';
import { novasOpcoes } from '../../src/shared/opcoes-lote';
import { BOM, semBom } from '../../src/shared/texto';
import { ate, removerPasta } from './ajudantes';

const temPowerShell =
  process.platform === 'win32' && spawnSync('powershell', ['-NoProfile', '-Command', '1']).status === 0;

const SCRIPT_DE_BRINQUEDO = `param([string]$Lista, [string]$IdExecucao, [string]$Eventos, [string]$ArquivoParada, [int]$Paralelo = 5, [switch]$AceitarAacAiff)
$o = [ordered]@{ Lista = $Lista; IdExecucao = $IdExecucao; Eventos = $Eventos; ArquivoParada = $ArquivoParada; Paralelo = $Paralelo; AceitarAacAiff = [bool]$AceitarAacAiff; Raiz = $PSScriptRoot; Cwd = (Get-Location).Path }
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'recebido.json'), (ConvertTo-Json $o), (New-Object Text.UTF8Encoding $false))
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Write-Host 'ola, ação'
[Console]::Error.WriteLine('erro de teste')
Start-Sleep -Seconds 4
Set-Content -LiteralPath (Join-Path $PSScriptRoot 'fim.txt') -Value 'fim'
`;

let dir: string;
beforeEach(() => {
  // espaço, acento e apóstrofo no caminho: o pior caso dos nomes de pasta de usuário
  dir = mkdtempSync(join(tmpdir(), "sc lançador d'Ávila "));
  mkdirSync(join(dir, 'lotes'), { recursive: true });
  writeFileSync(join(dir, 'baixar-lista.ps1'), `${BOM}${SCRIPT_DE_BRINQUEDO}`, 'utf8');
});
afterEach(async () => {
  // o brinquedo ainda pode estar rodando (segura a pasta): espera ele terminar antes de apagar
  if (existsSync(join(dir, 'recebido.json')))
    await ate(() => existsSync(join(dir, 'fim.txt')), 20_000).catch(() => undefined);
  await removerPasta(dir);
}, 30_000);

describe.skipIf(!temPowerShell)('lançador do lote (PowerShell de verdade)', () => {
  it('inicia o script destacado: argumentos intactos, saída em arquivo, e o lançador não espera o lote', async () => {
    const id = '20261007-161002';
    const arq = arquivosDaExecucao(id);
    const args = argumentosDoLancador({
      argumentosDoLote: argumentosDoLote({
        dir,
        lista: 'lista de sábado.txt',
        idExecucao: id,
        opcoes: { ...novasOpcoes(), Paralelo: 8, AceitarAacAiff: true },
      }),
      saida: join(dir, arq.saida),
      erro: join(dir, arq.erro),
      cwd: dir,
    });

    const antes = Date.now();
    const r = await new LancadorReal().lancar(POWERSHELL, args, { cwd: dir, timeoutMs: 30_000 });
    const levou = Date.now() - antes;
    expect(r).toEqual({ codigo: 0, tempoEsgotado: false, erroSpawn: null });

    // o brinquedo dorme 4 s: se o lançador esperasse por ele, passaria disso
    expect(levou).toBeLessThan(3900);
    expect(existsSync(join(dir, 'fim.txt'))).toBe(false);

    await ate(() => existsSync(join(dir, 'recebido.json')), 15_000);
    const recebido = JSON.parse(semBom(readFileSync(join(dir, 'recebido.json'), 'utf8'))) as Record<string, unknown>;
    expect(recebido).toEqual({
      Lista: 'lista de sábado.txt',
      IdExecucao: id,
      Eventos: arq.eventos,
      ArquivoParada: arq.parada,
      Paralelo: 8,
      AceitarAacAiff: true,
      Raiz: realpathSync.native(dir),
      Cwd: realpathSync.native(dir),
    });

    // a saída do script foi para os arquivos, não para um pipe do app
    await ate(() => existsSync(join(dir, 'fim.txt')), 15_000);
    expect(readFileSync(join(dir, arq.saida), 'utf8')).toContain('ola, ação');
    expect(readFileSync(join(dir, arq.erro), 'utf8')).toContain('erro de teste');
  }, 40_000);

  it('PowerShell que não existe: erro de spawn, sem lançar exceção', async () => {
    const r = await new LancadorReal().lancar('powershell-que-nao-existe.exe', [], { timeoutMs: 5000 });
    expect(r.codigo).toBeNull();
    expect(r.erroSpawn?.code).toBe('ENOENT');
  });
});
