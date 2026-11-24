// RekordboxService: grava o rekordbox XML com as playlists do Soulcrate (por gênero, ou por gênero e artista, conforme
// a escolha do Rekordbox em Suas músicas, e uma por lista baixada).
// O Rekordbox lê o arquivo em Preferências › Avançado › Banco de dados › rekordbox xml; o app nunca toca no banco do
// Rekordbox, então funciona com ele aberto (ADR 0004). As regras (árvore, Location, XML) são puras, em
// `@shared/rekordbox`; aqui ficam a leitura do beets, a análise das listas e a gravação.
//
// A primeira geração é sempre pedida pelo botão. Depois dela, o arquivo existe e o app o refaz sozinho quando a
// biblioteca muda (fim de um lote, reorganizar pastas, importar o que sobrou, remover uma faixa): `atualizarSeJaExiste`.
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { criarErro, erroInesperado, type AppError } from '@shared/erros';
import type { MainEvent } from '@shared/ipc';
import { nomeDoEstado, type ListaRef, type OpcoesAnalise, type ResultadoAnalise } from '@shared/lote';
import type { NiveisDaOrganizacao } from '@shared/organizacao';
import {
  ARQUIVO_REKORDBOX_XML,
  gerarXml,
  montarArvore,
  PASTA_REKORDBOX,
  resumir,
  type EstadoRekordbox,
  type ListaParaRekordbox,
  type ResultadoRekordbox,
  type ResumoRekordbox,
} from '@shared/rekordbox';
import type { ProjetoStatus } from '@shared/stack';
import type { BibliotecaService } from './biblioteca-service';
import { fsAtualizacaoReal } from './stack-atualizacao-service';

export interface FsRekordbox {
  /** epoch ms da última gravação do arquivo; null se ele não existe */
  modificadoEm(caminho: string): number | null;
  existe(caminho: string): boolean;
  /** grava por arquivo temporário e renomeia: o Rekordbox nunca lê um arquivo pela metade */
  escreverAtomico(caminho: string, conteudo: string): void;
}

export const fsRekordboxReal: FsRekordbox = {
  modificadoEm(caminho) {
    try {
      const st = statSync(caminho);
      return st.isFile() ? st.mtimeMs : null;
    } catch {
      return null;
    }
  },
  existe: (caminho) => existsSync(caminho),
  escreverAtomico: (caminho, conteudo) => fsAtualizacaoReal.escreverAtomico(caminho, conteudo),
};

export interface DependenciasRekordbox {
  biblioteca: Pick<BibliotecaService, 'ler'>;
  listas: {
    recentes(dir: string): ListaRef[];
    analisar(
      dir: string,
      nome: string,
      opcoes: OpcoesAnalise,
      extra: { independente: boolean },
    ): Promise<ResultadoAnalise>;
  };
  projeto(): ProjetoStatus;
  /** os níveis escolhidos para o Rekordbox na pasta do Soulcrate `dir` (independentes dos do disco) */
  organizacao(dir: string): NiveisDaOrganizacao;
  fs: FsRekordbox;
  /** versão do app, no `PRODUCT` do XML */
  versao: string;
  emitir(evento: MainEvent): void;
  aoErro?(erro: unknown): void;
}

export function caminhoDoXml(dir: string): string {
  return join(dir, PASTA_REKORDBOX, ARQUIVO_REKORDBOX_XML);
}

export class RekordboxService {
  private emCurso: Promise<ResultadoRekordbox> | null = null;
  /** a biblioteca mudou enquanto uma geração rodava: refaz quando ela terminar */
  private deNovo = false;
  /** o resumo e o erro valem para este arquivo (outra pasta do Soulcrate começa sem eles) */
  private ultimo: { caminho: string; resumo: ResumoRekordbox | null; erro: AppError | null } | null = null;

  constructor(private readonly dep: DependenciasRekordbox) {}

  /** O que o cartão mostra; null sem pasta do Soulcrate. */
  estado(): EstadoRekordbox | null {
    const dir = this.dep.projeto().dir;
    if (!dir) return null;
    const caminho = caminhoDoXml(dir);
    const ultimo = this.ultimo?.caminho === caminho ? this.ultimo : null;
    return {
      caminho,
      geradoEm: this.dep.fs.modificadoEm(caminho),
      resumo: ultimo?.resumo ?? null,
      gerando: this.emCurso !== null,
      erro: ultimo?.erro ?? null,
    };
  }

  /** Gera agora (o botão). Se uma geração já está rodando, devolve o resultado dela. */
  gerar(): Promise<ResultadoRekordbox> {
    return this.emCurso ?? this.rodar();
  }

  /** A biblioteca mudou: refaz o arquivo, mas só se a pessoa já o gerou uma vez (é ela quem liga o recurso). */
  atualizarSeJaExiste(): void {
    const dir = this.dep.projeto().dir;
    if (!dir || !this.dep.fs.existe(caminhoDoXml(dir))) return;
    if (this.emCurso) {
      this.deNovo = true;
      return;
    }
    void this.rodar();
  }

  // ------------------------------------------------------------ internos

  private rodar(): Promise<ResultadoRekordbox> {
    const geracao = this.executar().finally(() => {
      this.emCurso = null;
      this.emitirEstado();
      if (this.deNovo) {
        this.deNovo = false;
        this.atualizarSeJaExiste();
      }
    });
    this.emCurso = geracao;
    this.emitirEstado();
    return geracao;
  }

  private async executar(): Promise<ResultadoRekordbox> {
    const dir = this.dep.projeto().dir;
    if (!dir) return { ok: false, erro: criarErro('projeto.ausente') };
    const caminho = caminhoDoXml(dir);
    try {
      const lida = await this.dep.biblioteca.ler();
      if (!lida.ok) return this.falhar(caminho, lida.erro);
      const { faixas, pastaMusica } = lida.leitura;
      const { listas, comFalha } = await this.lerListas(dir);
      const arvore = montarArvore(faixas, listas, this.dep.organizacao(dir));
      const xml = gerarXml({ pastaMusica, faixas, arvore, versao: this.dep.versao });
      try {
        this.dep.fs.escreverAtomico(caminho, xml);
      } catch (e) {
        this.dep.aoErro?.(e);
        return this.falhar(caminho, criarErro('rekordbox.nao-gravou', { detalhes: `${caminho}\n${String(e)}` }));
      }
      this.ultimo = { caminho, resumo: resumir(faixas, arvore, comFalha), erro: null };
      return { ok: true, estado: this.estadoDepois(caminho) };
    } catch (e) {
      this.dep.aoErro?.(e);
      return this.falhar(caminho, erroInesperado(e));
    }
  }

  /**
   * As listas que já rodaram (têm `lotes/estado-<lista>.tsv`), analisadas pelo próprio script com a biblioteca: cada
   * linha traz o `$id` da faixa que casou. Uma lista que não deu para analisar fica de fora desta vez, sem derrubar
   * o resto.
   */
  private async lerListas(dir: string): Promise<{ listas: ListaParaRekordbox[]; comFalha: string[] }> {
    const listas: ListaParaRekordbox[] = [];
    const comFalha: string[] = [];
    const jaRodaram = this.dep.listas
      .recentes(dir)
      .filter((l) => this.dep.fs.existe(join(dir, 'lotes', `estado-${nomeDoEstado(l.nome)}.tsv`)));
    for (const { nome } of jaRodaram) {
      const ids = await this.idsDaLista(dir, nome).catch((e: unknown) => {
        this.dep.aoErro?.(e);
        return null;
      });
      if (ids) listas.push({ arquivo: nome, ids });
      else comFalha.push(nome);
    }
    return { listas, comFalha };
  }

  private async idsDaLista(dir: string, nome: string): Promise<(number | null | undefined)[] | null> {
    // independente: o editor pode estar analisando a mesma lista agora, e uma não pode cancelar a outra
    const r = await this.dep.listas.analisar(dir, nome, { biblioteca: true, retentar: false }, { independente: true });
    const a = r.analise;
    if (!a.ok || !a.libraryChecked) return null;
    const linhas = a.lines.filter((l) => l.status !== 'repetida' && l.status !== 'ignorada');
    // script anterior à stack 1.4.0: a análise não diz qual faixa casou (os arquivos da stack ainda não foram atualizados)
    if (linhas.length > 0 && linhas.every((l) => !('libraryId' in l))) return null;
    return linhas.map((l) => l.libraryId);
  }

  private falhar(caminho: string, erro: AppError): ResultadoRekordbox {
    this.ultimo = { caminho, resumo: this.ultimo?.caminho === caminho ? this.ultimo.resumo : null, erro };
    return { ok: false, erro };
  }

  private estadoDepois(caminho: string): EstadoRekordbox {
    return {
      caminho,
      geradoEm: this.dep.fs.modificadoEm(caminho),
      resumo: this.ultimo?.resumo ?? null,
      gerando: false,
      erro: null,
    };
  }

  private emitirEstado(): void {
    const estado = this.estado();
    if (estado) this.dep.emitir({ type: 'rekordbox.state', estado });
  }
}
