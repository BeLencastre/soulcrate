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
//     "atrasoMs": 0 }                       // espera antes de responder qualquer comando (simula um Docker lento)
// Os comandos recebidos vão para <estado>.chamadas (uma linha cada), para os testes conferirem.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

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
