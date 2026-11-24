// OrganizacaoService: guarda como a biblioteca se organiza (o gênero e, se ligados, o subgênero e o artista), com uma
// escolha para o disco e outra para o Rekordbox, independentes (ADR 0007). As duas moram na pasta do Soulcrate, em `soulbeet/data/pastas.json`,
// porque quem usa a do disco é o plugin `pastas.py` dentro do contêiner do Soulbeet, inclusive nas importações que o
// próprio Soulbeet faz sem o app. As regras ficam em `@shared/organizacao`.
//
// A escolha do disco não move nenhum arquivo: vale para o que for importado daqui em diante. Para mudar o que já está
// no disco, a tela oferece "Reorganizar as pastas" (`beet move`, com prévia). A do Rekordbox refaz o rekordbox XML, se
// a pessoa já o criou.
import { join } from 'node:path';
import { criarErro } from '@shared/erros';
import {
  ARQUIVO_ORGANIZACAO,
  configAtende,
  configAtendeSubgenero,
  lerOrganizacoes,
  textoDasOrganizacoes,
  type AlvoDaOrganizacao,
  type EstadoOrganizacao,
  type NiveisDaOrganizacao,
  type Organizacoes,
  type ResultadoOrganizacao,
} from '@shared/organizacao';
import type { ProjetoStatus } from '@shared/stack';

export interface FsOrganizacao {
  /** o texto do arquivo; null se ele não existe ou não dá para ler */
  lerTexto(caminho: string): string | null;
  escreverAtomico(caminho: string, conteudo: string): void;
}

export interface DependenciasOrganizacao {
  projeto(): ProjetoStatus;
  fs: FsOrganizacao;
  /** a escolha do Rekordbox mudou: o rekordbox XML (se já existe) refaz a árvore */
  aoMudarRekordbox(): void;
  /** há conta do Beatport no `.env` da pasta do Soulcrate `dir` (usuário e senha preenchidos) */
  contaBeatport(dir: string): boolean;
  aoErro?(erro: unknown): void;
}

export class OrganizacaoService {
  constructor(private readonly dep: DependenciasOrganizacao) {}

  /** As escolhas atuais; null sem pasta do Soulcrate. */
  estado(): EstadoOrganizacao | null {
    const dir = this.dep.projeto().dir;
    return dir ? this.estadoEm(dir) : null;
  }

  /** O que vale na pasta do Soulcrate `dir` (o rekordbox XML usa a escolha do Rekordbox para montar a árvore). */
  organizacoes(dir: string): Organizacoes {
    return lerOrganizacoes(this.dep.fs.lerTexto(join(dir, ...ARQUIVO_ORGANIZACAO)));
  }

  /** Grava os níveis de um destino; o outro fica como estava, e as chaves que o app não conhece também. */
  definir(alvo: AlvoDaOrganizacao, niveis: NiveisDaOrganizacao): ResultadoOrganizacao {
    const dir = this.dep.projeto().dir;
    if (!dir) return { ok: false, erro: criarErro('projeto.ausente') };
    const caminho = join(dir, ...ARQUIVO_ORGANIZACAO);
    const texto = this.dep.fs.lerTexto(caminho);
    const antes = lerOrganizacoes(texto);
    try {
      this.dep.fs.escreverAtomico(caminho, textoDasOrganizacoes({ ...antes, [alvo]: { ...niveis } }, texto));
    } catch (e) {
      this.dep.aoErro?.(e);
      return { ok: false, erro: criarErro('organizacao.nao-gravou', { detalhes: `${caminho}\n${String(e)}` }) };
    }
    const mudouRekordbox = antes.rekordbox.subgenero !== niveis.subgenero || antes.rekordbox.artista !== niveis.artista;
    if (alvo === 'rekordbox' && mudouRekordbox) this.dep.aoMudarRekordbox();
    return { ok: true, estado: this.estadoEm(dir) };
  }

  private estadoEm(dir: string): EstadoOrganizacao {
    const config = this.dep.fs.lerTexto(join(dir, 'soulbeet', 'config', 'config.yaml'));
    return {
      ...this.organizacoes(dir),
      configAtende: configAtende(config),
      configAtendeSubgenero: configAtendeSubgenero(config),
      contaBeatport: this.dep.contaBeatport(dir),
    };
  }
}
