// As seções do formulário de configuração. O assistente (um passo por seção) e a tela Configurações (uma aba por
// seção) usam as mesmas peças: "Tela Configurações reaproveita os passos do assistente para editar depois" (§5, Fase 2).
import { useState } from 'react';
import {
  formatarEspaco,
  type AchadoEntrada,
  type CampoForm,
  type ConfigEntrada,
  type ConfigPublica,
  type InspecaoPasta,
  type PastaId,
  type PortaStatus,
  type ResultadoValidacao,
} from '@shared/configuracao';
import { msg } from '@shared/mensagens';
import { seguro } from '../lib/acoes';
import { api } from '../lib/api';
import { achadosVisiveis, gerarSenha, paiDoCaminho } from '../lib/formulario';
import { AchadosDoCampo, CaixaAviso, Campo, CampoSenha, Interruptor } from './campos';
import { Botao, Cartao, Chip } from './ui';

export interface PropsSecao {
  entrada: ConfigEntrada;
  aoMudar(parcial: Partial<ConfigEntrada>): void;
  config: ConfigPublica;
  validacao: ResultadoValidacao | null;
  /** mostra os erros dos campos (padrão: sim); o assistente só os mostra depois de o usuário tentar avançar */
  mostrarErros?: boolean;
}

// ---------------------------------------------------------------- Pastas

const CAMPO_DA_PASTA: Record<PastaId, 'pasta.music' | 'pasta.downloads' | 'pasta.incomplete'> = {
  music: 'pasta.music',
  downloads: 'pasta.downloads',
  incomplete: 'pasta.incomplete',
};

function ChipsDaPasta({
  id,
  insp,
  validacao,
}: {
  id: PastaId;
  insp: InspecaoPasta | undefined;
  validacao: ResultadoValidacao | null;
}) {
  if (!insp || insp.estado === 'invalida' || insp.estado === 'e-arquivo' || !insp.gravar) return null;
  const pouco = validacao?.achados.some((a) => a.id === 'POUCO_ESPACO' && a.campo === CAMPO_DA_PASTA[id]) ?? false;
  const livre = insp.livreBytes === null ? null : formatarEspaco(insp.livreBytes);
  const alterado = insp.gravar !== insp.entrada.trim() ? insp.gravar : null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {insp.estado === 'sera-criada' ? <Chip cor="neutro">{msg.assistente.pastas.seraCriada}</Chip> : null}
      {id === 'music' && insp.disco ? (
        <Chip cor={pouco ? 'laranja' : 'verde'}>{msg.assistente.pastas.disco(insp.disco, livre)}</Chip>
      ) : null}
      {id === 'downloads' && validacao?.mesmoDisco !== null && validacao?.mesmoDisco !== undefined ? (
        <Chip cor={validacao.mesmoDisco ? 'verde' : 'laranja'}>
          {validacao.mesmoDisco ? msg.assistente.pastas.mesmoDisco : msg.assistente.pastas.outroDisco}
        </Chip>
      ) : null}
      {alterado ? (
        <span className="font-mono text-xs text-texto-mudo">{msg.assistente.pastas.gravadoComo(alterado)}</span>
      ) : null}
    </div>
  );
}

function AvisosDaPasta({
  achados,
  insp,
  usarSugestao,
}: {
  achados: readonly AchadoEntrada[];
  insp: InspecaoPasta | undefined;
  usarSugestao(caminho: string): void;
}) {
  const avisos = achados.filter(
    (a) => a.nivel === 'aviso' && a.id !== 'POUCO_ESPACO' && a.id !== 'PASTAS_DISCOS_DIFERENTES',
  );
  const pouco = achados.filter((a) => a.id === 'POUCO_ESPACO' || a.id === 'PASTAS_DISCOS_DIFERENTES');
  return (
    <>
      {avisos.map((a) => (
        <CaixaAviso
          key={a.id}
          {...(a.id === 'PASTA_ONEDRIVE' ? { titulo: msg.assistente.pastas.onedriveTitulo } : {})}
          acao={
            a.id === 'PASTA_ONEDRIVE' && insp?.sugestao ? (
              <Botao pequeno className="self-start" onClick={() => usarSugestao(insp.sugestao as string)}>
                {msg.assistente.pastas.usarSugestao(insp.sugestao)}
              </Botao>
            ) : undefined
          }
        >
          {a.mensagem}
        </CaixaAviso>
      ))}
      <AchadosDoCampo id="" achados={pouco} />
    </>
  );
}

export function SecaoPastas({
  entrada,
  aoMudar,
  validacao,
  mostrarErros = true,
  comDicaDeDisco = false,
}: PropsSecao & { comDicaDeDisco?: boolean }) {
  const ach = (c: readonly CampoForm[]) => achadosVisiveis(validacao, c, mostrarErros);
  const definir = (id: PastaId, valor: string) => aoMudar({ pastas: { ...entrada.pastas, [id]: valor } });

  async function escolher(id: PastaId) {
    const escolhida = await api.config.pickFolder(id, entrada.pastas[id] || undefined).catch(() => null);
    if (!escolhida) return;
    if (id !== 'music') return definir(id, escolhida);
    // downloads e incompletos que ficavam ao lado da biblioteca antiga acompanham a nova
    const velhoPai = paiDoCaminho(entrada.pastas.music);
    const novoPai = paiDoCaminho(escolhida);
    const acompanha = (atual: string, nome: string) =>
      velhoPai && novoPai && atual.replace(/\\/g, '/') === `${velhoPai.replace(/\/$/, '')}/${nome}`
        ? `${novoPai.replace(/\/$/, '')}/${nome}`
        : atual;
    aoMudar({
      pastas: {
        music: escolhida,
        downloads: acompanha(entrada.pastas.downloads, 'downloads'),
        incomplete: acompanha(entrada.pastas.incomplete, 'incomplete'),
      },
    });
  }

  const ordem: PastaId[] = ['music', 'downloads', 'incomplete'];
  return (
    <div className="flex flex-col gap-6">
      {ordem.map((id) => {
        const achados = ach([CAMPO_DA_PASTA[id]]);
        const insp = validacao?.pastas[id];
        return (
          <div key={id} className="flex flex-col gap-2" data-pasta={id}>
            <Campo
              rotulo={msg.assistente.pastas[id]}
              dica={msg.assistente.pastas[`${id}Dica` as 'musicDica']}
              valor={entrada.pastas[id]}
              aoMudar={(v) => definir(id, v)}
              mono
              achados={achados.filter((a) => a.nivel === 'erro')}
              avisado={achados.some((a) => a.id === 'PASTA_ONEDRIVE')}
              lado={
                <Botao
                  onClick={() => seguro(escolher(id))}
                  aria-label={`${msg.assistente.escolherPasta} ${msg.assistente.pastas[id]}`}
                >
                  {msg.assistente.escolherPasta}
                </Botao>
              }
            />
            <ChipsDaPasta id={id} insp={insp} validacao={validacao} />
            <AvisosDaPasta achados={achados} insp={insp} usarSugestao={(c) => definir(id, c)} />
          </div>
        );
      })}
      {comDicaDeDisco ? <p className="hint m-0">{msg.assistente.pastas.discoExterno}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------- Soulseek

export function SecaoSoulseek({ entrada, aoMudar, config, validacao, mostrarErros = true }: PropsSecao) {
  const ach = (c: readonly CampoForm[]) => achadosVisiveis(validacao, c, mostrarErros);
  return (
    <div className="flex flex-col gap-6">
      <Campo
        rotulo={msg.assistente.soulseek.usuario}
        valor={entrada.slskUsuario}
        aoMudar={(v) => aoMudar({ slskUsuario: v })}
        achados={ach(['slskUsuario'])}
        autoComplete="username"
      />
      <CampoSenha
        rotulo={msg.assistente.soulseek.senha}
        configurada={config.campos.SLSK_PASSWORD === 'ok'}
        valor={entrada.slskSenha}
        aoMudar={(v) => aoMudar({ slskSenha: v })}
        dica={msg.assistente.soulseek.senhaDica}
        achados={ach(['slskSenha'])}
      />
    </div>
  );
}

// ---------------------------------------------------------------- Web UI do slskd

export function SecaoWebUi({ entrada, aoMudar, config, validacao, mostrarErros = true }: PropsSecao) {
  const ach = (c: readonly CampoForm[]) => achadosVisiveis(validacao, c, mostrarErros);
  const [gerada, setGerada] = useState(false);
  const [copiada, setCopiada] = useState(false);

  function gerar() {
    aoMudar({ webSenha: gerarSenha() });
    setGerada(true);
    setCopiada(false);
  }
  async function copiar() {
    await api.app.copyText(entrada.webSenha);
    setCopiada(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <Campo
        rotulo={msg.assistente.webui.usuario}
        valor={entrada.webUsuario}
        aoMudar={(v) => aoMudar({ webUsuario: v })}
        achados={ach(['webUsuario'])}
        autoComplete="username"
      />
      <CampoSenha
        rotulo={msg.assistente.webui.senha}
        configurada={config.campos.SLSKD_WEB_PASSWORD === 'ok'}
        valor={entrada.webSenha}
        aoMudar={(v) => aoMudar({ webSenha: v })}
        achados={ach(['webSenha'])}
        forcarAberto={gerada}
        visivel={gerada}
        lado={
          <Botao onClick={gerar}>
            {config.campos.SLSKD_WEB_PASSWORD === 'ok' ? msg.configuracoes.gerarNova : msg.assistente.webui.gerar}
          </Botao>
        }
      />
      {gerada ? (
        <div className="flex flex-wrap items-center gap-3" data-senha-gerada>
          <span className="hint flex-1 basis-72">{msg.assistente.webui.geradaDica}</span>
          <Botao pequeno onClick={() => seguro(copiar())}>
            {copiada ? msg.assistente.webui.copiada : msg.assistente.webui.copiar}
          </Botao>
        </div>
      ) : (
        <p className="hint m-0">
          {config.campos.SLSKD_WEB_PASSWORD === 'ok'
            ? msg.assistente.webui.dicaTrocaDeSenha
            : msg.assistente.webui.dicaReuso}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Chaves

export function CartaoChave({
  titulo,
  onde,
  chip,
}: {
  titulo: string;
  onde: string;
  chip: { cor: 'verde' | 'neutro' | 'laranja' | 'vermelho'; texto: string };
}) {
  return (
    <div className="flex items-center gap-[14px] rounded-lg border border-borda bg-cartao p-4">
      <Chip cor={chip.cor}>{chip.texto}</Chip>
      <span className="flex flex-col gap-1">
        <span className="font-bold">{titulo}</span>
        <span className="font-mono text-xs text-texto-mudo">{onde}</span>
      </span>
    </div>
  );
}

export function SecaoChaves({ entrada, aoMudar, config }: PropsSecao) {
  const soulbeetBoa = config.campos.SOULBEET_SECRET_KEY === 'ok';
  const slskdBoa = config.chaveSlskd === 'ok';
  const trocar = entrada.regenerarChaves;
  const chip = (boa: boolean) =>
    trocar
      ? ({ cor: 'laranja', texto: msg.assistente.chaves.seraTrocada } as const)
      : boa
        ? ({ cor: 'verde', texto: msg.assistente.chaves.mantida } as const)
        : ({ cor: 'neutro', texto: msg.assistente.chaves.seraGerada } as const);
  const temChaves = soulbeetBoa || slskdBoa;

  return (
    <div className="flex flex-col gap-4">
      <CartaoChave
        titulo={msg.assistente.chaves.soulbeet}
        onde={msg.assistente.chaves.soulbeetOnde}
        chip={chip(soulbeetBoa)}
      />
      <CartaoChave titulo={msg.assistente.chaves.slskd} onde={msg.assistente.chaves.slskdOnde} chip={chip(slskdBoa)} />
      {temChaves ? (
        <>
          <Botao variante="fantasma" className="self-start" onClick={() => aoMudar({ regenerarChaves: !trocar })}>
            {trocar ? msg.assistente.chaves.cancelarNovas : msg.assistente.chaves.gerarNovas}
          </Botao>
          {trocar ? <p className="hint m-0">{msg.assistente.chaves.aviso}</p> : null}
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- Ajustes finos

export function SecaoAjustes({ entrada, aoMudar, validacao, mostrarErros = true }: PropsSecao) {
  const ach = (c: readonly CampoForm[]) => achadosVisiveis(validacao, c, mostrarErros);
  return (
    <div className="flex flex-col gap-6">
      <Campo
        rotulo={msg.assistente.ajustes.tz}
        dica={msg.assistente.ajustes.tzDica}
        valor={entrada.tz}
        aoMudar={(v) => aoMudar({ tz: v })}
        mono
        achados={ach(['tz'])}
      />
      <div className="grid grid-cols-2 gap-4">
        <Campo
          rotulo={msg.assistente.ajustes.puid}
          valor={entrada.puid}
          aoMudar={(v) => aoMudar({ puid: v })}
          mono
          achados={ach(['puid'])}
        />
        <Campo
          rotulo={msg.assistente.ajustes.pgid}
          valor={entrada.pgid}
          aoMudar={(v) => aoMudar({ pgid: v })}
          mono
          achados={ach(['pgid'])}
        />
      </div>
      <Campo
        rotulo={msg.assistente.ajustes.contato}
        dica={msg.assistente.ajustes.contatoDica}
        valor={entrada.musicbrainzContato}
        aoMudar={(v) => aoMudar({ musicbrainzContato: v })}
        placeholder={msg.assistente.ajustes.contatoPlaceholder}
        achados={ach(['musicbrainzContato'])}
      />
    </div>
  );
}

// ---------------------------------------------------------------- Rede (só nas Configurações)

export function CartaoPorta({
  porta,
  testando,
  aoTestar,
}: {
  porta: PortaStatus | null;
  testando: boolean;
  aoTestar(): void;
}) {
  const r = msg.configuracoes.rede;
  const cor = !porta ? 'neutro' : porta.estado === 'escutando' ? 'verde' : 'laranja';
  const texto = !porta ? r.estado.desconhecido : r.estado[porta.estado];
  return (
    <Cartao className="flex flex-col gap-[10px] p-4" data-porta={porta?.estado ?? 'desconhecido'}>
      <div className="flex items-center gap-3">
        <Chip cor={cor}>{texto}</Chip>
        <span className="font-bold">{r.porta}</span>
        <Botao pequeno className="ml-auto" disabled={testando} onClick={aoTestar}>
          {testando ? r.testando : porta ? r.testarDeNovo : r.testar}
        </Botao>
      </div>
      {porta?.estado === 'livre' ? <p className="m-0 text-[13px] leading-normal text-chip-laranja">{r.livre}</p> : null}
      {porta?.estado === 'ocupada' ? (
        <p className="m-0 text-[13px] leading-normal text-chip-laranja">{r.ocupada}</p>
      ) : null}
      <p className="hint m-0">{r.explicacao}</p>
    </Cartao>
  );
}

export function SecaoRede({ entrada, aoMudar }: Pick<PropsSecao, 'entrada' | 'aoMudar'>) {
  const [porta, setPorta] = useState<PortaStatus | null>(null);
  const [testando, setTestando] = useState(false);

  async function testar() {
    setTestando(true);
    try {
      setPorta(await api.setup.checkPort());
    } finally {
      setTestando(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Interruptor
        marcado={entrada.abrirParaRede}
        aoMudar={(v) => aoMudar({ abrirParaRede: v })}
        titulo={msg.configuracoes.rede.abrir}
        descricao={msg.configuracoes.rede.abrirDica}
      />
      <CartaoPorta porta={porta} testando={testando} aoTestar={() => seguro(testar())} />
    </div>
  );
}
