// Modelo do estado do ambiente e da stack (Fase 1) e as regras que o transformam no que o usuário vê:
// o resumo (barra lateral e bandeja) e as cinco etapas do Início. Tudo puro, para testar sem Docker.
import type { ServicoId } from './servicos.js';
import { SERVICOS } from './servicos.js';

// ---------------------------------------------------------------- Docker

/** `ausente`: não achei o `docker`; `fora-do-path`: o Docker Desktop está instalado, mas o `docker` não está no PATH. */
export type DockerInstalacao = 'ok' | 'ausente' | 'fora-do-path';
/** `desconhecido`: o subcomando `docker desktop` não existe (Docker Desktop antigo); vale o que a engine disser. */
export type DockerDesktopEstado = 'aberto' | 'fechado' | 'desconhecido';

export interface DockerStatus {
  instalacao: DockerInstalacao;
  desktop: DockerDesktopEstado;
  /** a engine responde a `docker version` */
  engine: boolean;
  versaoServidor: string | null;
  /** Docker Compose v2 */
  compose: string | null;
  /** o app está abrindo o Docker Desktop e esperando a engine (SP2); `desdeMs` é o instante em que começou */
  abrindo: { desdeMs: number } | null;
}

// ---------------------------------------------------------------- Projeto e configuração

export type OrigemProjeto = 'configurada' | 'ambiente' | 'desenvolvimento' | 'padrao';

export interface ProjetoStatus {
  /** pasta do Soulcrate (a que tem o docker-compose.yml); null enquanto não há uma */
  dir: string | null;
  origem: OrigemProjeto | null;
}

export type NivelAchado = 'erro' | 'aviso';

/** Um resultado da validação do `.env` e do `slskd.yml` (mesmos ids de docs/validacao-configuracao.md). */
export interface AchadoConfig {
  id: string;
  nivel: NivelAchado;
  arquivo: '.env' | 'slskd/slskd.yml';
  variavel: string | null;
  /** nunca contém o valor de senhas nem de chaves */
  mensagem: string;
}

export type ConfigEstado = 'sem-projeto' | 'valida' | 'invalida';

export interface ConfigStatus {
  estado: ConfigEstado;
  erros: number;
  avisos: number;
  achados: AchadoConfig[];
}

// ---------------------------------------------------------------- Contêineres

export type ContainerEstado =
  'running' | 'exited' | 'restarting' | 'paused' | 'created' | 'dead' | 'removing' | 'ausente';
export type Saude = 'healthy' | 'unhealthy' | 'starting' | 'nenhuma';

export interface ServicoStatus {
  id: ServicoId;
  container: ContainerEstado;
  saude: Saude;
  /** o endpoint HTTP respondeu agora; null se não foi sondado (contêiner parado) */
  http: boolean | null;
  /** o `Status` do `docker compose ps` ("Up 2 hours (healthy)") */
  statusTexto: string | null;
}

export type OperacaoStack = 'ligando' | 'desligando' | 'reconstruindo';

export interface StackStatus {
  /** epoch ms da última sondagem concluída */
  atualizadoEm: number;
  projeto: ProjetoStatus;
  docker: DockerStatus;
  configuracao: ConfigStatus;
  servicos: ServicoStatus[];
  /** operação de ligar/desligar em andamento (feita por este app) */
  operacao: OperacaoStack | null;
}

export function servicoAusente(id: ServicoId): ServicoStatus {
  return { id, container: 'ausente', saude: 'nenhuma', http: null, statusTexto: null };
}

export function servicoDe(status: StackStatus, id: ServicoId): ServicoStatus {
  return status.servicos.find((s) => s.id === id) ?? servicoAusente(id);
}

/** Estado "padrão" antes da primeira sondagem. */
export function statusInicial(): StackStatus {
  return {
    atualizadoEm: 0,
    projeto: { dir: null, origem: null },
    docker: {
      instalacao: 'ok',
      desktop: 'desconhecido',
      engine: false,
      versaoServidor: null,
      compose: null,
      abrindo: null,
    },
    configuracao: { estado: 'sem-projeto', erros: 0, avisos: 0, achados: [] },
    servicos: SERVICOS.map((s) => servicoAusente(s.id)),
    operacao: null,
  };
}

// ---------------------------------------------------------------- Resumo (barra lateral e bandeja)

/** Cor do ícone da bandeja (e do LED da barra lateral). */
export type NivelBandeja = 'cinza' | 'verde' | 'amarelo' | 'vermelho';

export type MotivoResumo =
  | 'verificando'
  | 'operacao'
  | 'docker-ausente'
  | 'docker-fechado'
  | 'docker-abrindo'
  | 'sem-projeto'
  | 'desligada'
  | 'no-ar'
  | 'iniciando'
  | 'servico-parou'
  | 'servico-nao-responde';

export type EstadoStack = 'verificando' | 'no-ar' | 'desligada' | 'ligando' | 'atencao' | 'erro';

export interface ResumoStack {
  estado: EstadoStack;
  nivel: NivelBandeja;
  motivo: MotivoResumo;
  /** serviços citados no motivo (os que pararam ou não respondem) */
  servicos: ServicoId[];
  /** operação em andamento, quando o motivo é 'operacao' */
  operacao: OperacaoStack | null;
  saudaveis: number;
  total: number;
}

/** Um serviço conta como saudável quando está rodando, o healthcheck do compose passou e o HTTP respondeu. */
export function servicoSaudavel(s: ServicoStatus): boolean {
  return s.container === 'running' && (s.saude === 'healthy' || s.saude === 'nenhuma') && s.http !== false;
}

export function resumirStack(status: StackStatus): ResumoStack {
  const total = SERVICOS.length;
  const saudaveis = status.servicos.filter(servicoSaudavel).length;
  const base = { saudaveis, total, servicos: [] as ServicoId[], operacao: status.operacao };

  // antes da primeira sondagem não se sabe nada: não dá para dizer "Docker fechado" ainda
  if (status.atualizadoEm === 0) return { ...base, estado: 'verificando', nivel: 'cinza', motivo: 'verificando' };
  if (status.operacao) return { ...base, estado: 'ligando', nivel: 'amarelo', motivo: 'operacao' };
  if (status.docker.abrindo) return { ...base, estado: 'ligando', nivel: 'amarelo', motivo: 'docker-abrindo' };
  if (status.docker.instalacao !== 'ok')
    return { ...base, estado: 'erro', nivel: 'vermelho', motivo: 'docker-ausente' };
  if (!status.docker.engine) return { ...base, estado: 'erro', nivel: 'vermelho', motivo: 'docker-fechado' };
  if (!status.projeto.dir) return { ...base, estado: 'atencao', nivel: 'amarelo', motivo: 'sem-projeto' };

  const rodando = status.servicos.filter((s) => s.container === 'running' || s.container === 'restarting');
  if (rodando.length === 0) return { ...base, estado: 'desligada', nivel: 'cinza', motivo: 'desligada' };

  // alguma coisa está de pé: o que falta ou não responde é um problema (docker stop slskd por fora cai aqui)
  const pararam = status.servicos.filter((s) => s.container !== 'running').map((s) => s.id);
  if (pararam.length > 0) {
    return { ...base, estado: 'erro', nivel: 'vermelho', motivo: 'servico-parou', servicos: pararam };
  }

  const naoResponde = status.servicos.filter(
    (s) => s.saude === 'unhealthy' || (s.saude !== 'starting' && s.http === false),
  );
  if (naoResponde.length > 0) {
    return {
      ...base,
      estado: 'erro',
      nivel: 'vermelho',
      motivo: 'servico-nao-responde',
      servicos: naoResponde.map((s) => s.id),
    };
  }
  if (status.servicos.some((s) => s.saude === 'starting')) {
    return { ...base, estado: 'ligando', nivel: 'amarelo', motivo: 'iniciando' };
  }
  return { ...base, estado: 'no-ar', nivel: 'verde', motivo: 'no-ar' };
}

// ---------------------------------------------------------------- Etapas do Início

export type EtapaId = 'docker' | 'desktop' | 'configuracao' | 'stack' | 'servicos';
export type EtapaEstado = 'ok' | 'erro' | 'aguardando' | 'trabalhando' | 'desligada' | 'atencao';

/** Ação que o cartão oferece; o renderer liga cada uma a uma chamada de IPC ou a uma rota. */
export type EtapaAcao =
  'baixarDocker' | 'abrirDockerDesktop' | 'escolherPasta' | 'abrirConfiguracoes' | 'ligar' | 'verServicos';

/** Chave do texto de detalhe do cartão (em mensagens.ts). */
export type EtapaDetalhe =
  | 'verificando'
  | 'docker-ok'
  | 'docker-ausente'
  | 'docker-fora-do-path'
  | 'desktop-ok'
  | 'desktop-fechado'
  | 'desktop-abrindo'
  | 'desktop-aguardando'
  | 'config-ok'
  | 'config-ok-avisos'
  | 'config-invalida'
  | 'config-sem-projeto'
  | 'stack-ok'
  | 'stack-desligada'
  | 'stack-ligando'
  | 'stack-parcial'
  | 'stack-aguardando'
  | 'servicos-aguardando'
  | 'servicos';

export interface Etapa {
  id: EtapaId;
  numero: number;
  estado: EtapaEstado;
  detalhe: EtapaDetalhe;
  acao: EtapaAcao | null;
}

/** As cinco etapas do cartão do Início (§5, Fase 1). */
export function derivarEtapas(status: StackStatus): Etapa[] {
  if (status.atualizadoEm === 0) {
    const aguardando = (id: EtapaId, numero: number): Etapa => ({
      id,
      numero,
      estado: 'aguardando',
      detalhe: 'verificando',
      acao: null,
    });
    return [
      aguardando('docker', 1),
      aguardando('desktop', 2),
      aguardando('configuracao', 3),
      aguardando('stack', 4),
      aguardando('servicos', 5),
    ];
  }
  const d = status.docker;
  const instalado = d.instalacao === 'ok';
  const engineOk = instalado && d.engine;
  const resumo = resumirStack(status);
  const rodando = status.servicos.filter((s) => s.container === 'running').length;

  const e1: Etapa = instalado
    ? { id: 'docker', numero: 1, estado: 'ok', detalhe: 'docker-ok', acao: null }
    : {
        id: 'docker',
        numero: 1,
        estado: 'erro',
        detalhe: d.instalacao === 'fora-do-path' ? 'docker-fora-do-path' : 'docker-ausente',
        acao: 'baixarDocker',
      };

  let e2: Etapa;
  if (!instalado) e2 = { id: 'desktop', numero: 2, estado: 'aguardando', detalhe: 'desktop-aguardando', acao: null };
  else if (engineOk) e2 = { id: 'desktop', numero: 2, estado: 'ok', detalhe: 'desktop-ok', acao: null };
  else if (d.abrindo) e2 = { id: 'desktop', numero: 2, estado: 'trabalhando', detalhe: 'desktop-abrindo', acao: null };
  else e2 = { id: 'desktop', numero: 2, estado: 'erro', detalhe: 'desktop-fechado', acao: 'abrirDockerDesktop' };

  let e3: Etapa;
  if (status.configuracao.estado === 'sem-projeto') {
    e3 = { id: 'configuracao', numero: 3, estado: 'erro', detalhe: 'config-sem-projeto', acao: 'escolherPasta' };
  } else if (status.configuracao.estado === 'valida') {
    const avisos = status.configuracao.avisos > 0;
    e3 = {
      id: 'configuracao',
      numero: 3,
      estado: avisos ? 'atencao' : 'ok',
      detalhe: avisos ? 'config-ok-avisos' : 'config-ok',
      acao: avisos ? 'abrirConfiguracoes' : null,
    };
  } else {
    e3 = { id: 'configuracao', numero: 3, estado: 'erro', detalhe: 'config-invalida', acao: 'abrirConfiguracoes' };
  }

  let e4: Etapa;
  if (!engineOk || !status.projeto.dir) {
    e4 = { id: 'stack', numero: 4, estado: 'aguardando', detalhe: 'stack-aguardando', acao: null };
  } else if (status.operacao) {
    e4 = { id: 'stack', numero: 4, estado: 'trabalhando', detalhe: 'stack-ligando', acao: null };
  } else if (rodando === 0) {
    e4 = { id: 'stack', numero: 4, estado: 'desligada', detalhe: 'stack-desligada', acao: 'ligar' };
  } else if (rodando < SERVICOS.length) {
    e4 = { id: 'stack', numero: 4, estado: 'erro', detalhe: 'stack-parcial', acao: 'ligar' };
  } else {
    e4 = { id: 'stack', numero: 4, estado: 'ok', detalhe: 'stack-ok', acao: null };
  }

  let e5: Etapa;
  if (e4.estado === 'desligada' || e4.estado === 'aguardando' || e4.estado === 'trabalhando') {
    e5 = { id: 'servicos', numero: 5, estado: 'aguardando', detalhe: 'servicos-aguardando', acao: null };
  } else if (resumo.estado === 'no-ar') {
    e5 = { id: 'servicos', numero: 5, estado: 'ok', detalhe: 'servicos', acao: null };
  } else if (resumo.estado === 'ligando') {
    e5 = { id: 'servicos', numero: 5, estado: 'trabalhando', detalhe: 'servicos', acao: null };
  } else {
    e5 = { id: 'servicos', numero: 5, estado: 'erro', detalhe: 'servicos', acao: 'verServicos' };
  }

  return [e1, e2, e3, e4, e5];
}

/** O que cada botão do cabeçalho do Início pode fazer agora. */
export interface AcoesStack {
  ligar: boolean;
  desligar: boolean;
  reconstruir: boolean;
}

export function acoesDisponiveis(status: StackStatus): AcoesStack {
  const pronto =
    status.atualizadoEm > 0 &&
    status.docker.instalacao === 'ok' &&
    status.docker.engine &&
    status.projeto.dir !== null &&
    !status.operacao;
  const algumRodando = status.servicos.some((s) => s.container !== 'ausente' && s.container !== 'exited');
  const todosRodando = status.servicos.every((s) => s.container === 'running');
  return {
    ligar: pronto && !todosRodando,
    desligar: pronto && algumRodando,
    reconstruir: pronto,
  };
}
