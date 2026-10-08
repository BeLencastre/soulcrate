// SP3 — um PowerShell iniciado pelo app sobrevive ao app fechar? O app consegue reconectar?
//
// Uso:  node sp3-processo-destacado.mjs <pasta> iniciar     (inicia e sai, como o app fechando)
//       node sp3-processo-destacado.mjs <pasta> verificar   (confere quem continua vivo)
//
// Compara quatro jeitos de iniciar um PowerShell que grava uma linha por segundo:
//   comum      spawn normal                          -> entra no job object do libuv
//   destacado  spawn com detached:true               -> DETACHED_PROCESS (sem console)
//   lancador   PowerShell curto + Start-Process      -> o neto nasce fora do job (SILENT_BREAKAWAY_OK)
//   cmdstart   cmd /c start /min                     -> idem, com uma janela minimizada
// Resultado e conclusoes: docs/spikes/sp3-processo-destacado.md

import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const pasta = path.resolve(process.argv[2] ?? '.');
const modo = process.argv[3] ?? 'iniciar';
fs.mkdirSync(pasta, { recursive: true });
const worker = path.join(pasta, 'worker.ps1');
fs.writeFileSync(worker, 'param([string]$Arquivo)\n$i = 0\nwhile ($i -lt 30) { $i++; [IO.File]::AppendAllText($Arquivo, "$i`n"); Start-Sleep -Seconds 1 }\n');
const argsWorker = (nome) => ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', worker, '-Arquivo', path.join(pasta, `${nome}.txt`)];
const vivo = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const linhas = (nome) => { const f = path.join(pasta, `${nome}.txt`); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).length : 0; };
const nomes = ['comum', 'destacado', 'lancador', 'cmdstart'];

if (modo === 'iniciar') {
  const pids = {};
  const c = spawn('powershell.exe', argsWorker('comum'), { windowsHide: true });
  c.stdout.on('data', () => {});
  pids.comum = c.pid;

  const log = fs.openSync(path.join(pasta, 'destacado.saida.log'), 'a');
  const d = spawn('powershell.exe', argsWorker('destacado'), { detached: true, windowsHide: true, stdio: ['ignore', log, log] });
  d.unref();
  pids.destacado = d.pid;

  // Start-Process -ArgumentList junta os itens com espaco SEM aspas: caminho com espaco precisa de aspas proprias.
  // stdout E stderr do neto vao para arquivos: se ele herdar um pipe do lancador, o execFileSync espera o neto terminar.
  const q = (s) => `'"${s.replace(/'/g, "''")}"'`;
  const lit = (s) => `'${s.replace(/'/g, "''")}'`;
  // O neto herda TODOS os handles herdaveis do lancador: se o lancador tiver um pipe do Node, o neto o segura
  // aberto. Por isso o lancador nao recebe pipe nenhum (stdio 'ignore') e devolve o PID por arquivo.
  const arqPid = path.join(pasta, 'lancador.pid');
  const lanc = `$p = Start-Process -FilePath powershell.exe -WindowStyle Hidden -PassThru ` +
    `-RedirectStandardOutput ${lit(path.join(pasta, 'lancador.saida.log'))} -RedirectStandardError ${lit(path.join(pasta, 'lancador.erro.log'))} ` +
    `-ArgumentList ${argsWorker('lancador').map(q).join(',')}; [IO.File]::WriteAllText(${lit(arqPid)}, [string]$p.Id)`;
  const t0 = Date.now();
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', lanc], { windowsHide: true, stdio: 'ignore' });
  pids.lancador = Number(fs.readFileSync(arqPid, 'utf8'));
  console.log(`lancador terminou em ${Date.now() - t0} ms`);

  const s = spawn('cmd.exe', ['/d', '/c', 'start', '""', '/min', 'powershell.exe', ...argsWorker('cmdstart')], { windowsHide: true, stdio: 'ignore' });
  s.unref();

  fs.writeFileSync(path.join(pasta, 'pids.json'), JSON.stringify(pids));
  setTimeout(() => { console.log(`iniciados ${JSON.stringify(pids)}; o "app" sai agora`); process.exit(0); }, 3000);
} else {
  const pids = JSON.parse(fs.readFileSync(path.join(pasta, 'pids.json'), 'utf8'));
  const antes = Object.fromEntries(nomes.map((n) => [n, linhas(n)]));
  setTimeout(() => {
    const r = {};
    for (const n of nomes) r[n] = { linhas: linhas(n), continuaGravando: linhas(n) > antes[n], pidVivo: pids[n] ? vivo(pids[n]) : null };
    console.log(JSON.stringify(r, null, 1));
    // limpeza
    for (const p of Object.values(pids)) { try { process.kill(p); } catch {} }
    try {
      execFileSync('powershell.exe', ['-NoProfile', '-Command',
        `Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*${worker.replace(/'/g, "''")}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`]);
    } catch {}
  }, 3000);
}
