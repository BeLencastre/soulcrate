// BeatportService: o "Testar login" da Conta Beatport (ADR 0007, item 7). Roda o subcomando `beet beatport-testar`
// no contêiner do Soulbeet, que faz o login e UMA busca e imprime `soulcrate-beatport: <código>`. A lógica do fluxo
// fica toda em Python (soulbeet/beets-plugins/beatport.py); aqui só se confere o ambiente e se lê o resultado.
// Usuário e senha nunca passam por aqui: o contêiner os lê das variáveis de ambiente.
import { lerResultadoDoTesteBeatport, type ResultadoTesteBeatport } from '@shared/beatport';
import { criarErro } from '@shared/erros';
import type { ProjetoStatus, StackStatus } from '@shared/stack';
import { servicoDe } from '@shared/stack';
import type { DockerService } from './docker-service';
import { comandoDoBeet, PASTA_DE_TRABALHO } from './biblioteca-service';

/** Login mais uma busca, com o freio e o ritmo do plugin: 60 s cobrem o pior caso sem deixar a tela esperando à toa. */
export const TIMEOUT_TESTE_BEATPORT_MS = 60_000;

export interface DependenciasBeatport {
  docker: Pick<DockerService, 'exec'>;
  health: { readonly atual: StackStatus; atualizar(opcoes?: { forcar?: boolean }): Promise<StackStatus> };
  projeto(): ProjetoStatus;
}

export class BeatportService {
  constructor(private readonly dep: DependenciasBeatport) {}

  async testarLogin(): Promise<ResultadoTesteBeatport> {
    let status = this.dep.health.atual;
    if (!status.docker.engine) status = await this.dep.health.atualizar();
    if (status.docker.instalacao === 'ausente') return { tipo: 'erro', erro: criarErro('docker.ausente') };
    if (status.docker.instalacao === 'fora-do-path') return { tipo: 'erro', erro: criarErro('docker.fora-do-path') };
    if (!status.docker.engine) return { tipo: 'erro', erro: criarErro('docker.fechado') };
    const dir = this.dep.projeto().dir;
    if (!dir) return { tipo: 'erro', erro: criarErro('projeto.ausente') };
    // o beets mora no contêiner do Soulbeet: sem a stack no ar não há como testar
    if (servicoDe(status, 'soulbeet').container !== 'running') {
      return { tipo: 'erro', erro: criarErro('biblioteca.stack-fora') };
    }

    const r = await this.dep.docker.exec(
      dir,
      'soulbeet',
      comandoDoBeet(['beatport-testar']),
      TIMEOUT_TESTE_BEATPORT_MS,
      PASTA_DE_TRABALHO,
    );
    if (r.erroSpawn) return { tipo: 'erro', erro: criarErro('docker.ausente') };
    if (r.tempoEsgotado) return { tipo: 'resultado', codigo: 'fora-do-ar' };
    // o código de saída do beets não importa: o contrato é a linha `soulcrate-beatport:`; sem ela, o fluxo mudou
    const codigo = lerResultadoDoTesteBeatport(`${r.stdout}\n${r.stderr}`);
    return { tipo: 'resultado', codigo };
  }
}
