// Alguns comparadores de DOM no estilo do jest-dom (que o projeto não usa): só os que os testes das telas do lote
// precisam, para as asserções ficarem curtas e as mensagens de falha dizerem o que havia na tela.
import { expect } from 'vitest';

const compactar = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();

interface Comparadores<R = unknown> {
  /** o texto do elemento (espaços compactados) contém a string, ou casa com a regex */
  toHaveTextContent(esperado: string | RegExp): R;
  toHaveAttribute(nome: string, valor?: string): R;
  toBeInTheDocument(): R;
  toBeDisabled(): R;
  toBeEnabled(): R;
  toHaveValue(valor: string): R;
  toBeChecked(): R;
}

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-object-type -- a forma que o Vitest pede para estender
  interface Matchers<R extends void | Promise<void>, T> extends Comparadores<R> {}
}

const comoElemento = (v: unknown): Element => {
  if (!(v instanceof Element)) throw new Error(`esperava um elemento do DOM, veio ${String(v)}`);
  return v;
};

expect.extend({
  toHaveTextContent(recebido: unknown, esperado: string | RegExp) {
    const texto = compactar(comoElemento(recebido).textContent);
    const pass = typeof esperado === 'string' ? texto.includes(esperado) : esperado.test(texto);
    return {
      pass,
      message: () => `texto ${pass ? 'não deveria conter' : 'deveria conter'} ${String(esperado)}, mas é: "${texto}"`,
    };
  },
  toHaveAttribute(recebido: unknown, nome: string, valor?: string) {
    const el = comoElemento(recebido);
    const atual = el.getAttribute(nome);
    const pass = valor === undefined ? atual !== null : atual === valor;
    return {
      pass,
      message: () =>
        `atributo ${nome}: esperava ${valor ?? '(qualquer)'}, veio ${atual === null ? '(ausente)' : `"${atual}"`}`,
    };
  },
  toBeInTheDocument(recebido: unknown) {
    const el = comoElemento(recebido);
    return { pass: el.ownerDocument.contains(el), message: () => 'o elemento não está no documento' };
  },
  toBeDisabled(recebido: unknown) {
    const el = comoElemento(recebido) as HTMLButtonElement;
    return { pass: el.disabled, message: () => `esperava desabilitado: ${el.outerHTML.slice(0, 120)}` };
  },
  toBeEnabled(recebido: unknown) {
    const el = comoElemento(recebido) as HTMLButtonElement;
    return { pass: !el.disabled, message: () => `esperava habilitado: ${el.outerHTML.slice(0, 120)}` };
  },
  toBeChecked(recebido: unknown) {
    const el = comoElemento(recebido) as HTMLInputElement;
    return { pass: el.checked, message: () => `esperava marcado: ${el.outerHTML.slice(0, 120)}` };
  },
  toHaveValue(recebido: unknown, valor: string) {
    const el = comoElemento(recebido) as HTMLInputElement;
    return { pass: el.value === valor, message: () => `valor: esperava "${valor}", veio "${el.value}"` };
  },
});
