// Textos do Modo DJ (protótipos "modos-dev-dj"): as mesmas telas, sem termos técnicos. Ficam à parte de mensagens.ts
// para os dois vocabulários não se misturarem. Aqui não se fala em stack, contêiner, porta, beets, lote ou script:
// fala-se em ligar, baixar, organizar e ouvir. O que o Modo DJ não muda continua vindo de `msg`.
import { juntar, type msg } from './mensagens.js';
import type { ResumoStack } from './stack.js';
import type { OpcaoId } from './opcoes-lote.js';
import type { EstadoCartaoDj, SituacaoDj } from './painel-dj.js';
import type { ServicoId } from './servicos.js';

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Como o Modo DJ chama cada serviço: pelo que ele faz, não pelo nome do programa. */
export const FUNCAO_DO_SERVICO: Record<ServicoId, { titulo: string; sujeito: string; para: string }> = {
  slskd: { titulo: 'Busca e download', sujeito: 'a busca', para: 'buscar e baixar' },
  soulbeet: { titulo: 'Organização da biblioteca', sujeito: 'o organizador', para: 'organizar as faixas novas' },
  navidrome: { titulo: 'Player', sujeito: 'o player', para: 'ouvir suas músicas' },
};

/** "O player", "A busca e o player" */
export function sujeitos(ids: readonly ServicoId[]): string {
  return maiuscula(juntar(ids.map((id) => FUNCAO_DO_SERVICO[id].sujeito)));
}

export const msgDj = {
  barraLateral: {
    baixando: 'Baixando agora',
    /** a linha de estado (em negrito) e a frase de apoio, no lugar dos três serviços com porta */
    estado(r: ResumoStack): { titulo: string; detalhe: string } {
      switch (r.motivo) {
        case 'verificando':
          return { titulo: 'Verificando…', detalhe: 'Conferindo se está tudo certo' };
        case 'operacao':
          return r.operacao === 'desligando'
            ? { titulo: 'Desligando…', detalhe: 'Suas músicas não são afetadas' }
            : { titulo: 'Ligando…', detalhe: 'Pode levar alguns minutos' };
        case 'docker-abrindo':
          return { titulo: 'Ligando…', detalhe: 'Abrindo o Docker Desktop' };
        case 'iniciando':
          return { titulo: 'Ligando…', detalhe: 'Quase pronto' };
        case 'docker-ausente':
          return { titulo: 'Falta o Docker Desktop', detalhe: 'Veja no Início como resolver' };
        case 'docker-fechado':
          return { titulo: 'Docker Desktop fechado', detalhe: 'Abra para ligar o Soulcrate' };
        case 'sem-projeto':
          return { titulo: 'Falta configurar', detalhe: 'O assistente prepara tudo' };
        case 'desligada':
          return { titulo: 'Desligado', detalhe: 'Ligue no Início para baixar e ouvir' };
        case 'no-ar':
          return { titulo: 'Ligado', detalhe: 'Pronto para baixar e ouvir' };
        case 'servico-parou':
        case 'servico-nao-responde':
          return {
            titulo: 'Com problema',
            detalhe: `${sujeitos(r.servicos)} ${plural(r.servicos.length, 'não está respondendo', 'não estão respondendo')}`,
          };
      }
    },
  },

  /** Configurações → Aplicativo: as mesmas preferências, ditas sem "lote" nem nomes de programa */
  aplicativo: {
    bandejaDica: 'O download continua de qualquer forma; isto só decide se o app sai junto.',
    avisarLote: {
      titulo: 'Avisar quando um download terminar',
      dica: 'Notificação do Windows com quantas faixas chegaram.',
    },
    avisarPausaDica: 'O Soulseek às vezes segura as buscas por alguns minutos. O download continua sozinho depois.',
    abrirWebUi: 'Abrir a busca, as transferências e o player',
  },

  configuracoes: {
    subtitulo: 'Suas pastas, sua conta do Soulseek e o jeito do app.',
    grupoSuasCoisas: 'Suas coisas',
    incompleta: {
      titulo: 'Falta terminar a configuração',
      corpo: 'Sem isso o Soulcrate não liga. O assistente mostra o que falta e corrige.',
    },
    pendente: {
      corpoDesligada: 'Valem na próxima vez que você ligar o Soulcrate.',
      corpoNoAr: 'Valem depois de reiniciar o Soulcrate. Um download em andamento continua durante o reinício.',
    },
    reiniciando: 'Reiniciando o Soulcrate para valer as mudanças…',
    rede: {
      abrir: 'Ouvir no celular e em outros aparelhos da casa',
      abrirDica: 'Libera o player, a busca e as transferências na rede da sua casa. Desligado, só este PC acessa.',
    },
    /** o teste da porta 2234, com o mesmo formato de `msg.configuracoes.rede` */
    porta: {
      porta: 'Outras pessoas conseguem baixar de você?',
      testar: 'Testar',
      testarDeNovo: 'Testar de novo',
      testando: 'Testando…',
      estado: {
        escutando: 'Este PC está atendendo',
        livre: 'Ninguém atende',
        ocupada: 'Outro programa no caminho',
        desconhecido: 'Não testado',
      },
      explicacao:
        'Para o Soulseek alcançar você, o roteador precisa encaminhar a porta 2234 para este PC; o app não consegue conferir isso daqui. Sem ela você ainda baixa, mas quem não recebe conexões costuma ir para o fim da fila.',
      livre:
        'O Soulcrate está ligado, mas ninguém atende neste PC. Desligue e ligue de novo; se continuar, veja os detalhes técnicos.',
      ocupada: 'Outro programa deste PC está usando a mesma porta. Feche-o antes de ligar o Soulcrate.',
    },
  },
  inicio: {
    /** título e subtítulo do cabeçalho: o que está acontecendo, numa frase */
    cabecalho(sit: SituacaoDj, ctx: { baixarFunciona: boolean }): { titulo: string; subtitulo: string } {
      switch (sit.tipo) {
        case 'verificando':
          return { titulo: 'Verificando…', subtitulo: 'Conferindo se está tudo certo. Leva alguns segundos.' };
        case 'ligado':
          return {
            titulo: 'Tudo pronto',
            subtitulo:
              'Busca, downloads e player funcionando. Enquanto o Soulcrate estiver ligado, suas músicas ficam compartilhadas no Soulseek.',
          };
        case 'desligado':
          return {
            titulo: 'O Soulcrate está desligado',
            subtitulo: 'Ligue para buscar, baixar e ouvir. Suas listas e o histórico continuam aqui.',
          };
        case 'ligando':
          return {
            titulo: 'Ligando…',
            subtitulo:
              'Preparando a busca, a organização e o player. Na primeira vez leva de 5 a 10 minutos; pode fechar a janela.',
          };
        case 'desligando':
          return {
            titulo: 'Desligando…',
            subtitulo: 'Parando a busca, a organização e o player. Suas músicas não são afetadas.',
          };
        case 'docker-fechado':
          return {
            titulo: 'O Docker Desktop está fechado',
            subtitulo:
              'O Soulcrate roda dentro dele. Abra e espere até 1 minuto: se o Soulcrate estava ligado, ele volta sozinho.',
          };
        case 'docker-ausente':
          return {
            titulo: 'Falta instalar o Docker Desktop',
            subtitulo: 'É um programa gratuito que o Soulcrate usa por baixo. Instale, reinicie o PC e volte aqui.',
          };
        case 'sem-projeto':
          return {
            titulo: 'Vamos configurar o Soulcrate',
            subtitulo: 'O assistente prepara tudo em poucos minutos, sem você abrir nenhum arquivo.',
          };
        case 'config-incompleta':
          return sit.faltaSenha
            ? {
                titulo: 'Falta a senha do Soulseek',
                subtitulo: 'Sem ela não dá para entrar na rede. Preencha e o Soulcrate liga em seguida.',
              }
            : {
                titulo: 'Falta terminar a configuração',
                subtitulo: 'Sem isso o Soulcrate não liga. O assistente mostra o que falta e corrige.',
              };
        case 'com-problema': {
          const n = sit.servicos.length;
          return {
            titulo: `${sujeitos(sit.servicos)} ${plural(n, 'não está respondendo', 'não estão respondendo')}`,
            subtitulo: `${ctx.baixarFunciona ? 'Baixar continua funcionando. ' : ''}${plural(n, 'Reiniciar', 'Ligar de novo')} costuma resolver em menos de 1 minuto.`,
          };
        }
      }
    },
    passos: {
      docker: 'abrindo o Docker Desktop',
      preparando: 'preparando a busca, a organização e o player',
      subindo: 'subindo a busca e o player',
      respondendo: 'esperando tudo responder',
    },
    passo: (n: number, total: number, texto: string) => `Passo ${n} de ${total} · ${texto}`,
    acoes: {
      abrirDocker: 'Abrir o Docker Desktop',
      detalhesTecnicos: 'Detalhes técnicos',
      baixarDocker: 'Baixar o Docker Desktop',
      conferirDeNovo: 'Já instalei, conferir de novo',
      preencherSenha: 'Preencher a senha',
      abrirAssistente: 'Abrir o assistente',
      reiniciar: (sujeito: string) => `Reiniciar ${sujeito}`,
      ligarDeNovo: 'Ligar de novo',
      verServicos: 'Ver serviços',
    },
    atalhos: {
      grupo: 'O que fazer',
      lista: {
        titulo: 'Baixar uma lista',
        descricao: 'Cole uma tracklist ou importe uma playlist do Spotify ou de outro streaming.',
      },
      soulbeet: {
        titulo: 'Buscar uma faixa',
        descricao: 'Procure e baixe uma música avulsa.',
        abre: 'Abre o Soulbeet',
      },
      navidrome: {
        titulo: 'Ouvir a biblioteca',
        descricao: 'Toque suas músicas no PC ou no celular.',
        abre: 'Abre o Navidrome',
      },
      slskd: {
        titulo: 'Ver transferências',
        descricao: 'O que está descendo e subindo no Soulseek agora.',
        abre: 'Abre o slskd',
      },
      desligado: 'Ligue o Soulcrate para usar',
    },
    ultimo: {
      rotulo: 'Último download',
      baixando: 'Baixando agora',
      nenhum: {
        titulo: 'Nenhum download ainda',
        corpo: 'Baixe sua primeira lista: as faixas chegam já com tom, BPM e gênero.',
      },
      /** "10 de 11" (em negrito) + " faixas chegaram." */
      chegaram: (ok: number, total: number) => ({
        numero: `${ok} de ${total}`,
        resto: ` ${plural(total, 'faixa chegou', 'faixas chegaram')}.`,
      }),
      faltaram: (n: number) => (n === 0 ? '' : ` ${n} ${plural(n, 'não veio', 'não vieram')}.`),
      progresso: (feitas: number, total: number) =>
        `${feitas} de ${total} ${plural(total, 'faixa pronta', 'faixas prontas')}`,
      verOQueFaltou: 'Ver o que faltou',
      abrir: 'Abrir o download',
      acompanhar: 'Acompanhar',
      baixarLista: 'Baixar uma lista',
    },
    biblioteca: {
      rotulo: 'Sua biblioteca',
      faixas: (n: number) => plural(n, 'faixa na biblioteca', 'faixas na biblioteca'),
      semBpm: (n: number) => `${n} sem BPM`,
      semTom: (n: number) => `${n} sem tom`,
      semGenero: (n: number) => `${n} sem gênero`,
      esperando: (n: number) => `${n} ${plural(n, 'esperando', 'esperando')} organizar`,
      tudoCerto: 'Tudo com tom, BPM e gênero',
      desligado: 'Ligue o Soulcrate para ver suas músicas.',
      lendo: 'Lendo a biblioteca…',
      naoLeu: 'Não consegui ler a biblioteca agora.',
      abrir: 'Abrir a biblioteca',
    },
  },

  servicos: {
    titulo: {
      ok: 'Tudo funcionando',
      atencao: (n: number) => (n === 1 ? 'Uma coisa precisa de atenção' : `${n} coisas precisam de atenção`),
      verificando: 'Conferindo…',
      desligado: 'O Soulcrate está desligado',
    },
    subtitulo: (segundos: number | null, atencao: number) =>
      `${segundos === null ? '' : `Conferido há ${segundos} s. `}${
        atencao > 0
          ? 'O resto está funcionando normalmente.'
          : 'Busca, organização, player e compartilhamento respondendo.'
      }`.trim(),
    desligado: 'Ligue o Soulcrate no Início para conferir a busca, a organização e o player.',
    irParaInicio: 'Ir para o Início',
    cartao: {
      soulbeet: 'Organização da biblioteca',
      slskd: 'Busca e download',
      navidrome: 'Player',
      compartilhamento: 'Compartilhamento',
      pastas: 'Pastas',
    },
    /** o nome pequeno ao lado do botão, para quem procura o programa */
    origem: { soulbeet: 'Soulbeet', slskd: 'slskd', navidrome: 'Navidrome', compartilhamento: 'Pasta music' },
    estado: {
      ok: 'Funcionando',
      lento: 'Lento para responder',
      ligando: 'Ligando',
      parado: 'Parado',
      problema: 'Com problema',
      incompleto: 'Incompleto',
      zero: 'Nada compartilhado',
      desconhecido: 'Sem informação',
    } satisfies Record<EstadoCartaoDj, string>,
    pastasOk: 'Tudo certo',
    /** a frase do cartão de um serviço que não está ok */
    servico(id: ServicoId, estado: Exclude<EstadoCartaoDj, 'ok' | 'zero'>): string {
      const f = FUNCAO_DO_SERVICO[id];
      const S = maiuscula(f.sujeito);
      switch (estado) {
        case 'lento':
          return `${S} demorou para responder. Costuma passar sozinho em 1 minuto; se não passar, reinicie. Downloads em andamento não param.`;
        case 'ligando':
          return 'Está subindo. Leva alguns segundos.';
        case 'parado':
          return `${S} parou. Reinicie para voltar a ${f.para}.`;
        case 'problema':
          return `${S} não está respondendo. Reiniciar costuma resolver em menos de 1 minuto.`;
        case 'incompleto':
          return 'O organizador subiu sem a parte que calcula tom e BPM. Os detalhes técnicos mostram como reconstruir.';
        case 'desconhecido':
          return 'Conferindo…';
      }
    },
    soulbeetOk: 'Preenche tom, BPM e gênero e põe cada faixa na pasta do artista.',
    conectadoComo: 'Conectado ao Soulseek como',
    conectado: 'Conectado ao Soulseek.',
    playerFaixas: (n: number) =>
      `${n.toLocaleString('pt-BR')} ${plural(n, 'faixa pronta', 'faixas prontas')} para ouvir.`,
    playerOk: 'Pronto para tocar no PC ou no celular.',
    compartilhados: (n: number) =>
      `${n.toLocaleString('pt-BR')} ${plural(n, 'arquivo compartilhado', 'arquivos compartilhados')}. Quem compartilha costuma ser atendido mais rápido na rede.`,
    compartilhadosZero:
      'Nenhum arquivo compartilhado: quem não compartilha costuma ir para o fim da fila. Atualize a lista em Ajustar.',
    compartilhadosSemInfo: 'Aparece quando a busca estiver funcionando.',
    pastasTexto: {
      ok: 'O que você baixa chega na pasta que o organizador lê.',
      problema:
        'O que você baixa não está chegando na pasta que o organizador lê. Os detalhes técnicos mostram o que conferir.',
      desconhecido: 'Conferindo…',
    },
    botoes: {
      reiniciar: (sujeito: string) => `Reiniciar ${sujeito}`,
      verTransferencias: 'Ver transferências',
      abrirPlayer: 'Abrir o player',
      ajustar: 'Ajustar',
    },
  },

  /** como cada download terminou (o mesmo mapa de `msg.lote.execucao.estado`, sem "slskd" nem "lote") */
  estadoDoDownload: {
    preparando: 'Começando',
    rodando: 'Baixando',
    pausado: 'Buscas pausadas',
    parando: 'Parando',
    completed: 'Concluído',
    user: 'Parado por você',
    error: 'Terminou com erro',
    slskd_down: 'A busca não respondeu',
    config: 'Faltou configurar',
    locked: 'A lista já estava baixando',
    interrupted: 'Interrompido',
  } satisfies Record<keyof typeof msg.lote.execucao.estado, string>,

  /** Baixar lista: Lista, Ajustes e Download (protótipos "DJ · Baixar lista") */
  lote: {
    etapas: {
      rotulo: 'Etapas do download',
      lista: { numero: '1', rotulo: 'Lista' },
      opcoes: { numero: '2', rotulo: 'Ajustes' },
      execucao: { numero: '3', rotulo: 'Download' },
    },
    lista: {
      listasRecentes: 'Minhas listas',
      novaDoExemplo: 'Nova lista',
      cabecalhoEditor: 'Uma faixa por linha · Artista - Título',
      dica: 'Arraste um .txt ou .csv para a janela, ou cole a tracklist de um set.',
      comoVaiLer: 'O que vai ser baixado',
      paraBaixar: (n: number) => `${n} ${plural(n, 'faixa', 'faixas')}`,
      duplicadas: (n: number) => `${n} ${plural(n, 'repetida', 'repetidas')}`,
      naBiblioteca: (n: number) => `${n} já na biblioteca`,
      jaFeitas: (n: number) => `${n} ${plural(n, 'baixada antes', 'baixadas antes')}`,
      versao: 'Versão',
      retomada: {
        titulo: (data: string) => `Você já baixou esta lista em ${data}.`,
        corpo: (feitas: number) =>
          feitas > 0
            ? `O download continua de onde parou e pula ${feitas === 1 ? 'a faixa que já veio' : `as ${feitas} faixas que já vieram`}.`
            : 'Nada do que já veio será baixado de novo.',
      },
      rodandoAgora: 'Esta lista está baixando agora.',
      verExecucao: 'Ver o download',
      opcoesPadrao: 'Ajustes: padrão',
      opcoesAlteradas: (n: number) => `Ajustes: ${n} ${plural(n, 'diferente', 'diferentes')} do padrão`,
      revisarOpcoes: 'Mudar ajustes',
      iniciar: (n: number) => (n > 0 ? `Baixar ${n} ${plural(n, 'faixa', 'faixas')}` : 'Baixar'),
      iniciando: 'Começando…',
      vazio: {
        titulo: 'Escolha uma lista',
        corpo:
          'Uma faixa por linha, no formato Artista - Título. Abra uma lista sua, traga uma playlist de um streaming ou comece por uma lista nova.',
      },
    },
    ajustes: {
      situacoes: 'Situações comuns',
      situacoesDica: 'Um clique ajusta tudo para o caso.',
      /** o que cada receita faz, no lugar dos flags do script */
      receitas: {
        listaGrande: 'Baixa 8 faixas ao mesmo tempo.',
        usuariosLentos: 'Espera mais na fila e em cada download antes de desistir.',
        querTudo: 'Aceita AIFF, AAC e MP3 quando não houver FLAC ou WAV.',
        tentarDeNovo: 'Volta às faixas que não vieram da última vez.',
        soBaixar: 'Os arquivos ficam em downloads, sem tom, BPM e pastas.',
        buscasSemResposta: 'Busca mais devagar e pausa mais quando o Soulseek bloquear.',
        titulosDuvidosos: 'Pula o que não existe no catálogo, em vez de buscar errado.',
        titulosIncompletos: 'Aceita títulos com palavras a mais e marca para você conferir.',
        listaEnormeComPressa: 'Não busca só pelo artista: mais rápido, mas acha menos.',
      } as Record<string, string>,
      qualidade: {
        nome: 'Qualidade',
        desc: 'FLAC e WAV entram sempre. Marque o que mais aceitar quando eles não existirem.',
      },
      titulos: { nome: 'Títulos', desc: 'Como comparar o nome da faixa na lista com o do arquivo.' },
      comportamento: { nome: 'Comportamento', desc: 'O que fazer com o que já foi feito.' },
      mudou: 'MUDOU',
      velocidade: {
        titulo: 'Velocidade e paciência',
        dica: 'Para quando o padrão não der conta',
        grupos: { ritmo: 'Velocidade', filas: 'Paciência' },
        mudou: (n: number) => `${n} ${plural(n, 'MUDOU', 'MUDARAM')}`,
      },
      /**
       * Os ajustes como o DJ os lê. `invertido`: a frase diz o contrário do flag do script ("Organizar depois de
       * baixar" ligado é `-SemBeets` desligado), para nenhum interruptor ter "não" ou "sem" no nome.
       */
      itens: {
        AceitarAacAiff: {
          titulo: 'Aceitar AIFF e AAC',
          desc: 'AIFF (sem perda) e AAC de 256 kbps ou mais, logo depois de FLAC e WAV.',
        },
        AceitarMp3320: { titulo: 'Aceitar MP3 320', desc: 'Só quando a faixa não existe nos formatos acima.' },
        AceitarMp3Menor: {
          titulo: 'Aceitar MP3 256 e V0',
          desc: 'Também aceita MP3 320. Só quando não há nada melhor.',
        },
        TituloAproximado: {
          titulo: 'Aceitar títulos com palavras a mais',
          desc: 'Tentados por último e marcados para você conferir.',
        },
        NaoTolerarGrafia: {
          titulo: 'Exigir o título sem erros de digitação',
          desc: 'Desligado, “Abaddon” também acha “Abbadon”.',
        },
        SemCatalogo: {
          titulo: 'Conferir os títulos no catálogo antes de buscar',
          desc: 'Corrige títulos errados pelo MusicBrainz. Desligado, começa a buscar antes.',
          invertido: true,
        },
        PularForaDoCatalogo: {
          titulo: 'Pular títulos que não existem no catálogo',
          desc: 'Nem busca. Depois, corrija a lista pelo relatório do download.',
        },
        Retentar: { titulo: 'Tentar de novo o que falhou antes', desc: 'Use ao baixar a mesma lista outra vez.' },
        NaoPularExistentes: {
          titulo: 'Baixar de novo o que já está na biblioteca',
          desc: 'Para trocar um arquivo ruim que você já apagou.',
        },
        SemBeets: {
          titulo: 'Organizar depois de baixar',
          desc: 'Preenche tom, BPM e gênero e põe cada faixa na pasta do artista. Desligado, os arquivos ficam em downloads.',
          invertido: true,
        },
        SemBuscaArtista: {
          titulo: 'Buscar também só pelo nome do artista',
          desc: 'Acha mais faixas. Desligado, listas enormes andam mais rápido.',
          invertido: true,
        },
        Paralelo: { titulo: 'Downloads ao mesmo tempo', desc: '' },
        Buscas: { titulo: 'Buscas ao mesmo tempo', desc: '' },
        BuscasPorJanela: { titulo: 'Buscas a cada 3 min 40 s', desc: 'O Soulseek bloqueia quem busca demais.' },
        PausaBloqueioMin: { titulo: 'Pausa se o Soulseek bloquear', desc: '' },
        Tentativas: { titulo: 'Usuários tentados por faixa', desc: 'Depois disso, a faixa fica de fora.' },
        FilaMaxMin: { titulo: 'Espera na fila de cada usuário', desc: '' },
        FilaUltimoMin: { titulo: 'Espera quando é o último usuário', desc: '' },
        DownloadMaxMin: { titulo: 'Tempo máximo de cada download', desc: '' },
        LoteBeets: { titulo: 'Faixas organizadas por vez', desc: '' },
      } satisfies Record<OpcaoId, { titulo: string; desc: string; invertido?: boolean }>,
      resumo: 'Resumo',
      nenhuma: 'Tudo no padrão',
      algumas: (n: number) => `${plural(n, 'ajuste diferente', 'ajustes diferentes')} do padrão`,
      /** as linhas do resumo: o que o ajuste vale agora, em poucas palavras */
      linhas: {
        qualidade: 'Qualidade',
        qualidadeValor: (aceitos: readonly string[]) =>
          aceitos.length === 0 ? 'só FLAC e WAV' : `FLAC e WAV, depois ${juntar(aceitos)}`,
        ligado: 'sim',
        desligado: 'não',
        organizar: 'Organizar',
        organizarDepois: 'depois, por você',
        catalogo: 'Títulos no catálogo',
        semConferir: 'sem conferir',
        buscaArtista: 'Busca pelo artista',
        semBuscaArtista: 'desligada',
      },
      restaurar: 'Voltar ao padrão',
      conferirStack: 'Antes de começar, o Soulcrate confere se está ligado e oferece ligar.',
    },
    antesDeIniciar: {
      semStackTitulo: 'O Soulcrate está desligado',
      semStackCorpo:
        'Para baixar, a busca precisa estar ligada. O Soulcrate liga tudo e começa o download assim que estiver pronto. Na primeira vez leva de 5 a 10 minutos.',
      ligandoTitulo: 'Ligando o Soulcrate…',
      ligandoCorpo: 'Esperando tudo responder. O download começa sozinho em seguida.',
      naoDaTitulo: 'Não dá para ligar o Soulcrate agora',
      naoDaCorpo: (motivo: string) =>
        `${motivo}. Resolva isso no Início e volte aqui; sua lista e seus ajustes ficam como estão.`,
      demorou: 'O Soulcrate não ficou pronto a tempo. Veja os serviços e tente de novo.',
    },
    download: {
      rotulo: 'Baixar lista',
      vazio: {
        titulo: 'Nenhum download agora',
        corpo: 'Escolha uma lista, confira os ajustes e baixe. O andamento aparece aqui.',
        irParaLista: 'Ir para a lista',
      },
      abrirPasta: 'Abrir a pasta',
      verOQueFaltou: 'Ver o que faltou',
      voltarALista: 'Voltar à lista',
      concluidas: 'concluídas',
      levou: 'levou',
      baixandoHa: 'baixando há',
      faltam: 'faltam',
      calculando: 'calculando…',
      barra: (c: { chegaram: number; naoVieram: number; andamento: number }) =>
        `Progresso: ${c.chegaram} chegaram, ${c.naoVieram} não vieram, ${c.andamento} em andamento`,
      contadores: { chegaram: 'Chegaram', andamento: 'Em andamento', naoVieram: 'Não vieram' },
      filtrar: 'Filtrar',
      filtros: { todas: 'Todas', andamento: 'Em andamento', chegaram: 'Chegaram', naoVieram: 'Não vieram' },
      colunas: { numero: '#', faixa: 'Faixa', situacao: 'Situação', formato: 'Formato' },
      porQue: 'Por quê?',
      porQueDe: (linha: string) => `Por que não veio: ${linha}`,
      tabela: 'Faixas do download',
      fim: {
        titulo: 'Download concluído',
        organizar: 'As faixas estão em downloads, esperando para ser organizadas.',
        organizarAgora: 'Organizar agora',
        naBiblioteca: 'As faixas já estão na biblioteca, com tom, BPM e gênero.',
        abrirBiblioteca: 'Abrir a biblioteca',
        parado: 'Download parado',
        paradoCorpo: 'O que já tinha chegado ficou. Baixe a lista de novo para continuar de onde parou.',
      },
      /** a faixa de aviso durante o download, sem "lote", "script" nem "relatórios" */
      faixa: {
        iniciando: ['Começando…', 'Preparando o download.'] as const,
        catalogo: 'Conferindo os títulos no catálogo antes de buscar.',
        janela: [
          'Buscando devagar',
          'O Soulseek limita quantas buscas cada um faz. As próximas começam em instantes; os downloads seguem normalmente.',
        ] as const,
        pausado: 'O Soulseek segurou as buscas por alguns minutos. Os downloads continuam; as buscas voltam sozinhas.',
        parando: ['Terminando…', 'Esperando os downloads em andamento. Não feche o Soulcrate à força.'] as const,
        avisoSlskd: 'A busca não respondeu',
        avisoMusicbrainz: 'Catálogo de títulos indisponível',
      },
    },
    /** a situação de cada faixa (o mesmo mapa de `msg.lote.status`), sem "beets" nem "execução" */
    status: {
      aguardando: 'Aguardando',
      buscando: 'Procurando',
      aguardandoVaga: 'Aguardando a vez',
      baixando: 'Baixando',
      naFila: 'Esperando o usuário',
      organizando: 'Organizando',
      naBiblioteca: 'Na biblioteca',
      baixada: 'Baixada',
      beetsFalhou: 'Baixada, sem organizar',
      jaEstavaNaBiblioteca: 'Já estava na biblioteca',
      jaFeita: 'Baixada antes',
      naoEncontrada: 'Não encontrada',
      falhou: 'Não baixou',
    } satisfies Record<keyof typeof msg.lote.status, string>,
  },

  /** Histórico, o detalhe de um download e "O que faltou" (protótipos "DJ · Histórico") */
  historico: {
    titulo: 'Seus downloads',
    subtitulo: 'Cada lista que você baixou, com o que chegou e o que faltou.',
    apagarAntigas: 'Apagar os antigos…',
    filtrar: 'Filtrar',
    filtros: { todas: 'Todos', faltas: 'Com faixas que faltaram' },
    tabela: 'Seus downloads',
    colunas: { quando: 'Quando', lista: 'Lista', resultado: 'Resultado', duracao: 'Duração', acoes: 'Ações' },
    novaTentativa: 'Nova tentativa',
    soAsQueFaltaram: (n: number) => (n === 1 ? 'Só a faixa que tinha faltado' : `Só as ${n} faixas que tinham faltado`),
    faixas: (n: number) => `${n} ${plural(n, 'faixa', 'faixas')}`,
    resumo: (c: { chegaram: number; naoVieram: number; puladas: number }) =>
      [
        `${c.chegaram} ${plural(c.chegaram, 'chegou', 'chegaram')}`,
        ...(c.naoVieram > 0 ? [`${c.naoVieram} ${plural(c.naoVieram, 'faltou', 'faltaram')}`] : []),
        ...(c.puladas > 0 ? [`${c.puladas} já ${plural(c.puladas, 'tinha vindo', 'tinham vindo')}`] : []),
      ].join(' · '),
    baixando: (feitas: number, total: number) => `baixando · ${feitas} de ${total}`,
    verOQueFaltou: 'Ver o que faltou',
    abrir: 'Abrir',
    acompanhar: 'Acompanhar',
    vazio: {
      titulo: 'Nenhum download ainda',
      corpo: 'Cada lista que você baixar aparece aqui, com o que chegou e o que faltou.',
      irParaLista: 'Baixar uma lista',
    },
    filtroVazio: 'Nenhum download com faixas que faltaram.',
    carregando: 'Lendo seus downloads…',
    avisoEmAndamento: 'Este download ainda está rodando. Os números abaixo acompanham o andamento.',
    verAoVivo: 'Acompanhar',
    detalhe: {
      voltar: 'Seus downloads',
      rotulo: (quando: string, duracao: string | null) => `${quando}${duracao ? ` · levou ${duracao}` : ''}`,
      reprocessar: 'Baixar a lista inteira de novo…',
      tentarDeNovo: (n: number) => (n === 1 ? 'Tentar de novo a que faltou' : `Tentar de novo as ${n} que faltaram`),
      cartoes: {
        baixadas: 'Baixadas',
        naoEncontradas: 'Não encontradas',
        falharam: 'Falharam',
        paraConferir: 'Para conferir',
        paraConferirDica: 'Achadas só pelo nome do artista. Ouça para ter certeza.',
        naoTerminadas: 'Não terminaram',
      },
      filtros: { todas: 'Todas', bib: 'Baixadas', nao: 'Faltaram', conf: 'Para conferir', inc: 'Não terminaram' },
      colunas: { status: 'Situação', faixa: 'Faixa', onde: 'Onde', acoes: 'Ações' },
      onde: { biblioteca: 'Biblioteca', downloads: 'Downloads', faltaOrganizar: 'falta organizar' },
      semFaixas: 'Este download não registrou nenhuma faixa. Se terminou com erro, a explicação está no cartão acima.',
    },
    diagnostico: {
      rotulo: 'O que faltou',
      subtitulo: 'Para cada uma: o que encontramos, por que não serviu e o que fazer.',
      linha: (n: number) => `linha ${n} da lista`,
      porQueNaoVeio: 'Por que não veio',
      oQueFazer: 'O que fazer',
      oQueFazerComSugestao: 'Escolha a sugestão acima, ou procure a faixa você mesmo.',
      oQueFazerSemSugestao: 'Procure a faixa você mesmo, ou corrija a linha na lista e tente de novo.',
      buscarManualmente: 'Buscar manualmente',
      editarLinha: 'Editar a linha na lista',
      esperarMais: 'Tentar de novo esperando mais',
      parecidos: 'Parecidos que encontramos',
      semParecidos: 'Não apareceu nenhum arquivo com esse título ou desse artista.',
      deuErrado: 'O que deu errado',
      semTentativas: 'Nenhuma tentativa de download ficou registrada.',
      semMotivos: 'Este download não guardou o motivo desta faixa. Procure a faixa você mesmo ou tente de novo.',
      rodape: {
        titulo: (n: number) => (n === 1 ? 'Tentar de novo a que faltou' : `Tentar de novo as ${n} que faltaram`),
        corpo: 'O Soulcrate monta uma lista só com elas, já com as correções, e abre os ajustes para você conferir.',
      },
    },
  },
};
