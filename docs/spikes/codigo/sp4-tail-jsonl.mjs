// SP4 — acompanhar (tail) o arquivo de eventos JSONL enquanto o PowerShell escreve.
//
// Uso: node sp4-tail-jsonl.mjs <pasta> [quantidade]
//
// Um PowerShell grava <quantidade> eventos com o MESMO metodo do baixar-lista.ps1
// ([IO.File]::AppendAllText, UTF-8 sem BOM, uma linha por chamada), com texto acentuado e
// pausas irregulares. Ao mesmo tempo, o LeitorJsonl abaixo le o arquivo por offset.
// No fim, confere: nenhuma linha perdida, nenhuma repetida, nenhum JSON quebrado.
// Resultado e conclusoes: docs/spikes/sp4-tail-jsonl.md

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------- o leitor (candidato para o app)
export class LeitorJsonl {
  /** @param {string} arquivo  @param {(evento: any) => void} aoLer  @param {(erro: Error, linha: string) => void} aoErrar */
  constructor(arquivo, aoLer, aoErrar = () => {}, { intervaloMs = 500, usarWatch = true } = {}) {
    Object.assign(this, { arquivo, aoLer, aoErrar, intervaloMs, usarWatch });
    this.offset = 0;
    this.resto = Buffer.alloc(0); // pedaco de linha sem \n (ainda sendo gravado)
    this.lendo = false;
    this.pendente = false;
    this.stats = { leituras: 0, porWatch: 0, porTimer: 0, linhasPartidas: 0 };
  }
  iniciar() {
    // fs.watch avisa rapido, mas no Windows pode juntar ou perder avisos: o timer garante
    if (this.usarWatch) try { this.watcher = fs.watch(path.dirname(this.arquivo), (_, nome) => { if (!nome || nome === path.basename(this.arquivo)) this.ler('watch'); }); } catch {}
    this.timer = setInterval(() => this.ler('timer'), this.intervaloMs);
    this.ler('timer');
  }
  parar() { this.watcher?.close(); clearInterval(this.timer); return this.ler('timer'); }

  async ler(origem) {
    if (this.lendo) { this.pendente = true; return; }
    this.lendo = true;
    try {
      do {
        this.pendente = false;
        let st;
        try { st = await fs.promises.stat(this.arquivo); } catch { return; } // ainda nao existe
        if (st.size < this.offset) { this.offset = 0; this.resto = Buffer.alloc(0); } // arquivo recriado
        if (st.size === this.offset) continue;
        const fh = await fs.promises.open(this.arquivo, 'r');
        try {
          const buf = Buffer.alloc(st.size - this.offset);
          const { bytesRead } = await fh.read(buf, 0, buf.length, this.offset);
          this.offset += bytesRead;
          this.stats.leituras++; origem === 'watch' ? this.stats.porWatch++ : this.stats.porTimer++;
          this.processar(buf.subarray(0, bytesRead));
        } finally { await fh.close(); }
      } while (this.pendente);
    } finally { this.lendo = false; }
  }

  processar(novos) {
    let dados = this.resto.length ? Buffer.concat([this.resto, novos]) : novos;
    let ini = 0, i;
    // corta por byte \n: em UTF-8, o \n nunca aparece no meio de um caractere acentuado
    while ((i = dados.indexOf(0x0a, ini)) !== -1) {
      let linha = dados.subarray(ini, i).toString('utf8');
      ini = i + 1;
      if (linha.charCodeAt(0) === 0xfeff) linha = linha.slice(1); // tolera BOM
      linha = linha.trim();
      if (!linha) continue;
      try { this.aoLer(JSON.parse(linha)); } catch (e) { this.aoErrar(e, linha); }
    }
    this.resto = Buffer.from(dados.subarray(ini));
    if (this.resto.length) this.stats.linhasPartidas++;
  }
}

// ---------------------------------------------------------------- o experimento
const executado = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (executado) {
  const pasta = path.resolve(process.argv[2] ?? '.');
  const total = Number(process.argv[3] ?? 3000);
  const usarWatch = process.argv[4] !== 'sem-watch';
  fs.mkdirSync(pasta, { recursive: true });
  const arq = path.join(pasta, 'eventos.jsonl');
  fs.rmSync(arq, { force: true });
  const escritor = path.join(pasta, 'escritor.ps1');
  fs.writeFileSync(escritor, '﻿' + [
    'param([string]$Arquivo, [int]$Total)',
    '$utf8 = New-Object Text.UTF8Encoding $false',
    '$r = New-Object Random 7',
    'for ($n = 1; $n -le $Total; $n++) {',
    '  $e = [ordered]@{ v = 1; t = (Get-Date).ToString("o"); type = "item.status"; n = $n; line = "Byørn – 2 LOUD ($n) áéíõç"; pad = ("x" * $r.Next(0, 3000)) }',
    '  [IO.File]::AppendAllText($Arquivo, (ConvertTo-Json -InputObject $e -Compress) + "`n", $utf8)',
    '  if ($r.Next(0, 50) -eq 0) { Start-Sleep -Milliseconds $r.Next(1, 120) }',
    '}',
  ].join('\r\n'));

  const vistos = new Set(); let repetidos = 0, quebrados = 0, foraDeOrdem = 0, ultimo = 0;
  const leitor = new LeitorJsonl(arq, (e) => {
    if (vistos.has(e.n)) repetidos++; vistos.add(e.n);
    if (e.n !== ultimo + 1) foraDeOrdem++; ultimo = e.n;
    if (!e.line.includes('Byørn – 2 LOUD')) quebrados++;
  }, () => quebrados++, { intervaloMs: 250, usarWatch });
  leitor.iniciar();
  const t0 = Date.now();
  const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', escritor, '-Arquivo', arq, '-Total', String(total)], { windowsHide: true, stdio: 'ignore' });
  p.on('exit', async (code) => {
    await new Promise((r) => setTimeout(r, 600));
    await leitor.parar();
    console.log(JSON.stringify({
      escritorSaiu: code, segundos: (Date.now() - t0) / 1000, esperados: total, lidos: vistos.size,
      perdidos: total - vistos.size, repetidos, foraDeOrdem, quebrados, restoPendente: leitor.resto.length, ...leitor.stats,
    }, null, 1));
  });
}
