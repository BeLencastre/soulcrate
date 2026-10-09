// Campos de formulário da identidade (protótipos "Assistente de configuração" e "Configurações"): rótulo, dica,
// mensagens de erro e aviso ligadas ao campo (aria-describedby), senha que nunca volta do main, interruptor.
import { useId, useState, type ReactNode } from 'react';
import type { AchadoEntrada } from '@shared/configuracao';
import { msg } from '@shared/mensagens';
import { Botao, Chip } from './ui';

/** Erros (vermelho, anunciados) e avisos (laranja) de um campo. */
export function AchadosDoCampo({ id, achados }: { id: string; achados: readonly AchadoEntrada[] }) {
  if (achados.length === 0) return null;
  return (
    <ul id={id} className="m-0 flex list-none flex-col gap-1 p-0">
      {achados.map((a, i) => (
        // o `alert` fica no texto, não no <li>: um item de lista com outro papel deixa de ser item e quebra a lista
        <li
          key={`${a.id}-${i}`}
          data-achado={a.id}
          className={`text-[13px] leading-normal font-normal ${a.nivel === 'erro' ? 'text-chip-vermelho' : 'text-chip-laranja'}`}
        >
          <span role={a.nivel === 'erro' ? 'alert' : undefined}>{a.mensagem}</span>
        </li>
      ))}
    </ul>
  );
}

interface CampoProps {
  rotulo: string;
  valor: string;
  aoMudar(valor: string): void;
  dica?: string;
  mono?: boolean;
  tipo?: 'text' | 'password';
  placeholder?: string;
  achados?: readonly AchadoEntrada[];
  autoComplete?: string;
  autoFocus?: boolean;
  /** botão ao lado do campo (ex.: "Escolher…") */
  lado?: ReactNode;
  /** o campo exibe um aviso (borda laranja) */
  avisado?: boolean;
  /** marca de teste para os e2e */
  testId?: string;
}

export function Campo({
  rotulo,
  valor,
  aoMudar,
  dica,
  mono = false,
  tipo = 'text',
  placeholder,
  achados = [],
  autoComplete = 'off',
  autoFocus,
  lado,
  avisado,
  testId,
}: CampoProps) {
  const id = useId();
  const erro = achados.some((a) => a.nivel === 'erro');
  const descricao = [dica ? `${id}-dica` : null, achados.length > 0 ? `${id}-achados` : null].filter(Boolean).join(' ');
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <div className="fl min-w-0 flex-1">
          <label htmlFor={id}>{rotulo}</label>
          {dica ? (
            <span id={`${id}-dica`} className="hint">
              {dica}
            </span>
          ) : null}
          <input
            id={id}
            className={`inp ${mono ? 'font-mono' : ''}`}
            type={tipo}
            value={valor}
            placeholder={placeholder}
            autoComplete={autoComplete}
            spellCheck={false}
            autoFocus={autoFocus}
            aria-invalid={erro}
            aria-describedby={descricao || undefined}
            data-aviso={avisado === true}
            data-testid={testId}
            onChange={(e) => aoMudar(e.target.value)}
          />
        </div>
        {lado}
      </div>
      <AchadosDoCampo id={`${id}-achados`} achados={achados} />
    </div>
  );
}

/**
 * Senha: o main nunca devolve o valor, só se ela já está configurada. Configurada e em branco, o campo vira um
 * cartão "Configurada · Trocar senha"; digitar uma nova a troca; em branco ao gravar, a atual é mantida.
 */
export function CampoSenha({
  rotulo,
  configurada,
  valor,
  aoMudar,
  dica,
  achados = [],
  lado,
  forcarAberto = false,
  visivel = false,
  testId,
}: {
  rotulo: string;
  configurada: boolean;
  valor: string;
  aoMudar(valor: string): void;
  dica?: string;
  achados?: readonly AchadoEntrada[];
  lado?: ReactNode;
  /** mostra o campo mesmo configurada (acabou de gerar uma senha, por exemplo) */
  forcarAberto?: boolean;
  /** mostra os caracteres (uma senha que o app acabou de gerar) */
  visivel?: boolean;
  testId?: string;
}) {
  const [trocando, setTrocando] = useState(false);
  const aberto = !configurada || trocando || valor !== '' || forcarAberto;

  if (!aberto) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-borda bg-cartao px-4 py-[14px]">
        <Chip cor="verde">{msg.configuracoes.senhaConfigurada}</Chip>
        <span className="font-semibold">{rotulo}</span>
        <Botao pequeno className="ml-auto" onClick={() => setTrocando(true)}>
          {msg.configuracoes.trocarSenha}
        </Botao>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Campo
        rotulo={rotulo}
        valor={valor}
        aoMudar={aoMudar}
        tipo={visivel ? 'text' : 'password'}
        autoComplete="new-password"
        mono={visivel}
        achados={achados}
        {...(dica ? { dica } : {})}
        {...(lado ? { lado } : {})}
        {...(testId ? { testId } : {})}
      />
      {configurada && valor === '' ? <span className="hint">{msg.assistente.soulseek.senhaMantida}</span> : null}
    </div>
  );
}

/** Interruptor (role="switch") com título e explicação ao lado. */
export function Interruptor({
  marcado,
  aoMudar,
  titulo,
  descricao,
  desabilitado,
}: {
  marcado: boolean;
  aoMudar(valor: boolean): void;
  titulo: string;
  descricao?: string;
  desabilitado?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-[14px]">
      <input
        type="checkbox"
        role="switch"
        className="sw"
        checked={marcado}
        disabled={desabilitado}
        onChange={(e) => aoMudar(e.target.checked)}
      />
      <span className="flex flex-col gap-1">
        <span className="font-bold">{titulo}</span>
        {descricao ? <span className="hint">{descricao}</span> : null}
      </span>
    </label>
  );
}

/** Caixa de aviso laranja do protótipo (ex.: "Esta pasta está no OneDrive"). */
export function CaixaAviso({ titulo, children, acao }: { titulo?: string; children: ReactNode; acao?: ReactNode }) {
  return (
    <div
      className="flex flex-col gap-[6px] rounded-md border border-aviso-borda bg-aviso-fundo px-[14px] py-3"
      data-caixa-aviso
    >
      {titulo ? <span className="text-sm font-bold text-aviso-titulo">{titulo}</span> : null}
      <span className="text-[13px] leading-normal text-aviso-texto">{children}</span>
      {acao}
    </div>
  );
}
