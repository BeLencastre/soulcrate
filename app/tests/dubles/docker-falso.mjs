// Dublê do `docker` para testar o app sem Docker de verdade (§7: "executáveis falsos que emitem saídas gravadas").
// O app o chama como `electron docker-falso.mjs <args do docker>` (SOULCRATE_DOCKER_DUBLE, só fora do app empacotado).
//
// O "mundo" fica num JSON (SOULCRATE_DUBLE_ESTADO), que o teste lê e altera para simular o que acontece por fora
// (docker stop slskd, Docker Desktop fechado...). Os comandos mudam o mesmo arquivo, como o Docker mudaria o estado real.
//
//   { "engineProntaEm": 0,                  // epoch ms a partir do qual `docker version` responde; null = Docker fechado
//     "desktopStatus": "running",           // o que `docker desktop status` informa
//     "containers": { "slskd": { "estado": "running", "saude": "healthy" }, ... },   // ausente = não existe
//     "upFalha": null,                      // "porta": o `compose up` falha com porta em uso
//     "tempoEngineMs": 1500,                // quanto `docker desktop start` leva para a engine responder
//     "atrasoMs": 0,                        // espera antes de responder qualquer comando (simula um Docker lento)
//     "biblioteca": {                       // o beets do Soulbeet (Fase 5): `docker compose exec soulbeet … beets`
//       "musicaDir": "C:/…/music",          //   `music/` no disco: `remove -d`, `move` e `update` mexem nos arquivos de verdade
//       "downloadsDir": "C:/…/downloads",   //   `downloads/`: `import` apaga a pasta importada daqui
//       "faixas": [ { "id": 1, "artista": "Azyr", "titulo": "No Escape", "bpm": 150, "tom": "F#m",
//                     "generos": "Hard Techno", "formato": "FLAC", "bitrate": "1000kbps",
//                     "arquivo": "Hard Techno/Azyr/No Escape.flac",   // relativo a music/
//                     "destino": "…",       //   se existir: `move` leva o arquivo para lá
//                     "calcular": { "bpm": 140, "tom": "Am" } } ],   // o que `keyfinder`/`autobpm` descobrem
//       "importaveis": { "f_hard": [ { …faixa… } ] },   // o que `import -s /downloads/f_hard` traz para a biblioteca
//       "falha": null,                      //   texto: todo comando do beets falha com ele (exit 1)
//       "atrasoMs": 0 } }                   //   espera por linha de saída dos comandos longos (keyfinder, autobpm, import…)
// Os comandos recebidos vão para <estado>.chamadas (uma linha cada), para os testes conferirem.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const arquivo = process.env.SOULCRATE_DUBLE_ESTADO;
const args = process.argv.slice(2);

function ler() {
  if (!arquivo) return {};
  try {
    return JSON.parse(readFileSync(arquivo, 'utf8'));
  } catch {
    return {};
  }
}
function gravar(estado) {
  if (arquivo) writeFileSync(arquivo, JSON.stringify(estado, null, 2));
}
if (arquivo)
  appendFileSync(
    `${arquivo}.chamadas`,
    `${args.join(' ')}
`,
  );
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const SERVICOS = ['slskd', 'soulbeet', 'navidrome'];
// a imagem de cada serviço, como o `docker compose ps` a informa (a tela Sobre lê a versão do Navidrome daqui)
const IMAGENS = {
  slskd: 'slskd/slskd:0.26.0',
  soulbeet: 'local/soulbeet-dj:latest',
  navidrome: 'deluan/navidrome:0.64.2',
};
const estado = ler();
estado.containers ??= {};

const engineOk = () =>
  estado.engineProntaEm !== null && estado.engineProntaEm !== undefined && Date.now() >= estado.engineProntaEm;
const falharEngine = () => {
  console.error(
    'failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine; check if the path is correct and if the daemon is running',
  );
  process.exit(1);
};

// ---------------------------------------------------------------- beets (Fase 5)
const ANSI_VERMELHO = '\u001b[1;31m';
const ANSI_FIM = '\u001b[39;49;00m';

function termoCasa(f, termo) {
  if (termo === ',') return true;
  let negar = false;
  let t = termo;
  if (t.startsWith('^')) {
    negar = true;
    t = t.slice(1);
  }
  const i = t.indexOf(':');
  let casa;
  if (i > 0) {
    const campo = t.slice(0, i);
    const valor = t.slice(i + 1).toLowerCase();
    const mapa = {
      artist: f.artista,
      title: f.titulo,
      genres: f.generos,
      genre: f.generos,
      id: String(f.id),
      format: f.formato,
    };
    const alvo = String(mapa[campo] ?? '').toLowerCase();
    casa = campo === 'id' ? alvo === valor : alvo.includes(valor);
  } else {
    casa = `${f.artista} ${f.titulo}`.toLowerCase().includes(t.toLowerCase());
  }
  return negar ? !casa : casa;
}

const filtrar = (faixas, termos) => faixas.filter((f) => termos.every((t) => termoCasa(f, t)));

function formatar(f, formato) {
  const valores = {
    id: f.id,
    artist: f.artista,
    title: f.titulo,
    bpm: f.bpm ?? 0,
    initial_key: f.tom ?? '',
    genres: f.generos ?? '',
    format: f.formato === 'WAV' ? 'WAVE' : (f.formato ?? '').split(' ')[0],
    bitrate: f.bitrate ?? '0kbps',
    path: `/music/${f.arquivo}`,
  };
  return formato.replace(/\$([a-z_]+)/g, (m, nome) => (nome in valores ? String(valores[nome]) : m));
}

async function beets(args) {
  const atual = ler();
  const lib = atual.biblioteca ?? { faixas: [] };
  lib.faixas ??= [];
  if (lib.falha) {
    console.error(lib.falha);
    process.exit(1);
  }
  const [cmd, ...resto] = args;
  const salvar = () => {
    const c = ler();
    c.biblioteca = lib;
    gravar(c);
  };
  const noDisco = (f) => !lib.musicaDir || existsSync(join(lib.musicaDir, f.arquivo));

  if (cmd === 'version') {
    console.log('beets version 2.11.0\nPython version 3.11.2\nplugins: autobpm, keyfinder');
    return;
  }

  if (cmd === 'ls') {
    const iF = resto.indexOf('-f');
    const formato = iF >= 0 ? resto[iF + 1] : '$artist - $title';
    const termos = resto.filter((_, i) => i !== iF && i !== iF + 1);
    for (const f of filtrar(lib.faixas, termos)) console.log(formatar(f, formato));
    return;
  }

  if (cmd === 'remove') {
    const apagar = resto.includes('-d');
    const force = resto.includes('-f');
    const termos = resto.filter((o) => !o.startsWith('-'));
    const alvo = filtrar(lib.faixas, termos);
    if (alvo.length === 0) {
      console.error('error: No matching items found.');
      process.exit(1);
    }
    if (!force) {
      console.log(`Really DELETE ${alvo.length} file? (Yes/no/select) error: stdin stream ended while input required`);
      process.exit(1);
    }
    for (const f of alvo) if (apagar && lib.musicaDir) rmSync(join(lib.musicaDir, f.arquivo), { force: true });
    lib.faixas = lib.faixas.filter((f) => !alvo.includes(f));
    salvar();
    return;
  }

  if (cmd === 'update') {
    const pretend = resto.includes('-p');
    for (const f of [...lib.faixas]) {
      if (noDisco(f)) continue;
      console.log(`${f.artista} -  - ${f.titulo}`);
      console.log(`${ANSI_VERMELHO}  deleted${ANSI_FIM}`);
      if (!pretend) lib.faixas = lib.faixas.filter((x) => x !== f);
    }
    if (!pretend) salvar();
    return;
  }

  if (cmd === 'move') {
    const pretend = resto.includes('-p');
    const fora = lib.faixas.filter((f) => f.destino && f.destino !== f.arquivo);
    // como o beets: o resumo vai para o stderr e a lista das mudanças para o stdout
    console.error(
      `Moving ${fora.length} item${fora.length === 1 ? '' : 's'} (${lib.faixas.length - fora.length} already in place).`,
    );
    for (const f of fora) {
      console.log(`/music/${f.arquivo} \n  -> /music/${f.destino}`);
      if (pretend) continue;
      if (lib.musicaDir && existsSync(join(lib.musicaDir, f.arquivo))) {
        mkdirSync(dirname(join(lib.musicaDir, f.destino)), { recursive: true });
        renameSync(join(lib.musicaDir, f.arquivo), join(lib.musicaDir, f.destino));
      }
      f.arquivo = f.destino;
    }
    if (!pretend) salvar();
    return;
  }

  if (cmd === 'keyfinder' || cmd === 'autobpm') {
    for (const f of lib.faixas) {
      const campo = cmd === 'keyfinder' ? 'tom' : 'bpm';
      const falta = cmd === 'keyfinder' ? !f.tom : !f.bpm;
      if (!falta || !f.calcular?.[campo]) continue;
      await dormir(lib.atrasoMs ?? 0);
      f[campo] = f.calcular[campo];
      console.log(`${cmd}: ${cmd === 'keyfinder' ? 'found key' : 'computed BPM'} ${f[campo]} for /music/${f.arquivo}`);
    }
    salvar();
    return;
  }

  if (cmd === 'import') {
    const caminhos = resto.filter((o) => o.startsWith('/downloads/'));
    for (const c of caminhos) {
      const nome = c.slice('/downloads/'.length);
      await dormir(lib.atrasoMs ?? 0);
      console.log(`Importing as-is.\n\n${c}`);
      for (const nova of lib.importaveis?.[nome] ?? []) lib.faixas.push(nova);
      if (lib.downloadsDir) rmSync(join(lib.downloadsDir, nome), { recursive: true, force: true });
    }
    salvar();
    return;
  }

  console.error(`docker-falso: comando do beets não suportado: ${args.join(' ')}`);
  process.exit(1);
}

async function main() {
  const [cmd, ...resto] = args;
  if (estado.atrasoMs) await dormir(estado.atrasoMs); // simula um Docker lento (primeira chamada a frio)

  if (cmd === 'version') {
    if (!engineOk()) return falharEngine();
    console.log('29.0.0');
    return;
  }

  if (cmd === 'desktop') {
    const sub = resto[0];
    if (sub === 'status') {
      console.log(
        JSON.stringify({ SessionID: 'dublê', Status: engineOk() ? 'running' : (estado.desktopStatus ?? 'stopped') }),
      );
      return;
    }
    if (sub === 'start') {
      const atual = ler();
      atual.engineProntaEm = Date.now() + (atual.tempoEngineMs ?? 1500);
      atual.desktopStatus = 'running';
      gravar(atual);
      return;
    }
  }

  if (cmd !== 'compose') {
    console.error(`docker-falso: comando não suportado: ${args.join(' ')}`);
    process.exit(1);
  }

  const semGlobais = resto.filter((a, i, v) => !(a === '--progress' || v[i - 1] === '--progress'));
  const [sub, ...opts] = semGlobais;

  if (sub === 'version') {
    if (!engineOk()) return falharEngine();
    console.log('5.0.0');
    return;
  }

  if (!engineOk()) return falharEngine();

  if (sub === 'ps') {
    for (const nome of SERVICOS) {
      const c = estado.containers[nome];
      if (!c) continue;
      const status =
        c.estado === 'running' ? `Up 2 minutes${c.saude ? ` (${c.saude})` : ''}` : 'Exited (137) 1 minute ago';
      console.log(
        JSON.stringify({
          Service: nome,
          Name: nome,
          Image: IMAGENS[nome],
          State: c.estado,
          Health: c.saude ?? '',
          Status: status,
          ExitCode: c.estado === 'running' ? 0 : 137,
        }),
      );
    }
    return;
  }

  if (sub === 'up') {
    console.error('[+] Building 0.0s (0/1)');
    for (const linha of [
      ' => [soulbeet 6/9] RUN pip install --no-cache-dir -r /tmp/requirements.txt',
      ' => [soulbeet 7/9] RUN python3 /opt/fix-metadata.py',
      '#12 4.5 plugins ok - beets 2.11.0',
      '#12 4.9 lastgenre ok',
      ' => [soulbeet 9/9] COPY beets-plugins /opt/beets-plugins',
    ]) {
      console.error(linha);
      await dormir(250);
    }
    if (estado.upFalha === 'porta') {
      console.error(
        'Error response from daemon: ports are not available: exposing port TCP 127.0.0.1:5030 -> 127.0.0.1:0: listen tcp 127.0.0.1:5030: bind: Only one usage of each socket address (protocol/network address/port) is normally permitted.',
      );
      process.exit(1);
    }
    const durante = ler();
    durante.containers ??= {};
    for (const nome of SERVICOS) durante.containers[nome] = { estado: 'running', saude: 'starting' };
    gravar(durante);
    await dormir(800);
    const depois = ler();
    for (const nome of SERVICOS) depois.containers[nome] = { estado: 'running', saude: 'healthy' };
    gravar(depois);
    console.error(' ✔ Container slskd  Started');
    return;
  }

  if (sub === 'down') {
    await dormir(400);
    const depois = ler();
    depois.containers = {};
    gravar(depois);
    console.error(' ✔ Container slskd  Removed');
    return;
  }

  if (sub === 'restart') {
    await dormir(400);
    console.error(` ✔ Container ${opts[opts.length - 1]}  Started`);
    return;
  }

  if (sub === 'logs') {
    const alvo = opts.filter((o) => SERVICOS.includes(o));
    const nomes = alvo.length ? alvo : SERVICOS.filter((n) => estado.containers[n]);
    let n = 0;
    const emitir = (nome, texto) => {
      const carimbo = new Date().toISOString().replace(/Z$/, '123456Z');
      console.log(`${nome.padEnd(9)}| ${carimbo} ${texto}`);
    };
    for (const nome of nomes) {
      emitir(nome, '[INF] Iniciado');
      emitir(nome, '[WRN] Transfer from dare204: Completed, Errored');
    }
    if (!opts.includes('-f')) return;
    // como `logs -f`: fica vivo até o app encerrar o processo
    setInterval(() => nomes.forEach((nome) => emitir(nome, `[INF] batida ${++n}`)), 1000);
    await new Promise(() => undefined);
    return;
  }

  if (sub === 'exec') {
    const cmdline = opts.filter((o) => o !== '-T').join(' ');
    if (cmdline.includes('from beets.ui import main')) {
      const depois = opts.indexOf('/music/.beets_library.db');
      return beets(opts.slice(depois + 1));
    }
    if (cmdline.includes('keyfinder-cli')) return console.log('Usage: keyfinder-cli [options] <file>');
    if (cmdline.includes('import librosa')) return console.log('beets 2.11.0 - librosa/resampy/beetcamp OK');
    if (cmdline.includes('lastgenre')) return console.log('lastgenre ok');
    if (cmdline.includes('ls -A /downloads') || cmdline.includes('listdir')) return console.log('Hard Techno\nlote-1');
    console.error(`docker-falso: exec não suportado: ${cmdline}`);
    process.exit(1);
  }

  console.error(`docker-falso: comando não suportado: ${args.join(' ')}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
