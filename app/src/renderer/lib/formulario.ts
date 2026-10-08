// Ajudantes dos formulários de configuração (assistente e Configurações): validação com debounce no main,
// leitura dos achados por campo e utilitários de caminho e senha. Nada aqui guarda segredo além do valor que o
// usuário digitou no campo, que sai do renderer uma vez, na gravação.
import { useEffect, useRef, useState } from 'react';
import type { AchadoEntrada, CampoForm, ConfigEntrada, ResultadoValidacao } from '@shared/configuracao';
import { api } from './api';

const ATRASO_VALIDACAO_MS = 250;

/**
 * Valida o formulário no main (pastas, discos, OneDrive…) alguns instantes depois da última mudança. Respostas
 * velhas são descartadas: só vale a da última entrada enviada. `validarAgora` não espera o atraso: é o que o botão
 * Avançar usa, para nunca decidir com uma validação velha (ou ainda não chegada).
 */
export function useValidacao(
  entrada: ConfigEntrada | null,
  ativo = true,
): { validacao: ResultadoValidacao | null; validarAgora(): Promise<ResultadoValidacao | null> } {
  const [resultado, setResultado] = useState<ResultadoValidacao | null>(null);
  const ultima = useRef(0);
  const entradaAtual = useRef(entrada);
  useEffect(() => {
    entradaAtual.current = entrada;
  });

  useEffect(() => {
    if (!entrada || !ativo) return;
    const numero = ++ultima.current;
    const t = setTimeout(() => {
      api.config
        .validate(entrada)
        .then((r) => {
          if (numero === ultima.current) setResultado(r);
        })
        .catch((e: unknown) => console.error('config.validate falhou:', e));
    }, ATRASO_VALIDACAO_MS);
    return () => clearTimeout(t);
  }, [entrada, ativo]);

  async function validarAgora(): Promise<ResultadoValidacao | null> {
    const e = entradaAtual.current;
    if (!e) return null;
    const numero = ++ultima.current;
    try {
      const r = await api.config.validate(e);
      if (numero === ultima.current) setResultado(r);
      return r;
    } catch (erro) {
      console.error('config.validate falhou:', erro);
      return null;
    }
  }

  return { validacao: resultado, validarAgora };
}

export function achadosDe(v: ResultadoValidacao | null, campos: readonly CampoForm[]): AchadoEntrada[] {
  return v ? v.achados.filter((a) => campos.includes(a.campo)) : [];
}

/** Os avisos sempre aparecem; os erros só quando `mostrarErros` (o assistente não grita "campo vazio" antes de o usuário tentar avançar). */
export function achadosVisiveis(
  v: ResultadoValidacao | null,
  campos: readonly CampoForm[],
  mostrarErros = true,
): AchadoEntrada[] {
  return achadosDe(v, campos).filter((a) => mostrarErros || a.nivel === 'aviso');
}

export function temErro(v: ResultadoValidacao | null, campos: readonly CampoForm[]): boolean {
  return achadosDe(v, campos).some((a) => a.nivel === 'erro');
}

/** Pasta-mãe de um caminho com barras normais ("D:/Musica/music" → "D:/Musica"); '' se não houver. */
export function paiDoCaminho(caminho: string): string {
  const c = caminho.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  const i = c.lastIndexOf('/');
  if (i <= 0) return '';
  const pai = c.slice(0, i);
  return /^[A-Za-z]:$/.test(pai) ? `${pai}/` : pai;
}

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** Senha aleatória (20 letras e números, sem os que se confundem) com a fonte criptográfica do navegador. */
export function gerarSenha(tamanho = 20): string {
  const bytes = new Uint32Array(tamanho);
  crypto.getRandomValues(bytes);
  // descarta o viés do módulo: 2^32 não é múltiplo do tamanho do alfabeto
  const limite = Math.floor(0x1_0000_0000 / ALFABETO.length) * ALFABETO.length;
  let saida = '';
  for (const b of bytes) {
    let n = b;
    while (n >= limite) n = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
    saida += ALFABETO[n % ALFABETO.length];
  }
  return saida;
}

/** `2026-10-07` no horário local: o sufixo dos backups. */
export function dataDeHoje(agora = new Date()): string {
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}`;
}
