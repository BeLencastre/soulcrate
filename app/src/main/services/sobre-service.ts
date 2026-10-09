// SobreService (Fase 6): o que a tela "Sobre" e o pacote de suporte mostram sobre versões. As versões da stack e dos
// componentes são lidas de quem está rodando: o slskd responde pela API, o beets pelo `beet version` dentro do
// contêiner do Soulbeet e o Navidrome pelo rótulo da imagem que o contêiner usa (as imagens têm versão fixa no compose).
// Nada disto exige a stack no ar para a tela abrir: sem ela, cada componente diz por que ficou sem versão.
import type { ContainerPs } from '../docker-parsers';
import { servicoSaudavel, type ServicoStatus, type StackStatus } from '@shared/stack';
import type { ProjetoStatus } from '@shared/stack';
import {
  versaoDaImagem,
  versaoDoBeets,
  type ComponenteVersao,
  type InfoSobre,
  type MotivoSemVersao,
} from '@shared/sobre';
import type { DockerService } from './docker-service';
import { comandoDoBeet, PASTA_DE_TRABALHO } from './biblioteca-service';

export interface VersoesDoApp {
  versao: string;
  electron: string;
  chromium: string;
  node: string;
  plataforma: string;
  arquitetura: string;
  empacotado: boolean;
}

export interface DependenciasSobre {
  docker: Pick<DockerService, 'composePs' | 'exec'>;
  health: { readonly atual: StackStatus };
  projeto(): ProjetoStatus;
  slskdVersao(): Promise<string | null>;
  /** o VERSION da pasta do Soulcrate */
  versaoDaStack(): string | null;
  /** o VERSION que este app traz embutido */
  versaoDaStackDoApp(): string | null;
  app: VersoesDoApp;
  aoErro(e: unknown): void;
}

const NOMES = { slskd: 'slskd', beets: 'Soulbeet · beets', navidrome: 'Navidrome' } as const;
const TIMEOUT_VERSAO_MS = 15_000;

function semVersao(id: ComponenteVersao['id'], motivo: MotivoSemVersao): ComponenteVersao {
  return { id, nome: NOMES[id], versao: null, fonte: null, motivo };
}

export class SobreService {
  constructor(private readonly d: DependenciasSobre) {}

  async info(): Promise<InfoSobre> {
    return {
      app: { ...this.d.app },
      stack: { instalada: this.d.versaoDaStack(), doApp: this.d.versaoDaStackDoApp() },
      componentes: await this.componentes(),
    };
  }

  /** As versões dos três componentes; uma que falha não derruba as outras. */
  async componentes(): Promise<ComponenteVersao[]> {
    const dir = this.d.projeto().dir;
    const ids = ['slskd', 'beets', 'navidrome'] as const;
    if (!dir) return ids.map((id) => semVersao(id, 'sem-pasta'));
    const status = this.d.health.atual;
    if (!status.docker.engine) return ids.map((id) => semVersao(id, 'docker-fora'));

    let ps: ContainerPs[] | null = null;
    try {
      ps = await this.d.docker.composePs(dir);
    } catch (e) {
      this.d.aoErro(e);
    }
    const noAr = (id: ServicoStatus['id']): boolean => {
      const s = status.servicos.find((x) => x.id === id);
      return s !== undefined && s.container === 'running';
    };
    const imagemDe = (servico: string): string | undefined => ps?.find((c) => c.servico === servico)?.imagem;

    const [slskd, beets] = await Promise.all([
      this.versaoDoSlskd(noAr('slskd'), imagemDe('slskd')),
      this.versaoDoBeets(dir, status),
    ]);
    const navidrome: ComponenteVersao = (() => {
      const versao = versaoDaImagem(imagemDe('navidrome'));
      if (versao) return { id: 'navidrome', nome: NOMES.navidrome, versao, fonte: 'imagem', motivo: null };
      return semVersao('navidrome', noAr('navidrome') ? 'nao-lida' : 'stack-desligada');
    })();
    return [slskd, beets, navidrome];
  }

  private async versaoDoSlskd(noAr: boolean, imagem: string | undefined): Promise<ComponenteVersao> {
    if (noAr) {
      try {
        const v = await this.d.slskdVersao();
        if (v) return { id: 'slskd', nome: NOMES.slskd, versao: v, fonte: 'conteiner', motivo: null };
      } catch (e) {
        this.d.aoErro(e);
      }
    }
    const daImagem = versaoDaImagem(imagem);
    if (daImagem) return { id: 'slskd', nome: NOMES.slskd, versao: daImagem, fonte: 'imagem', motivo: null };
    return semVersao('slskd', noAr ? 'nao-lida' : 'stack-desligada');
  }

  private async versaoDoBeets(dir: string, status: StackStatus): Promise<ComponenteVersao> {
    const soulbeet = status.servicos.find((s) => s.id === 'soulbeet');
    if (!soulbeet || soulbeet.container !== 'running' || !servicoSaudavel(soulbeet)) {
      return semVersao('beets', 'stack-desligada');
    }
    try {
      const r = await this.d.docker.exec(
        dir,
        'soulbeet',
        comandoDoBeet(['version']),
        TIMEOUT_VERSAO_MS,
        PASTA_DE_TRABALHO,
      );
      const versao = r.codigo === 0 ? versaoDoBeets(r.stdout) : null;
      if (versao) return { id: 'beets', nome: NOMES.beets, versao, fonte: 'conteiner', motivo: null };
    } catch (e) {
      this.d.aoErro(e);
    }
    return semVersao('beets', 'nao-lida');
  }
}
