// Gera os ícones do app a partir do logo do protótipo (caixote com quatro "discos" em pé):
//   resources/icon.png  (256 px)        resources/icon.ico (16–256 px, usado pelo instalador e pelo .exe)
//   resources/tray/<estado>[@escala].png (bandeja: cinza, verde, amarelo, vermelho)
//
// Sem dependências: um rasterizador pequeno (retângulos com cantos arredondados, 8x8 amostras por pixel)
// e um codificador de PNG com node:zlib. Os arquivos gerados são versionados; rode `npm run icones` só
// se o desenho mudar.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources');

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const OSSO = hex('#ECE9E3');
const SLOT = hex('#1A1204');

/** Formas na ordem de desenho (viewBox 32x32), iguais ao SVG do protótipo "Navegação lateral". */
function logo(cor, comSlot) {
  const f = [
    { x: 2, y: 9, w: 28, h: 20, r: 3, c: cor },
    { x: 6, y: 3, w: 3, h: 16, r: 1, c: OSSO },
    { x: 11, y: 5, w: 3, h: 14, r: 1, c: OSSO },
    { x: 16, y: 2, w: 3, h: 17, r: 1, c: OSSO },
    { x: 21, y: 6, w: 3, h: 13, r: 1, c: OSSO },
    { x: 2, y: 15, w: 28, h: 14, r: 3, c: cor },
  ];
  if (comSlot) f.push({ x: 11, y: 20, w: 10, h: 3, r: 1.5, c: SLOT });
  return f;
}

function dentro(f, px, py) {
  if (px < f.x || px > f.x + f.w || py < f.y || py > f.y + f.h) return false;
  const cx = px < f.x + f.r ? f.x + f.r : px > f.x + f.w - f.r ? f.x + f.w - f.r : px;
  const cy = py < f.y + f.r ? f.y + f.r : py > f.y + f.h - f.r ? f.y + f.h - f.r : py;
  return (px - cx) ** 2 + (py - cy) ** 2 <= f.r ** 2;
}

/** Devolve RGBA (Buffer) de tamanho tam x tam. */
function rasterizar(formas, tam) {
  const N = 8;
  const esc = 32 / tam;
  const out = Buffer.alloc(tam * tam * 4);
  for (let y = 0; y < tam; y++) {
    for (let x = 0; x < tam; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const px = (x + (sx + 0.5) / N) * esc;
          const py = (y + (sy + 0.5) / N) * esc;
          for (let i = formas.length - 1; i >= 0; i--) {
            if (dentro(formas[i], px, py)) {
              const [cr, cg, cb] = formas[i].c;
              r += cr;
              g += cg;
              b += cb;
              a += 1;
              break;
            }
          }
        }
      }
      const o = (y * tam + x) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
        out[o + 3] = Math.round((a / (N * N)) * 255);
      }
    }
  }
  return out;
}

function chunk(tipo, dados) {
  const t = Buffer.from(tipo, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(dados.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, dados])) >>> 0);
  return Buffer.concat([len, t, dados, crc]);
}

function png(rgba, tam) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tam, 0);
  ihdr.writeUInt32BE(tam, 4);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = 6; // RGBA
  const linhas = Buffer.alloc((tam * 4 + 1) * tam);
  for (let y = 0; y < tam; y++) {
    linhas[y * (tam * 4 + 1)] = 0; // filtro "nenhum"
    rgba.copy(linhas, y * (tam * 4 + 1) + 1, y * tam * 4, (y + 1) * tam * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(linhas, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** ICO com PNGs embutidos (aceito desde o Windows Vista). */
function ico(imagens) {
  const cab = Buffer.alloc(6);
  cab.writeUInt16LE(1, 2); // tipo: ícone
  cab.writeUInt16LE(imagens.length, 4);
  const entradas = [];
  let offset = 6 + 16 * imagens.length;
  for (const { tam, dados } of imagens) {
    const e = Buffer.alloc(16);
    e[0] = tam >= 256 ? 0 : tam;
    e[1] = tam >= 256 ? 0 : tam;
    e.writeUInt16LE(1, 4); // planos
    e.writeUInt16LE(32, 6); // bits por pixel
    e.writeUInt32LE(dados.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += dados.length;
    entradas.push(e);
  }
  return Buffer.concat([cab, ...entradas, ...imagens.map((i) => i.dados)]);
}

const AMBAR = hex('#F2B53A');
mkdirSync(join(raiz, 'tray'), { recursive: true });

// ícone do app
const formasApp = logo(AMBAR, true);
const tamanhos = [16, 24, 32, 48, 64, 128, 256];
const imagens = tamanhos.map((tam) => ({ tam, dados: png(rasterizar(formasApp, tam), tam) }));
writeFileSync(join(raiz, 'icon.ico'), ico(imagens));
writeFileSync(join(raiz, 'icon.png'), imagens[imagens.length - 1].dados);

// bandeja: cor do caixote = estado da stack (sem o "slot", que some em 16 px)
const ESTADOS = { cinza: '#6A6F78', verde: '#47C58A', amarelo: '#F2B53A', vermelho: '#FF6161' };
const ESCALAS = [
  ['', 16],
  ['@1.25x', 20],
  ['@1.5x', 24],
  ['@2x', 32],
];
for (const [nome, cor] of Object.entries(ESTADOS)) {
  const formas = logo(hex(cor), false);
  for (const [sufixo, tam] of ESCALAS) {
    writeFileSync(join(raiz, 'tray', `${nome}${sufixo}.png`), png(rasterizar(formas, tam), tam));
  }
}
console.log('Ícones gerados em', raiz);
