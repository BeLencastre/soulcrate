// Créditos do app (tela Sobre → "Créditos e licença"). A mesma lista da seção "Créditos" do README. O app não afirma a
// licença de cada ferramenta: o README diz que cada uma segue a própria, e o link leva ao projeto de origem.
import type { Credito } from './sobre.js';

export const CREDITOS: readonly Credito[] = [
  {
    nome: 'slskd',
    url: 'https://github.com/slskd/slskd',
    papel: 'Cliente Soulseek: busca e download, com Web UI e API',
  },
  {
    nome: 'Soulbeet',
    url: 'https://github.com/terry90/soulbeet',
    papel: 'Interface que busca no slskd e importa com o beets',
  },
  { nome: 'beets', url: 'https://github.com/beetbox/beets', papel: 'Organiza e etiqueta a biblioteca' },
  { nome: 'Navidrome', url: 'https://github.com/navidrome/navidrome', papel: 'Servidor de streaming da biblioteca' },
  {
    nome: 'libkeyfinder e keyfinder-cli',
    url: 'https://github.com/mixxxdj/libkeyfinder',
    papel: 'Detecção do tom harmônico (plugin keyfinder)',
  },
  { nome: 'beetcamp', url: 'https://github.com/snejus/beetcamp', papel: 'Metadados do Bandcamp (plugin bandcamp)' },
  { nome: 'Electron', url: 'https://www.electronjs.org', papel: 'A janela do app' },
  { nome: 'React', url: 'https://react.dev', papel: 'A interface' },
];

/** Endereço do projeto, para "código-fonte e licença". */
export const URL_DO_PROJETO = 'https://github.com/BeLencastre/soulcrate';
