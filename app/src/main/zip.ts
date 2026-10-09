// Escritor de .zip mínimo (formato ZIP clássico, sem ZIP64): o suficiente para o pacote de suporte (§5, Fase 6), que
// junta alguns arquivos de texto pequenos. Sem dependência nova: só `node:zlib` (deflate cru + CRC-32).
// Nomes em UTF-8 (bit 11 das flags), então o Explorer e o `Expand-Archive` abrem "relatório.txt" sem estragar o acento.
import { crc32, deflateRawSync } from 'node:zlib';

export interface EntradaZip {
  /** caminho dentro do zip, com barras normais (`logs/main.log`) */
  nome: string;
  dados: Buffer;
  /** data de modificação gravada no zip (padrão: agora) */
  data?: Date;
}

const ASSINATURA_LOCAL = 0x04034b50;
const ASSINATURA_CENTRAL = 0x02014b50;
const ASSINATURA_FIM = 0x06054b50;
const VERSAO_NECESSARIA = 20;
const FLAG_UTF8 = 0x0800;
const METODO_ARMAZENADO = 0;
const METODO_DEFLATE = 8;
const LIMITE_16_BITS = 0xffff;
const LIMITE_32_BITS = 0xffffffff;

/** Data e hora no formato do MS-DOS (2 s de resolução, a partir de 1980), que o ZIP usa. */
export function dataDos(d: Date): { data: number; hora: number } {
  const ano = Math.max(1980, d.getFullYear());
  return {
    data: ((ano - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
  };
}

function nomeValido(nome: string): boolean {
  return (
    nome.length > 0 &&
    !nome.startsWith('/') &&
    !/^[a-zA-Z]:/.test(nome) &&
    !nome.includes('\\') &&
    !nome.split('/').some((parte) => parte === '..' || parte === '')
  );
}

/** Monta o zip na memória. Recusa nomes que escapariam da pasta de destino (`..`, caminho absoluto, `\`). */
export function criarZip(entradas: readonly EntradaZip[], agora: Date = new Date()): Buffer {
  if (entradas.length >= LIMITE_16_BITS) throw new Error('Arquivos demais para um zip simples.');
  const partes: Buffer[] = [];
  const central: Buffer[] = [];
  let deslocamento = 0;

  for (const e of entradas) {
    if (!nomeValido(e.nome)) throw new Error(`Nome inválido dentro do zip: ${e.nome}`);
    const nome = Buffer.from(e.nome, 'utf8');
    const comprimido = deflateRawSync(e.dados, { level: 9 });
    // se comprimir não ajuda (arquivo vazio, já compactado), guarda como está
    const usarDeflate = comprimido.length < e.dados.length;
    const corpo = usarDeflate ? comprimido : e.dados;
    const metodo = usarDeflate ? METODO_DEFLATE : METODO_ARMAZENADO;
    const soma = crc32(e.dados);
    const { data, hora } = dataDos(e.data ?? agora);
    if (corpo.length >= LIMITE_32_BITS || e.dados.length >= LIMITE_32_BITS) throw new Error('Arquivo grande demais.');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(ASSINATURA_LOCAL, 0);
    local.writeUInt16LE(VERSAO_NECESSARIA, 4);
    local.writeUInt16LE(FLAG_UTF8, 6);
    local.writeUInt16LE(metodo, 8);
    local.writeUInt16LE(hora, 10);
    local.writeUInt16LE(data, 12);
    local.writeUInt32LE(soma, 14);
    local.writeUInt32LE(corpo.length, 18);
    local.writeUInt32LE(e.dados.length, 22);
    local.writeUInt16LE(nome.length, 26);
    local.writeUInt16LE(0, 28);

    const entradaCentral = Buffer.alloc(46);
    entradaCentral.writeUInt32LE(ASSINATURA_CENTRAL, 0);
    entradaCentral.writeUInt16LE(VERSAO_NECESSARIA, 4); // feito por
    entradaCentral.writeUInt16LE(VERSAO_NECESSARIA, 6); // necessário para extrair
    entradaCentral.writeUInt16LE(FLAG_UTF8, 8);
    entradaCentral.writeUInt16LE(metodo, 10);
    entradaCentral.writeUInt16LE(hora, 12);
    entradaCentral.writeUInt16LE(data, 14);
    entradaCentral.writeUInt32LE(soma, 16);
    entradaCentral.writeUInt32LE(corpo.length, 20);
    entradaCentral.writeUInt32LE(e.dados.length, 24);
    entradaCentral.writeUInt16LE(nome.length, 28);
    entradaCentral.writeUInt32LE(deslocamento, 42);

    partes.push(local, nome, corpo);
    central.push(entradaCentral, nome);
    deslocamento += local.length + nome.length + corpo.length;
  }

  const diretorio = Buffer.concat(central);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(ASSINATURA_FIM, 0);
  fim.writeUInt16LE(entradas.length, 8);
  fim.writeUInt16LE(entradas.length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(deslocamento, 16);
  return Buffer.concat([...partes, diretorio, fim]);
}
