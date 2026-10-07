// Validação do .env e do slskd/slskd.yml (S4): a mesma regra do validar-config.ps1, em TypeScript.
// Referência das regras: docs/validacao-configuracao.md. Os dois são testados com os mesmos casos
// (tests/fixtures/config/casos.json). Mudou uma regra? Altere o script, o documento, os casos e este arquivo.
// Nunca devolve valores de senhas nem de chaves: as mensagens citam o nome da variável.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, parse, resolve } from 'node:path';
import type { AchadoConfig, ConfigStatus } from '@shared/stack';
import { semBom } from '@shared/texto';

export interface SistemaDeArquivos {
  existeArquivo(caminho: string): boolean;
  existePasta(caminho: string): boolean;
  ler(caminho: string): string;
}

export const sistemaReal: SistemaDeArquivos = {
  existeArquivo: (p) => existsSync(p) && statSync(p).isFile(),
  existePasta: (p) => existsSync(p) && statSync(p).isDirectory(),
  ler: (p) => semBom(readFileSync(p, 'utf8')),
};

const OBRIGATORIAS: Record<string, string> = {
  PUID: 'id do usuário (1000 no Windows)',
  PGID: 'id do grupo (1000 no Windows)',
  TZ: 'fuso horário, ex.: America/Sao_Paulo',
  DOWNLOADS_DIR: 'pasta dos downloads',
  INCOMPLETE_DIR: 'pasta dos downloads incompletos',
  MUSIC_DIR: 'pasta da biblioteca',
  SLSK_USERNAME: 'usuário do Soulseek',
  SLSK_PASSWORD: 'senha do Soulseek',
  SLSKD_WEB_USER: 'usuário da Web UI do slskd',
  SLSKD_WEB_PASSWORD: 'senha da Web UI do slskd',
  SOULBEET_SECRET_KEY: 'chave secreta do Soulbeet',
};

const CHAVE_YML = 'web.authentication.api_keys.soulbeet.key';

/** `.Trim().Trim('"').Trim("'")` do PowerShell: tira espaços e todas as aspas das pontas. */
function semAspas(valor: string): string {
  return valor
    .trim()
    .replace(/^"+|"+$/g, '')
    .replace(/^'+|'+$/g, '');
}

/** NOME=valor por linha; ignora o resto (comentários, linhas em branco). Igual ao baixar-lista.ps1. */
export function lerEnv(texto: string): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const linha of texto.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(linha);
    if (m?.[1] !== undefined) mapa.set(m[1], semAspas(m[2] ?? ''));
  }
  return mapa;
}

/**
 * Chave da API do slskd usada pelo Soulbeet: `web.authentication.api_keys.soulbeet.key`. Sem a entrada
 * `soulbeet`, vale a primeira linha `key:` do arquivo (o mesmo que o baixar-lista.ps1 faz).
 */
export function lerChaveSlskd(texto: string): string | null {
  const linhas = texto.split(/\r?\n/);
  let dentro = false;
  let indent = -1;
  for (const l of linhas) {
    const bloco = /^(\s*)soulbeet:\s*$/.exec(l);
    if (bloco) {
      dentro = true;
      indent = (bloco[1] ?? '').length;
      continue;
    }
    if (dentro) {
      const ident = /^(\s*)\S/.exec(l);
      if (ident && (ident[1] ?? '').length <= indent && !/^\s*#/.test(l)) {
        dentro = false;
        continue;
      }
      const k = /^\s*key:\s*(.+?)\s*$/.exec(l);
      if (k?.[1] !== undefined) return semAspas(k[1]);
    }
  }
  for (const l of linhas) {
    const k = /^\s*key:\s*(.+?)\s*$/.exec(l);
    if (k?.[1] !== undefined) return semAspas(k[1]);
  }
  return null;
}

/** O Windows recusa estes caracteres em caminhos; `:` só vale logo depois da letra do disco. */
function caminhoValido(valor: string): boolean {
  for (const ch of valor) {
    if (ch.charCodeAt(0) < 32 || '<>"|?*'.includes(ch)) return false;
  }
  const aposDisco = /^[A-Za-z]:/.test(valor) ? valor.slice(2) : valor;
  return !aposDisco.includes(':');
}

export function validarConfiguracao(raiz: string, fs: SistemaDeArquivos = sistemaReal): ConfigStatus {
  const achados: AchadoConfig[] = [];
  const add = (
    id: string,
    nivel: AchadoConfig['nivel'],
    arquivo: AchadoConfig['arquivo'],
    variavel: string | null,
    mensagem: string,
  ) => achados.push({ id, nivel, arquivo, variavel, mensagem });

  // ------------------------------------------------------------ .env
  const envPath = join(raiz, '.env');
  let cfg: Map<string, string> | null = null;
  if (!fs.existeArquivo(envPath)) {
    add('ENV_AUSENTE', 'erro', '.env', null, 'O arquivo .env não existe. Copie o .env.example para .env e preencha.');
  } else {
    cfg = lerEnv(fs.ler(envPath));
    const valor = (k: string) => cfg?.get(k) ?? '';

    for (const [k, descricao] of Object.entries(OBRIGATORIAS)) {
      if (!valor(k)) add('ENV_VAZIA', 'erro', '.env', k, `${k} está vazia ou faltando (${descricao}).`);
    }

    // valores de exemplo do .env.example (o PowerShell compara sem diferenciar maiúsculas)
    for (const [k, v] of cfg) {
      if (
        /^PREENCHA_/i.test(v) ||
        /^troque-/i.test(v) ||
        ['seu_usuario_soulseek', 'sua_senha_soulseek'].includes(v.toLowerCase())
      ) {
        add('ENV_EXEMPLO', 'erro', '.env', k, `${k} ainda tem o valor de exemplo do .env.example.`);
      }
    }

    for (const k of ['PUID', 'PGID']) {
      if (valor(k) && !/^\d+$/.test(valor(k)))
        add('ENV_ID_INVALIDO', 'erro', '.env', k, `${k} precisa ser um número (ex.: 1000).`);
    }

    // pastas: precisam existir (o Docker não cria a origem de um bind mount) e, de preferência, no mesmo disco
    const pastas = new Map<string, string>();
    for (const k of ['DOWNLOADS_DIR', 'INCOMPLETE_DIR', 'MUSIC_DIR']) {
      const v = valor(k);
      if (!v) continue;
      if (v.includes('\\')) {
        add(
          'PASTA_BARRA_INVERTIDA',
          'aviso',
          '.env',
          k,
          `${k} usa barra invertida (\\). Prefira barras normais, ex.: D:/DJ/Music.`,
        );
      }
      if (!caminhoValido(v)) {
        add('PASTA_INVALIDA', 'erro', '.env', k, `${k} não é um caminho válido: ${v}`);
        continue;
      }
      const completo = isAbsolute(v) ? resolve(v) : resolve(raiz, v);
      pastas.set(k, completo);
      if (!fs.existePasta(completo)) {
        add(
          'PASTA_INEXISTENTE',
          'erro',
          '.env',
          k,
          `A pasta de ${k} não existe: ${completo}. Crie a pasta antes de ligar a stack.`,
        );
      } else if (/\\OneDrive( - [^\\]+)?\\/i.test(completo)) {
        add(
          'PASTA_ONEDRIVE',
          'aviso',
          '.env',
          k,
          `${k} está dentro do OneDrive. A sincronização pode travar arquivos durante o download; prefira uma pasta fora dele.`,
        );
      }
    }
    const down = pastas.get('DOWNLOADS_DIR');
    const music = pastas.get('MUSIC_DIR');
    if (down && music) {
      const d1 = parse(down).root;
      const d2 = parse(music).root;
      if (d1.toLowerCase() !== d2.toLowerCase()) {
        add(
          'PASTAS_DISCOS_DIFERENTES',
          'aviso',
          '.env',
          'MUSIC_DIR',
          `DOWNLOADS_DIR (${d1}) e MUSIC_DIR (${d2}) estão em discos diferentes: mover cada faixa para a biblioteca vira cópia (mais lento).`,
        );
      }
    }

    if (valor('SOULBEET_SECRET_KEY') && valor('SOULBEET_SECRET_KEY').length < 32) {
      add(
        'CHAVE_CURTA',
        'aviso',
        '.env',
        'SOULBEET_SECRET_KEY',
        'SOULBEET_SECRET_KEY é curta: use pelo menos 32 caracteres aleatórios.',
      );
    }
    if (!valor('SLSKD_API_KEY_SOULBEET')) {
      add(
        'ENV_SEM_CHAVE_LOTE',
        'aviso',
        '.env',
        'SLSKD_API_KEY_SOULBEET',
        'SLSKD_API_KEY_SOULBEET está vazia: o download em lote vai usar a chave do slskd/slskd.yml.',
      );
    }
  }

  // ------------------------------------------------------------ slskd.yml
  const ymlPath = join(raiz, 'slskd', 'slskd.yml');
  if (!fs.existeArquivo(ymlPath)) {
    add(
      'YML_AUSENTE',
      'erro',
      'slskd/slskd.yml',
      null,
      'O arquivo slskd/slskd.yml não existe. Copie o slskd/slskd.example.yml para slskd/slskd.yml.',
    );
  } else {
    const chave = lerChaveSlskd(fs.ler(ymlPath));
    if (!chave) {
      add('YML_SEM_CHAVE', 'erro', 'slskd/slskd.yml', CHAVE_YML, 'Não achei a API key do Soulbeet no slskd/slskd.yml.');
    } else if (chave === 'TROQUE_POR_UMA_CHAVE_ALEATORIA') {
      add(
        'YML_EXEMPLO',
        'erro',
        'slskd/slskd.yml',
        CHAVE_YML,
        'A API key do slskd/slskd.yml ainda é a de exemplo. Troque pela mesma chave de SLSKD_API_KEY_SOULBEET do .env.',
      );
    } else {
      if (chave.length < 16) {
        add(
          'CHAVE_CURTA',
          'aviso',
          'slskd/slskd.yml',
          CHAVE_YML,
          'A API key do slskd é curta: use pelo menos 32 caracteres aleatórios.',
        );
      }
      const chaveEnv = cfg?.get('SLSKD_API_KEY_SOULBEET') ?? '';
      // o validar-config.ps1 compara sem diferenciar maiúsculas; aqui a comparação é exata, como o slskd faz
      if (chaveEnv && !/^troque-/i.test(chaveEnv) && chaveEnv !== chave) {
        add(
          'CHAVES_DIFERENTES',
          'erro',
          '.env',
          'SLSKD_API_KEY_SOULBEET',
          'SLSKD_API_KEY_SOULBEET (.env) é diferente da API key do slskd/slskd.yml: as duas precisam ser idênticas.',
        );
      }
    }
  }

  const erros = achados.filter((a) => a.nivel === 'erro').length;
  return { estado: erros === 0 ? 'valida' : 'invalida', erros, avisos: achados.length - erros, achados };
}

/** Código de saída equivalente ao do validar-config.ps1: 0 ok, 1 erro no .env, 2 erro só no slskd.yml. */
export function codigoDeSaida(status: ConfigStatus): 0 | 1 | 2 {
  const erros = status.achados.filter((a) => a.nivel === 'erro');
  if (erros.length === 0) return 0;
  return erros.some((a) => a.arquivo === '.env') ? 1 : 2;
}
