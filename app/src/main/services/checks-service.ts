// ChecksService: as verificações do status.bat (contêineres, plugins, pastas compartilhadas e últimas linhas do
// beets-import.log), mais os endpoints de saúde, devolvidas como verde/amarelo/vermelho para a tela Serviços.
import { join } from 'node:path';
import type { CheckEstado, CheckItem, ChecksResultado, HealthCheckResult } from '@shared/ipc';
import { SERVICOS } from '@shared/servicos';
import { servicoDe, type StackStatus } from '@shared/stack';
import type { DockerService } from './docker-service';

export interface DependenciasChecks {
  docker: DockerService;
  status(): StackStatus;
  /** últimas `n` linhas de um arquivo de texto, ou null se ele não existe */
  ultimasLinhas(arquivo: string, n: number): string[] | null;
  agora(): number;
}

const item = (texto: string, estado: CheckItem['estado']): CheckItem => ({ texto, estado });

/** O pior estado de uma lista de itens. */
export function estadoDosItens(itens: readonly CheckItem[]): CheckEstado {
  if (itens.some((i) => i.estado === 'erro')) return 'erro';
  if (itens.some((i) => i.estado === 'aviso')) return 'aviso';
  return 'ok';
}

/** `asis /downloads/Hard Techno/Omaks - Morning Rave.flac` → `Omaks - Morning Rave.flac`; outras linhas ficam como estão. */
export function resumirLinhaDoBeets(linha: string): string {
  const m = /^\S+\s+(\/.+)$/.exec(linha.trim());
  const texto = m?.[1] ? (m[1].split('/').pop() ?? m[1]) : linha.trim();
  return texto.length > 110 ? `${texto.slice(0, 107)}…` : texto;
}

/** Compara o conteúdo de /downloads visto pelo slskd e pelo Soulbeet (a regra crítica do docker-compose.yml). */
export function compararPastas(
  slskd: readonly string[],
  soulbeet: readonly string[],
): { iguais: boolean; so: string[] } {
  const a = new Set(slskd);
  const b = new Set(soulbeet);
  const diferentes = [...a].filter((x) => !b.has(x)).concat([...b].filter((x) => !a.has(x)));
  return { iguais: diferentes.length === 0, so: diferentes };
}

const linhasNaoVazias = (texto: string) =>
  texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

export class ChecksService {
  constructor(private readonly dep: DependenciasChecks) {}

  async executar(): Promise<ChecksResultado> {
    const status = this.dep.status();
    const dir = status.projeto.dir;
    const rodando = status.servicos.some((s) => s.container === 'running');
    if (!dir || !status.docker.engine || !rodando) {
      return { verificadoEm: this.dep.agora(), executado: false, checks: [] };
    }

    const [plugins, pastas] = await Promise.all([this.plugins(dir, status), this.pastas(dir, status)]);
    const checks: HealthCheckResult[] = [
      this.containers(status),
      this.endpoints(status),
      plugins,
      pastas,
      this.importacoes(dir),
    ];
    return { verificadoEm: this.dep.agora(), executado: true, checks };
  }

  private containers(status: StackStatus): HealthCheckResult {
    const itens: CheckItem[] = SERVICOS.map((s) => {
      const st = servicoDe(status, s.id);
      if (st.container !== 'running')
        return item(`${s.id} · ${st.container === 'ausente' ? 'não existe' : st.container}`, 'erro');
      if (st.saude === 'healthy') return item(`${s.id} · healthy`, 'ok');
      if (st.saude === 'starting') return item(`${s.id} · iniciando`, 'aviso');
      if (st.saude === 'unhealthy') return item(`${s.id} · unhealthy`, 'erro');
      return item(`${s.id} · rodando`, 'ok');
    });
    const estado = estadoDosItens(itens);
    return {
      id: 'containers',
      estado,
      itens,
      nota: estado === 'erro' ? 'Algum contêiner parou ou não passou no healthcheck. Veja o log dele ao lado.' : null,
    };
  }

  private endpoints(status: StackStatus): HealthCheckResult {
    const nomes = { slskd: 'slskd /health', navidrome: 'Navidrome /ping', soulbeet: 'Soulbeet raiz' } as const;
    const itens: CheckItem[] = SERVICOS.map((s) => {
      const st = servicoDe(status, s.id);
      if (st.http === true) return item(nomes[s.id], 'ok');
      if (st.http === false) return item(`${nomes[s.id]} · sem resposta`, st.saude === 'starting' ? 'aviso' : 'erro');
      return item(`${nomes[s.id]} · contêiner parado`, 'erro');
    });
    const estado = estadoDosItens(itens);
    return {
      id: 'endpoints',
      estado,
      itens,
      nota: estado === 'erro' ? 'O contêiner está de pé, mas a Web UI não respondeu em 127.0.0.1.' : null,
    };
  }

  private async plugins(dir: string, status: StackStatus): Promise<HealthCheckResult> {
    if (servicoDe(status, 'soulbeet').container !== 'running') {
      return { id: 'plugins', estado: 'erro', itens: [item('soulbeet · parado', 'erro')], nota: null };
    }
    const exec = (...cmd: string[]) => this.dep.docker.exec(dir, 'soulbeet', cmd);
    const [keyfinder, beets, lastgenre] = await Promise.all([
      exec('/usr/local/bin/keyfinder-cli', '--help'),
      exec(
        '/usr/bin/python3',
        '-c',
        "import librosa, resampy, beetsplug.bandcamp, beets; print('beets', beets.__version__, '- librosa/resampy/beetcamp OK')",
      ),
      exec('/usr/bin/python3', '-c', "import pylast, beetsplug.lastgenre; print('lastgenre ok')"),
    ]);

    const itens: CheckItem[] = [];
    // `keyfinder-cli --help` pode sair com código ≠ 0 mesmo funcionando: basta ele ter respondido com o uso
    const kfOk = keyfinder.codigo === 0 || /usage|keyfinder/i.test(keyfinder.stdout + keyfinder.stderr);
    itens.push(item('keyfinder-cli', kfOk ? 'ok' : 'erro'));
    const versao = /beets\s+(\S+)/.exec(beets.stdout)?.[1];
    if (beets.codigo === 0 && /OK/.test(beets.stdout)) {
      itens.push(item(`beets ${versao ?? ''}`.trim(), 'ok'), item('librosa, resampy, beetcamp', 'ok'));
    } else {
      itens.push(item('beets, librosa, resampy, beetcamp · não importam', 'erro'));
    }
    // o Dockerfile só avisa quando o lastgenre não importa; aqui também é um aviso
    itens.push(item('lastgenre', lastgenre.codigo === 0 && /lastgenre ok/.test(lastgenre.stdout) ? 'ok' : 'aviso'));

    const estado = estadoDosItens(itens);
    return {
      id: 'plugins',
      estado,
      itens,
      nota:
        estado === 'ok'
          ? null
          : 'A imagem do Soulbeet pode estar incompleta. Use Reconstruir no Início e acompanhe o log do build.',
    };
  }

  private async pastas(dir: string, status: StackStatus): Promise<HealthCheckResult> {
    if (servicoDe(status, 'slskd').container !== 'running' || servicoDe(status, 'soulbeet').container !== 'running') {
      return { id: 'pastas', estado: 'erro', itens: [item('slskd ou Soulbeet parado', 'erro')], nota: null };
    }
    const [a, b] = await Promise.all([
      this.dep.docker.exec(dir, 'slskd', ['ls', '-A', '/downloads']),
      this.dep.docker.exec(dir, 'soulbeet', [
        '/usr/bin/python3',
        '-c',
        "import os; print('\\n'.join(sorted(os.listdir('/downloads'))))",
      ]),
    ]);
    if (a.codigo !== 0 || b.codigo !== 0) {
      return {
        id: 'pastas',
        estado: 'erro',
        itens: [item('não consegui listar /downloads', 'erro')],
        nota: 'Um dos contêineres não respondeu ao `ls`. Veja o log dele ao lado.',
      };
    }
    const doSlskd = linhasNaoVazias(a.stdout);
    const doSoulbeet = linhasNaoVazias(b.stdout);
    const { iguais, so } = compararPastas(doSlskd, doSoulbeet);
    if (iguais) {
      return {
        id: 'pastas',
        estado: 'ok',
        itens: [
          item('/downloads igual no slskd e no Soulbeet', 'ok'),
          item(`${doSlskd.length} ${doSlskd.length === 1 ? 'item' : 'itens'}`, 'neutro'),
        ],
        nota: null,
      };
    }
    return {
      id: 'pastas',
      estado: 'erro',
      itens: [
        item('o slskd e o Soulbeet não veem o mesmo /downloads', 'erro'),
        item(`diferem: ${so.slice(0, 3).join(', ')}`, 'neutro'),
      ],
      nota: 'O /downloads precisa ser exatamente a mesma pasta nos dois contêineres. Confira DOWNLOADS_DIR no .env e use Reconstruir.',
    };
  }

  private importacoes(dir: string): HealthCheckResult {
    const linhas = this.dep.ultimasLinhas(join(dir, 'soulbeet', 'data', 'beets-import.log'), 20);
    if (!linhas || linhas.length === 0) {
      return { id: 'importacoes', estado: 'ok', itens: [item('sem importações ainda', 'neutro')], nota: null };
    }
    const faixas = linhas.filter((l) => !/^import started/i.test(l.trim()) && l.trim()).slice(-3);
    const itens = (faixas.length ? faixas : linhas.slice(-1)).map((l) => item(resumirLinhaDoBeets(l), 'neutro'));
    return { id: 'importacoes', estado: 'ok', itens, nota: null };
  }
}
