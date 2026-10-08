// ConfigService (§3.2, Fase 2): lê, valida e grava o `.env` e o `slskd/slskd.yml` a partir do que o assistente
// (e a tela Configurações) coletou. Gera as chaves, grava a MESMA nos dois arquivos, faz backup antes de sobrescrever
// e confere o resultado com a mesma validação (S4) que o subir.bat usa.
// Segredos: lê o .env só dentro do main. O que sai (`ConfigPublica`) traz o estado de cada campo, nunca o valor de
// senha ou de chave.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statfsSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';
import type {
  AchadoEntrada,
  CampoForm,
  ConfigEntrada,
  ConfigPublica,
  EstadoCampo,
  EstadoChaveSlskd,
  InspecaoPasta,
  PastaId,
  ResultadoGravacao,
  ResultadoValidacao,
  VariavelEnv,
} from '@shared/configuracao';
import { PASTAS_ID, VARIAVEIS_ENV } from '@shared/configuracao';
import { criarErro, erroInesperado } from '@shared/erros';
import { semBom } from '@shared/texto';
import {
  atualizarEnv,
  definirChaveSlskd,
  ENV_MODELO_RESERVA,
  formatarValorEnv,
  gerarChave,
  nomeDoBackup,
  ValorInvalidoError,
  YML_MODELO_RESERVA,
  YmlInvalidoError,
} from './config-arquivos';
import { caminhoValido, ehValorExemplo, lerChaveSlskd, lerEnv, validarConfiguracao } from './config-validacao';

/** O que o serviço precisa do sistema de arquivos; os testes trocam por um falso quando precisam. */
export interface FsConfig {
  existe(caminho: string): boolean;
  ehPasta(caminho: string): boolean;
  ehArquivo(caminho: string): boolean;
  ler(caminho: string): string;
  /** grava num temporário ao lado e renomeia: um corte no meio não deixa o arquivo pela metade */
  escrever(caminho: string, texto: string): void;
  copiar(de: string, para: string): void;
  criarPasta(caminho: string): void;
  /** espaço livre e total (bytes) do disco onde a pasta existente está; null se não der para saber */
  espaco(caminho: string): { livre: number; total: number } | null;
}

export const fsReal: FsConfig = {
  existe: (p) => existsSync(p),
  ehPasta: (p) => existsSync(p) && statSync(p).isDirectory(),
  ehArquivo: (p) => existsSync(p) && statSync(p).isFile(),
  ler: (p) => semBom(readFileSync(p, 'utf8')),
  escrever(caminho, texto) {
    const tmp = `${caminho}.tmp-soulcrate`;
    writeFileSync(tmp, texto, 'utf8');
    renameSync(tmp, caminho);
  },
  copiar: (de, para) => copyFileSync(de, para),
  criarPasta: (p) => void mkdirSync(p, { recursive: true }),
  espaco(caminho) {
    try {
      const s = statfsSync(caminho);
      return { livre: Number(s.bavail) * Number(s.bsize), total: Number(s.blocks) * Number(s.bsize) };
    } catch {
      return null;
    }
  },
};

export interface DependenciasConfig {
  fs?: FsConfig;
  agora?: () => Date;
  /** gera uma chave nova (32 bytes em hexadecimal) */
  chave?: () => string;
  /** fuso horário do Windows (IANA), como o assistente o propõe */
  tzDoSistema?: () => string;
}

/** Abaixo disto, o aviso de pouco espaço na biblioteca. */
export const ESPACO_MINIMO_BYTES = 10 * 1024 ** 3;

const CHAVE_YML_EXEMPLO = 'TROQUE_POR_UMA_CHAVE_ALEATORIA';
const NOMES_PADRAO: Record<PastaId, string> = { music: 'music', downloads: 'downloads', incomplete: 'incomplete' };
// ---------------------------------------------------------------- Funções puras

/** Barras normais, sem aspas nem espaços nas pontas, sem barra no fim (menos na raiz de um disco). */
export function normalizarCaminho(valor: string): string {
  let v = valor
    .trim()
    .replace(/^"+|"+$/g, '')
    .trim();
  if (!v) return '';
  const unc = /^[\\/]{2}[^\\/]/.test(v);
  v = v.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  if (unc) v = `/${v}`;
  if (v.length > 1 && v.endsWith('/') && !/^[A-Za-z]:\/$/.test(v)) v = v.slice(0, -1);
  return v;
}

/** O .env sabe guardar esse valor (ver `formatarValorEnv`)? */
export function valorGravavel(valor: string): boolean {
  try {
    formatarValorEnv(valor);
    return true;
  } catch {
    return false;
  }
}

export function tzValido(tz: string): boolean {
  if (!tz || /\s/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function estadoDoCampo(valor: string | undefined): EstadoCampo {
  if (!valor) return 'vazio';
  return ehValorExemplo(valor) ? 'exemplo' : 'ok';
}

function noOneDrive(absoluto: string): boolean {
  return /\\OneDrive( - [^\\]+)?(\\|$)/i.test(absoluto);
}

export function ehBindAberto(valor: string | undefined): boolean {
  if (!valor) return false;
  const v = valor.toLowerCase();
  return v !== '127.0.0.1' && v !== 'localhost' && v !== '::1';
}

export function paraBarrasNormais(caminho: string): string {
  return caminho.replace(/\\/g, '/');
}

// ---------------------------------------------------------------- Serviço

export class ConfigService {
  private readonly fs: FsConfig;
  private readonly agora: () => Date;
  private readonly novaChave: () => string;
  private readonly tzDoSistema: () => string;

  constructor(dep: DependenciasConfig = {}) {
    this.fs = dep.fs ?? fsReal;
    this.agora = dep.agora ?? (() => new Date());
    this.novaChave = dep.chave ?? (() => gerarChave());
    this.tzDoSistema = dep.tzDoSistema ?? (() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  }

  // ------------------------------------------------------------ leitura

  private lerEnvDe(dir: string): Map<string, string> | null {
    const caminho = join(dir, '.env');
    if (!this.fs.ehArquivo(caminho)) return null;
    return lerEnv(this.fs.ler(caminho));
  }

  private lerChaveYml(dir: string): string | null {
    const caminho = join(dir, 'slskd', 'slskd.yml');
    if (!this.fs.ehArquivo(caminho)) return null;
    return lerChaveSlskd(this.fs.ler(caminho));
  }

  sugestoesPara(dir: string): ConfigPublica['sugestoes'] {
    const sub = (nome: string) => paraBarrasNormais(join(dir, nome));
    return {
      tz: this.tzDoSistema(),
      pastas: {
        music: sub(NOMES_PADRAO.music),
        downloads: sub(NOMES_PADRAO.downloads),
        incomplete: sub(NOMES_PADRAO.incomplete),
      },
    };
  }

  /** O que o .env e o slskd.yml da pasta têm hoje, sem nenhum segredo. */
  ler(dir: string): ConfigPublica {
    const env = this.lerEnvDe(dir);
    const chaveYml = this.lerChaveYml(dir);
    const valor = (k: string) => env?.get(k) ?? '';
    const campos = Object.fromEntries(VARIAVEIS_ENV.map((k) => [k, estadoDoCampo(valor(k))])) as Record<
      VariavelEnv,
      EstadoCampo
    >;
    // valor de exemplo (pasta, usuário…) volta em branco: o assistente propõe o seu padrão
    const texto = (k: VariavelEnv) => (campos[k] === 'ok' ? valor(k) : '');

    return {
      dir,
      envExiste: env !== null,
      ymlExiste: chaveYml !== null || this.fs.ehArquivo(join(dir, 'slskd', 'slskd.yml')),
      pastas: { music: texto('MUSIC_DIR'), downloads: texto('DOWNLOADS_DIR'), incomplete: texto('INCOMPLETE_DIR') },
      slskUsuario: texto('SLSK_USERNAME'),
      webUsuario: texto('SLSKD_WEB_USER'),
      tz: texto('TZ'),
      puid: texto('PUID'),
      pgid: texto('PGID'),
      musicbrainzContato: env?.get('MUSICBRAINZ_CONTATO') ?? '',
      abrirParaRede: ehBindAberto(env?.get('BIND_ADDR')),
      campos,
      chaveSlskd: this.estadoDaChaveSlskd(valor('SLSKD_API_KEY_SOULBEET'), chaveYml),
      sugestoes: this.sugestoesPara(dir),
    };
  }

  private estadoDaChaveSlskd(chaveEnv: string, chaveYml: string | null): EstadoChaveSlskd {
    if (!chaveYml) return 'ausente';
    if (chaveYml === CHAVE_YML_EXEMPLO) return 'exemplo';
    if (!chaveEnv || ehValorExemplo(chaveEnv)) return 'ausente';
    return chaveEnv === chaveYml ? 'ok' : 'diferentes';
  }

  // ------------------------------------------------------------ pastas

  /** O que se sabe sobre uma pasta digitada (existência, disco, espaço, OneDrive…); nunca cria nada. */
  inspecionar(
    dir: string,
    entrada: string,
    pastaId: PastaId = 'music',
    biblioteca: string | null = null,
  ): InspecaoPasta {
    const gravar = normalizarCaminho(entrada);
    const vazia: InspecaoPasta = {
      entrada,
      gravar,
      absoluto: '',
      estado: 'invalida',
      disco: null,
      livreBytes: null,
      onedrive: false,
      rede: false,
      sugestao: null,
    };
    if (!gravar || !caminhoValido(gravar)) return vazia;

    const absoluto = isAbsolute(gravar) ? resolve(gravar) : resolve(dir, gravar);
    const raiz = parse(absoluto).root;
    const rede = raiz.startsWith('\\\\');
    const base: InspecaoPasta = {
      ...vazia,
      absoluto,
      disco: rede ? raiz.replace(/\\$/, '') : raiz.replace(/[\\/]$/, '') || null,
      onedrive: noOneDrive(absoluto),
      rede,
    };

    if (this.fs.existe(absoluto)) {
      if (!this.fs.ehPasta(absoluto)) return { ...base, estado: 'e-arquivo' };
      const e = this.fs.espaco(absoluto);
      return {
        ...base,
        estado: 'existe',
        livreBytes: e?.livre ?? null,
        sugestao: this.sugerirForaDoOneDrive(dir, base, pastaId, biblioteca),
      };
    }

    // a pasta será criada: precisa que algum ancestral exista (o disco existe)
    let ancestral = dirname(absoluto);
    while (!this.fs.existe(ancestral) && dirname(ancestral) !== ancestral) ancestral = dirname(ancestral);
    if (!this.fs.existe(ancestral)) return { ...base, estado: 'invalida' };
    if (!this.fs.ehPasta(ancestral)) return { ...base, estado: 'invalida' };
    const e = this.fs.espaco(ancestral);
    return {
      ...base,
      estado: 'sera-criada',
      livreBytes: e?.livre ?? null,
      sugestao: this.sugerirForaDoOneDrive(dir, base, pastaId, biblioteca),
    };
  }

  /** Uma pasta equivalente fora do OneDrive, ao lado da biblioteca ou dentro da pasta do Soulcrate. */
  private sugerirForaDoOneDrive(
    dir: string,
    insp: InspecaoPasta,
    pastaId: PastaId,
    biblioteca: string | null,
  ): string | null {
    if (!insp.onedrive || pastaId === 'music') return null;
    const nome = NOMES_PADRAO[pastaId];
    const candidatas = [join(dirname(biblioteca ?? dir), nome), join(dir, nome)];
    for (const c of candidatas) {
      if (!noOneDrive(c) && resolve(c).toLowerCase() !== insp.absoluto.toLowerCase()) return paraBarrasNormais(c);
    }
    return null;
  }

  // ------------------------------------------------------------ validação

  validar(dir: string, entrada: ConfigEntrada): ResultadoValidacao {
    const atual = this.ler(dir);
    const achados: AchadoEntrada[] = [];
    const add = (id: string, nivel: AchadoEntrada['nivel'], campo: CampoForm, mensagem: string) =>
      achados.push({ id, nivel, campo, mensagem });

    const musicNorm = normalizarCaminho(entrada.pastas.music);
    const biblioteca = musicNorm ? resolve(dir, musicNorm) : null;
    const pastas = Object.fromEntries(
      PASTAS_ID.map((p) => [p, this.inspecionar(dir, entrada.pastas[p], p, biblioteca)]),
    ) as Record<PastaId, InspecaoPasta>;

    const nomePasta: Record<PastaId, string> = {
      music: 'a biblioteca',
      downloads: 'a pasta de downloads',
      incomplete: 'a pasta de incompletos',
    };
    for (const p of PASTAS_ID) {
      const i = pastas[p];
      const campo = `pasta.${p}` as CampoForm;
      if (!i.gravar) add('PASTA_VAZIA', 'erro', campo, `Escolha ${nomePasta[p]}.`);
      else if (!caminhoValido(i.gravar))
        add('PASTA_INVALIDA', 'erro', campo, `Esse não é um caminho válido: ${i.gravar}`);
      else if (i.estado === 'e-arquivo')
        add('PASTA_E_ARQUIVO', 'erro', campo, 'Esse caminho é um arquivo, não uma pasta.');
      else if (i.estado === 'invalida')
        add(
          'PASTA_DISCO_AUSENTE',
          'erro',
          campo,
          `Não encontrei o disco ${i.disco ?? ''} deste caminho. Conecte o disco ou escolha outro lugar.`,
        );
      if (i.onedrive) {
        add(
          'PASTA_ONEDRIVE',
          'aviso',
          campo,
          'Esta pasta está no OneDrive. A sincronização pode travar arquivos enquanto baixam. Dá para seguir assim, mas uma pasta fora do OneDrive evita falhas.',
        );
      }
      if (i.rede) {
        add(
          'PASTA_REDE',
          'aviso',
          campo,
          'Esta pasta fica na rede. O Docker Desktop pode não enxergá-la; prefira um disco deste PC.',
        );
      }
    }

    // pastas iguais: o beets moveria arquivos para cima deles mesmos, e o Soulbeet veria downloads pela metade
    const abs = (p: PastaId) => pastas[p].absoluto.toLowerCase();
    for (const [a, b] of [
      ['music', 'downloads'],
      ['music', 'incomplete'],
      ['downloads', 'incomplete'],
    ] as const) {
      if (pastas[a].absoluto && pastas[b].absoluto && abs(a) === abs(b)) {
        add(
          'PASTAS_IGUAIS',
          'erro',
          `pasta.${b}` as CampoForm,
          `${a === 'music' ? 'A biblioteca' : 'Os downloads'} e ${nomePasta[b]} precisam ser pastas diferentes.`,
        );
      }
    }

    let mesmoDisco: boolean | null = null;
    const d = pastas.downloads;
    const m = pastas.music;
    if (d.disco && m.disco && d.absoluto && m.absoluto) {
      mesmoDisco = d.disco.toLowerCase() === m.disco.toLowerCase();
      if (!mesmoDisco) {
        add(
          'PASTAS_DISCOS_DIFERENTES',
          'aviso',
          'pasta.downloads',
          `Os downloads (${d.disco}) e a biblioteca (${m.disco}) estão em discos diferentes: mover cada faixa para a biblioteca vira cópia, que é mais lento.`,
        );
      }
    }
    if (m.livreBytes !== null && m.livreBytes < ESPACO_MINIMO_BYTES) {
      add('POUCO_ESPACO', 'aviso', 'pasta.music', 'O disco da biblioteca tem menos de 10 GB livres.');
    }

    // Soulseek e Web UI
    const slskUsuario = entrada.slskUsuario.trim();
    if (!slskUsuario) add('SLSK_USUARIO_VAZIO', 'erro', 'slskUsuario', 'Informe o seu usuário do Soulseek.');
    else if (ehValorExemplo(slskUsuario))
      add('ENV_EXEMPLO', 'erro', 'slskUsuario', 'Esse é o valor de exemplo. Escolha o seu usuário.');
    else if (!valorGravavel(slskUsuario))
      add('USUARIO_NAO_SUPORTADO', 'erro', 'slskUsuario', 'Esse usuário tem símbolos que o .env não consegue guardar.');
    this.validarSenha('slsk', entrada.slskSenha, atual.campos.SLSK_PASSWORD, add);

    const webUsuario = entrada.webUsuario.trim();
    if (!webUsuario) add('WEB_USUARIO_VAZIO', 'erro', 'webUsuario', 'Informe um usuário para a interface do slskd.');
    this.validarSenha('web', entrada.webSenha, atual.campos.SLSKD_WEB_PASSWORD, add);
    if (entrada.webSenha && entrada.webSenha.length < 8) {
      add(
        'WEB_SENHA_CURTA',
        'aviso',
        'webSenha',
        'Essa senha é curta. Use pelo menos 8 caracteres (o botão Gerar senha cria uma boa).',
      );
    }

    // ajustes finos
    if (!tzValido(entrada.tz.trim()))
      add('TZ_INVALIDO', 'erro', 'tz', 'Fuso horário inválido. Use o formato America/Sao_Paulo.');
    for (const [k, campo] of [
      ['puid', 'puid'],
      ['pgid', 'pgid'],
    ] as const) {
      if (!/^\d+$/.test(entrada[k].trim()))
        add('ID_INVALIDO', 'erro', campo, `${k.toUpperCase()} precisa ser um número (ex.: 1000).`);
    }
    const contato = entrada.musicbrainzContato.trim();
    if (contato && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contato) && !/^https?:\/\//i.test(contato)) {
      add(
        'CONTATO_ESTRANHO',
        'aviso',
        'musicbrainzContato',
        'O MusicBrainz espera um e-mail ou um endereço web. Confira se digitou certo.',
      );
    }

    return { achados, pastas, mesmoDisco, ok: !achados.some((a) => a.nivel === 'erro') };
  }

  private validarSenha(
    quem: 'slsk' | 'web',
    senha: string,
    estadoAtual: EstadoCampo,
    add: (id: string, nivel: AchadoEntrada['nivel'], campo: CampoForm, mensagem: string) => void,
  ): void {
    const campo = quem === 'slsk' ? 'slskSenha' : 'webSenha';
    if (/[\r\n\0]/.test(senha)) {
      add('SENHA_COM_QUEBRA', 'erro', campo, 'A senha não pode ter quebra de linha.');
    } else if (senha && !valorGravavel(senha)) {
      add(
        'SENHA_NAO_SUPORTADA',
        'erro',
        campo,
        "Essa senha mistura aspa simples (') com outros símbolos que o .env não consegue guardar. Tire a aspa simples ou escolha outra senha.",
      );
    } else if (!senha && estadoAtual !== 'ok') {
      add(quem === 'slsk' ? 'SLSK_SENHA_VAZIA' : 'WEB_SENHA_VAZIA', 'erro', campo, 'Informe a senha.');
    } else if (senha && ehValorExemplo(senha)) {
      add('ENV_EXEMPLO', 'erro', campo, 'Essa é a senha de exemplo. Escolha a sua.');
    }
  }

  // ------------------------------------------------------------ gravação

  /**
   * Grava o .env e o slskd.yml. Tudo é calculado antes de tocar em qualquer arquivo: se algo falhar (YAML inválido,
   * valor impossível), nada é alterado. Depois: cria as pastas que faltam, faz o backup do que já existia, grava os
   * dois arquivos e confere o resultado com a validação S4.
   */
  gravar(dir: string, entrada: ConfigEntrada): ResultadoGravacao {
    const falha = (erro: ResultadoGravacao['erro']): ResultadoGravacao => ({
      ok: false,
      backups: [],
      pastasCriadas: [],
      chavesGeradas: { soulbeet: false, slskd: false },
      conferencia: null,
      erro,
    });

    const validacao = this.validar(dir, entrada);
    if (!validacao.ok) {
      const detalhes = validacao.achados
        .filter((a) => a.nivel === 'erro')
        .map((a) => `${a.id}: ${a.mensagem}`)
        .join('\n');
      return falha(
        criarErro('config.invalida', {
          problemas: validacao.achados.filter((a) => a.nivel === 'erro').length,
          detalhes,
        }),
      );
    }

    try {
      const atual = this.ler(dir);
      const envPath = join(dir, '.env');
      const ymlPath = join(dir, 'slskd', 'slskd.yml');
      const envAnterior = this.fs.ehArquivo(envPath) ? this.fs.ler(envPath) : null;
      const ymlAnterior = this.fs.ehArquivo(ymlPath) ? this.fs.ler(ymlPath) : null;
      const envMapa = envAnterior === null ? new Map<string, string>() : lerEnv(envAnterior);
      const chaveYmlAtual = ymlAnterior === null ? null : lerChaveSlskd(ymlAnterior);

      // chaves: as boas ficam (a menos que peçam novas), a faltante copia a que existe, o resto é gerado
      const geradas = { soulbeet: false, slskd: false };
      const segredoAtual = envMapa.get('SOULBEET_SECRET_KEY') ?? '';
      let segredo = segredoAtual;
      if (entrada.regenerarChaves || atual.campos.SOULBEET_SECRET_KEY !== 'ok' || segredoAtual.length < 32) {
        segredo = this.novaChave();
        geradas.soulbeet = true;
      }
      const chaveEnv = envMapa.get('SLSKD_API_KEY_SOULBEET') ?? '';
      const boaEnv = chaveEnv !== '' && !ehValorExemplo(chaveEnv);
      const boaYml = chaveYmlAtual !== null && chaveYmlAtual !== CHAVE_YML_EXEMPLO;
      let chaveSlskd: string;
      if (entrada.regenerarChaves || (!boaEnv && !boaYml) || (boaEnv && boaYml && chaveEnv !== chaveYmlAtual)) {
        chaveSlskd = this.novaChave();
        geradas.slskd = true;
      } else {
        chaveSlskd = boaEnv ? chaveEnv : (chaveYmlAtual as string);
      }

      const valores: Record<string, string | null> = {
        PUID: entrada.puid.trim(),
        PGID: entrada.pgid.trim(),
        TZ: entrada.tz.trim(),
        DOWNLOADS_DIR: validacao.pastas.downloads.gravar,
        INCOMPLETE_DIR: validacao.pastas.incomplete.gravar,
        MUSIC_DIR: validacao.pastas.music.gravar,
        SLSK_USERNAME: entrada.slskUsuario.trim(),
        SLSKD_WEB_USER: entrada.webUsuario.trim(),
      };
      // senha em branco = manter a atual, e uma linha que fica não é reescrita (nem o formato dela muda); o mesmo
      // vale para as chaves que continuam as mesmas
      if (entrada.slskSenha) valores.SLSK_PASSWORD = entrada.slskSenha;
      if (entrada.webSenha) valores.SLSKD_WEB_PASSWORD = entrada.webSenha;
      if (segredo !== segredoAtual) valores.SOULBEET_SECRET_KEY = segredo;
      if (chaveSlskd !== chaveEnv) valores.SLSKD_API_KEY_SOULBEET = chaveSlskd;
      // BIND_ADDR só muda quando o usuário mexeu no interruptor (um endereço próprio fica como está)
      if (entrada.abrirParaRede !== atual.abrirParaRede) valores.BIND_ADDR = entrada.abrirParaRede ? '0.0.0.0' : null;
      const contato = entrada.musicbrainzContato.trim();
      valores.MUSICBRAINZ_CONTATO = contato === '' ? null : contato;

      const modeloEnv = join(dir, '.env.example');
      const baseEnv = envAnterior ?? (this.fs.ehArquivo(modeloEnv) ? this.fs.ler(modeloEnv) : ENV_MODELO_RESERVA);
      const envNovo = atualizarEnv(baseEnv, valores, { BIND_ADDR: '0.0.0.0', MUSICBRAINZ_CONTATO: 'seu@email' });

      const modeloYml = join(dir, 'slskd', 'slskd.example.yml');
      const baseYml = ymlAnterior ?? (this.fs.ehArquivo(modeloYml) ? this.fs.ler(modeloYml) : YML_MODELO_RESERVA);
      const ymlNovo = definirChaveSlskd(baseYml, chaveSlskd);

      // a partir daqui mexe no disco
      const pastasCriadas: string[] = [];
      for (const p of PASTAS_ID) {
        const i = validacao.pastas[p];
        if (i.estado === 'sera-criada') {
          this.fs.criarPasta(i.absoluto);
          pastasCriadas.push(paraBarrasNormais(i.absoluto));
        }
      }

      const backups: string[] = [];
      const data = this.agora();
      const fazerBackup = (arquivo: string, existente: string | null, pasta: string): void => {
        if (existente === null) return;
        const nome = nomeDoBackup(arquivo, data, (n) => this.fs.existe(join(pasta, n)));
        this.fs.copiar(join(pasta, arquivo), join(pasta, nome));
        backups.push(nome);
      };
      fazerBackup('.env', envAnterior, dir);
      fazerBackup('slskd.yml', ymlAnterior, join(dir, 'slskd'));

      this.fs.criarPasta(join(dir, 'slskd'));
      // os dois arquivos andam juntos: se o segundo falhar, o primeiro volta ao que era
      const gravados: [string, string | null][] = [];
      try {
        this.fs.escrever(envPath, envNovo);
        gravados.push([envPath, envAnterior]);
        this.fs.escrever(ymlPath, ymlNovo);
      } catch (e) {
        for (const [caminho, anterior] of gravados) {
          if (anterior === null) continue;
          try {
            this.fs.escrever(caminho, anterior);
          } catch {
            /* o backup continua ao lado */
          }
        }
        throw e;
      }

      return {
        ok: true,
        backups,
        pastasCriadas,
        chavesGeradas: geradas,
        conferencia: validarConfiguracao(dir),
        erro: null,
      };
    } catch (e) {
      if (e instanceof YmlInvalidoError) return falha(criarErro('config.yml-invalido', { detalhes: e.message }));
      if (e instanceof ValorInvalidoError)
        return falha(criarErro('config.invalida', { problemas: 1, detalhes: e.message }));
      return falha(
        e instanceof Error && 'code' in e
          ? criarErro('config.nao-gravou', { detalhes: `${(e as NodeJS.ErrnoException).code}: ${e.message}` })
          : erroInesperado(e),
      );
    }
  }
}
