// Textos da interface em português do Brasil, num só lugar (§6.5 da especificação), prontos para i18n.
// Vocabulário do README: "lista", "lote", "biblioteca", "faixa", "stack".
import type { ErroCodigo } from './erros.js';
import type { EtapaDetalhe, EtapaEstado, EtapaId, MotivoResumo, OperacaoStack, ResumoStack } from './stack.js';
import type { ServicoId } from './servicos.js';
import { servicoPorId } from './servicos.js';

const listaFmt = new Intl.ListFormat('pt-BR', { style: 'long', type: 'conjunction' });

/** "slskd e Soulbeet", "slskd, Soulbeet e Navidrome" */
export function juntar(nomes: readonly string[]): string {
  return listaFmt.format(nomes);
}

export function nomesDosServicos(ids: readonly ServicoId[]): string {
  return juntar(ids.map((id) => servicoPorId(id).nome));
}

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

export const msg = {
  app: {
    nome: 'Soulcrate',
    carregando: 'Carregando…',
  },

  nav: {
    principal: 'Principal',
    inicio: 'Início',
    lista: 'Baixar lista',
    historico: 'Histórico',
    biblioteca: 'Biblioteca',
    servicos: 'Serviços',
    configuracoes: 'Configurações',
  },

  barraLateral: {
    titulo: 'Stack',
    /** texto da linha de estado (ex.: "No ar · 3/3 saudáveis") */
    resumo(r: ResumoStack): string {
      return rotuloResumo(r);
    },
  },

  acoes: {
    ligar: 'Ligar',
    ligarStack: 'Ligar a stack',
    desligar: 'Desligar',
    reconstruir: 'Reconstruir',
    abrirDocker: 'Abrir Docker Desktop',
    baixarDocker: 'Baixar o Docker Desktop',
    comoInstalarWsl: 'Como instalar o WSL 2',
    escolherPasta: 'Escolher a pasta',
    abrirConfiguracoes: 'Ver configurações',
    verServicos: 'Ver serviços',
    tentarDeNovo: 'Tentar de novo',
    copiarDetalhes: 'Copiar detalhes',
    abrirLog: 'Abrir log',
    verificarDeNovo: 'Verificar de novo',
    abrirNoApp: 'Abrir no app',
    abrirNoNavegador: 'Abrir no navegador',
    abrirWebUis: 'Abrir Web UIs',
    voltar: 'Voltar',
    recarregar: 'Recarregar',
    copiar: 'Copiar',
    entendi: 'Entendi',
    dispensar: 'Dispensar',
    mudarNasConfiguracoes: 'Mudar nas configurações',
    sair: 'Sair',
    abrirPasta: 'Abrir a pasta',
  },

  inicio: {
    rotulo: 'Início',
    etapas: 'Etapas do ambiente',
    interfacesWeb: 'Interfaces web',
    ultimoLote: 'Último lote concluído',
    semLote: 'Nenhum lote rodando',
    semLoteDica: 'O download em lote chega em uma próxima versão do app. Por enquanto, use o baixar-lista.bat.',
    logDaStack: 'Log da stack',
    logFonte: 'docker compose',
    logVazio: 'Nenhum contêiner rodando.',
    logOperacaoVazia: 'Esperando a saída do Docker…',
    primeiroBuild: 'O primeiro build leva de 5 a 10 minutos.',
    descricaoWebUi: {
      soulbeet: 'Busca e download de faixas avulsas',
      slskd: 'Transferências, buscas e usuários do Soulseek',
      navidrome: 'Ouvir a biblioteca',
    } satisfies Record<ServicoId, string>,
    /** título e subtítulo do cabeçalho, conforme o estado */
    cabecalho(r: ResumoStack, docker: { abrindo: boolean }): { titulo: string; subtitulo: string } {
      switch (r.motivo) {
        case 'verificando':
          return {
            titulo: 'Verificando o ambiente',
            subtitulo: 'Conferindo o Docker, a configuração e os serviços. Leva alguns segundos.',
          };
        case 'no-ar':
          return {
            titulo: 'Stack no ar',
            subtitulo:
              'slskd, Soulbeet e Navidrome respondendo. Enquanto a stack está no ar, sua pasta music é compartilhada no Soulseek.',
          };
        case 'desligada':
          return {
            titulo: 'A stack está desligada',
            subtitulo: 'Ligue para buscar, baixar e ouvir. Listas e relatórios continuam disponíveis.',
          };
        case 'operacao':
          if (r.operacao === 'desligando') {
            return { titulo: 'Desligando a stack', subtitulo: 'Parando os contêineres. A biblioteca não é afetada.' };
          }
          return {
            titulo: r.operacao === 'reconstruindo' ? 'Reconstruindo a stack' : 'Ligando a stack',
            subtitulo: `Construindo a imagem do Soulbeet e subindo os contêineres. ${msg.inicio.primeiroBuild}`,
          };
        case 'iniciando':
          return {
            titulo: 'Iniciando os serviços',
            subtitulo: 'Os contêineres subiram. Esperando os serviços ficarem saudáveis.',
          };
        case 'docker-abrindo':
          return {
            titulo: 'Abrindo o Docker Desktop',
            subtitulo: 'Esperando a engine ficar pronta. Pode levar um minuto.',
          };
        case 'docker-fechado':
          return {
            titulo: docker.abrindo ? 'Abrindo o Docker Desktop' : 'O Docker Desktop está fechado',
            subtitulo: 'Abra o Docker Desktop para ligar a stack. Sua configuração e sua biblioteca estão intactas.',
          };
        case 'docker-ausente':
          return {
            titulo: 'O Docker Desktop não foi encontrado',
            subtitulo:
              'O Soulcrate roda os serviços dentro do Docker. Instale o Docker Desktop com WSL 2 e volte aqui.',
          };
        case 'sem-projeto':
          return {
            titulo: 'Escolha a pasta do Soulcrate',
            subtitulo:
              'O app precisa da pasta onde ficam o docker-compose.yml, o .env e a biblioteca. O assistente de instalação chega em uma próxima versão.',
          };
        case 'servico-parou':
          return {
            titulo: 'Há serviços parados',
            subtitulo: `${nomesDosServicos(r.servicos)} ${plural(r.servicos.length, 'parou', 'pararam')}. Ligue a stack de novo ou veja os logs em Serviços.`,
          };
        case 'servico-nao-responde':
          return {
            titulo: 'Há serviços que não respondem',
            subtitulo: `${nomesDosServicos(r.servicos)} ${plural(r.servicos.length, 'não responde', 'não respondem')}. Veja os logs em Serviços.`,
          };
      }
    },
  },

  etapas: {
    rotulo: (n: number) => `Etapa ${n}`,
    titulo: {
      docker: 'Docker instalado',
      desktop: 'Docker Desktop aberto',
      configuracao: 'Configuração válida',
      stack: 'Stack no ar',
      servicos: 'Serviços saudáveis',
    } satisfies Record<EtapaId, string>,
    estado: {
      docker: { ok: 'OK', erro: 'Ausente', aguardando: 'Verificando' },
      desktop: { ok: 'OK', erro: 'Fechado', trabalhando: 'Abrindo', aguardando: 'Aguardando' },
      configuracao: { ok: 'OK', atencao: 'Avisos', erro: 'Corrigir', aguardando: 'Verificando' },
      stack: { ok: 'OK', desligada: 'Desligada', trabalhando: 'Ligando', erro: 'Incompleta', aguardando: 'Aguardando' },
      servicos: { ok: 'OK', trabalhando: 'Iniciando', erro: 'Com problema', aguardando: 'Aguardando' },
    } satisfies Record<EtapaId, Partial<Record<EtapaEstado, string>>>,
    detalhe(
      d: EtapaDetalhe,
      ctx: {
        versaoDocker: string | null;
        segundos: number;
        erros: number;
        avisos: number;
        rodando: number;
        total: number;
      },
    ): string {
      switch (d) {
        case 'verificando':
          return 'Verificando…';
        case 'docker-ok':
          return ctx.versaoDocker ? `Docker encontrado (engine ${ctx.versaoDocker}).` : 'Docker encontrado.';
        case 'docker-ausente':
          return 'Não encontrei o Docker neste PC. Instale o Docker Desktop com WSL 2.';
        case 'docker-fora-do-path':
          return 'O Docker Desktop está instalado, mas o comando docker não está no PATH. Reinicie o Windows e tente de novo.';
        case 'desktop-ok':
          return 'Engine pronta para receber comandos.';
        case 'desktop-fechado':
          return 'Sem o Docker Desktop a stack não sobe. Abrir e esperar a engine leva cerca de 1 minuto.';
        case 'desktop-abrindo':
          return `Esperando a engine ficar pronta… ${ctx.segundos} s`;
        case 'desktop-aguardando':
          return 'Depende do Docker instalado.';
        case 'config-ok':
          return '.env e slskd.yml conferidos. A API key é a mesma nos dois arquivos.';
        case 'config-ok-avisos':
          return `.env e slskd.yml conferidos, com ${ctx.avisos} ${plural(ctx.avisos, 'aviso', 'avisos')}.`;
        case 'config-invalida':
          return `${ctx.erros} ${plural(ctx.erros, 'problema', 'problemas')} no .env ou no slskd.yml. Veja os detalhes em Configurações.`;
        case 'config-sem-projeto':
          return 'Escolha a pasta do Soulcrate, a que tem o docker-compose.yml.';
        case 'stack-ok':
          return `${ctx.total} contêineres rodando.`;
        case 'stack-desligada':
          return 'Os contêineres estão parados. A biblioteca não é afetada.';
        case 'stack-ligando':
          return 'docker compose up -d --build em andamento. Acompanhe no log abaixo.';
        case 'stack-parcial':
          return `Só ${ctx.rodando} de ${ctx.total} contêineres estão rodando.`;
        case 'stack-aguardando':
          return 'Depende do Docker Desktop e da pasta do Soulcrate.';
        case 'servicos-aguardando':
          return '';
        case 'servicos':
          return '';
      }
    },
    acao: {
      baixarDocker: 'Baixar o Docker Desktop',
      abrirDockerDesktop: 'Abrir Docker Desktop',
      escolherPasta: 'Escolher a pasta',
      abrirConfiguracoes: 'Ver configurações',
      ligar: 'Ligar a stack',
      verServicos: 'Ver serviços',
    },
  },

  servicoSaude: {
    healthy: 'saudável',
    unhealthy: 'não responde',
    starting: 'iniciando',
    nenhuma: 'no ar',
    parado: 'parado',
    ausente: '—',
  },

  servicos: {
    rotulo: 'Serviços',
    verificacoes: 'Verificações',
    logsDosConteineres: 'Logs dos contêineres',
    contêiner: 'Contêiner',
    seguir: 'Seguir',
    reiniciar: (nome: string) => (nome ? `Reiniciar ${nome}` : 'Reiniciar'),
    todos: 'todos',
    semLogs: 'Sem linhas de log ainda.',
    semStack: 'A stack está desligada. Ligue-a no Início para ver as verificações e os logs.',
    titulo: {
      ok: 'Tudo respondendo',
      aviso: 'Tudo respondendo, com avisos',
      erro: 'Há verificações falhando',
      verificando: 'Verificando…',
      semStack: 'A stack está desligada',
    },
    subtitulo: (ok: number, total: number, avisos: number, segundos: number | null) => {
      const partes = [`${ok} de ${total} ${plural(total, 'verificação OK', 'verificações OK')}`];
      if (avisos > 0) partes[0] += `, ${avisos} ${plural(avisos, 'aviso', 'avisos')}`;
      return segundos === null ? `${partes[0]}.` : `${partes[0]}. Conferido há ${segundos} s.`;
    },
    check: {
      containers: { titulo: 'Contêineres', fonte: 'docker compose ps' },
      endpoints: { titulo: 'Endpoints de saúde', fonte: 'HTTP' },
      plugins: { titulo: 'Plugins do beets', fonte: 'docker compose exec soulbeet' },
      pastas: { titulo: 'Pastas compartilhadas', fonte: 'slskd e Soulbeet' },
      importacoes: { titulo: 'Últimas importações do beets', fonte: 'beets-import.log' },
    },
    estadoCheck: { ok: 'OK', aviso: 'Aviso', erro: 'Falhou' },
  },

  webUi: {
    interface: 'Interface',
    voltarParaServicos: 'Serviços',
    sessaoSalva: 'sessão salva no app',
    particao: 'WebContentsView · partição própria',
    explicacao: 'A interface original do serviço é exibida aqui, sem acesso ao app e sem segredos.',
    carregando: (nome: string) => `Carregando o ${nome}…`,
  },

  configuracoes: {
    rotulo: 'Configurações',
    titulo: 'Configurações',
    subtitulo:
      'O assistente que cria o .env e o slskd.yml para você chega em uma próxima versão. Por enquanto, o app confere os arquivos que já existem.',
    pasta: 'Pasta do Soulcrate',
    pastaOrigem: {
      configurada: 'escolhida por você',
      ambiente: 'definida pela variável SOULCRATE_DIR',
      desenvolvimento: 'a pasta deste repositório',
      padrao: 'pasta padrão (Soulcrate no seu perfil)',
    },
    semPasta: 'Nenhuma pasta definida.',
    pastaSemCompose: 'Essa pasta não tem o docker-compose.yml do Soulcrate. Escolha a pasta que tem.',
    conferencia: 'Conferência da configuração',
    conferirDeNovo: 'Conferir de novo',
    tudoCerto: 'Tudo certo: o .env e o slskd.yml passaram na conferência.',
    sempasta: 'Escolha a pasta do Soulcrate para conferir a configuração.',
    abrirEnv: 'Abrir o .env',
    abrirYml: 'Abrir o slskd.yml',
    preferencias: 'Preferências do app',
    bandeja: 'Fechar a janela minimiza para a bandeja',
    bandejaDica: 'A stack e os lotes continuam rodando. Para sair de vez, use Sair no ícone da bandeja.',
    erro: 'Erro',
    aviso: 'Aviso',
    estado: { valida: 'OK', avisos: 'Avisos', invalida: 'Corrigir' },
  },

  emBreve: {
    rotulo: 'Em breve',
    titulo: 'Esta tela chega em uma próxima versão',
    corpo: (nome: string) =>
      `${nome} ainda não está disponível no app. Os .bat e a linha de comando continuam funcionando.`,
    irParaInicio: 'Ir para o Início',
  },

  bandeja: {
    abrir: 'Abrir Soulcrate',
    ligar: 'Ligar stack',
    desligar: 'Desligar stack',
    sair: 'Sair',
    sairDica: 'a stack continua',
    dicaFechar: {
      titulo: 'O Soulcrate continua na bandeja',
      corpo:
        'Fechar a janela não desliga a stack nem interrompe um lote em andamento. Para sair de vez, use Sair no ícone da bandeja.',
      naoMostrar: 'Não mostrar de novo',
    },
  },

  menu: {
    arquivo: 'Arquivo',
    exibir: 'Exibir',
    ajuda: 'Ajuda',
    abrirPastaLogs: 'Abrir pasta de logs',
    sobre: 'Sobre o Soulcrate',
    recarregar: 'Recarregar',
    ferramentasDev: 'Ferramentas de desenvolvedor',
    zoomMais: 'Aumentar zoom',
    zoomMenos: 'Diminuir zoom',
    zoomPadrao: 'Tamanho padrão',
    telaCheia: 'Tela cheia',
  },

  erro: {
    /** rótulo pequeno do cartão de erro */
    categoria: {
      'docker.ausente': 'Erro · ambiente',
      'docker.fora-do-path': 'Erro · ambiente',
      'docker.fechado': 'Erro · ambiente',
      'docker.timeout': 'Erro · ambiente',
      'compose.ausente': 'Erro · ambiente',
      'projeto.ausente': 'Erro · configuração',
      'config.invalida': 'Erro · configuração',
      'porta.em-uso': 'Erro · rede',
      'servico.inacessivel': 'Erro · serviço',
      'operacao.falhou': 'Erro · stack',
      inesperado: 'Erro inesperado',
    } satisfies Record<ErroCodigo, string>,
    inesperado: { titulo: 'Algo deu errado', mensagem: 'O app não conseguiu terminar o que você pediu.' },
    dockerAusente: {
      titulo: 'Docker Desktop não encontrado',
      mensagem: 'O Soulcrate roda os serviços dentro do Docker. Instale o Docker Desktop com WSL 2 e volte aqui.',
    },
    dockerForaDoPath: {
      titulo: 'O comando docker não foi encontrado',
      mensagem:
        'O Docker Desktop parece instalado, mas o comando docker não está no PATH. Reinicie o Windows e tente de novo.',
    },
    dockerFechado: {
      titulo: 'O Docker Desktop está fechado',
      mensagem: 'Sem o Docker Desktop a stack não sobe. Abra-o e espere a engine ficar pronta (cerca de 1 minuto).',
    },
    dockerTimeout: {
      titulo: 'O Docker Desktop não ficou pronto',
      mensagem:
        'Esperei 3 minutos e a engine não respondeu. Abra o Docker Desktop e veja se ele está pedindo uma atualização ou o aceite dos termos, ou se o WSL 2 está ativo.',
    },
    composeAusente: {
      titulo: 'Docker Compose não encontrado',
      mensagem: 'O Docker Compose v2 acompanha o Docker Desktop. Atualize o Docker Desktop e tente de novo.',
    },
    projetoAusente: {
      titulo: 'Pasta do Soulcrate não definida',
      mensagem: 'Escolha a pasta onde ficam o docker-compose.yml, o .env e a biblioteca.',
    },
    configInvalida: {
      titulo: 'A configuração tem problemas',
      mensagem: (n: number) =>
        `O .env ou o slskd.yml ${plural(n, 'tem 1 problema', `têm ${n} problemas`)} que impedem de ligar a stack. Nada foi iniciado.`,
    },
    portaEmUso: {
      titulo: (porta: string) => `A porta ${porta} já está em uso`,
      mensagem: (porta: string) =>
        `Outro programa neste PC está usando a porta ${porta}. Feche-o (ou o contêiner antigo) e ligue a stack de novo.`,
    },
    servicoInacessivel: {
      titulo: (nome: string) => `O ${nome} não respondeu`,
      mensagem: 'O contêiner pode ter caído ou ainda estar subindo.',
    },
    operacaoFalhou: {
      titulo: (op: OperacaoStack | 'reiniciando') =>
        op === 'desligando'
          ? 'Não consegui desligar a stack'
          : op === 'reiniciando'
            ? 'Não consegui reiniciar o serviço'
            : 'Não consegui ligar a stack',
      mensagem: 'O Docker devolveu um erro. As últimas linhas estão nos detalhes.',
    },
  },
};

export function rotuloResumo(r: ResumoStack): string {
  const m: Record<MotivoResumo, string> = {
    verificando: 'Verificando…',
    operacao:
      r.operacao === 'desligando' ? 'Desligando…' : r.operacao === 'reconstruindo' ? 'Reconstruindo…' : 'Ligando…',
    'docker-ausente': 'Docker não encontrado',
    'docker-fechado': 'Docker fechado',
    'docker-abrindo': 'Abrindo o Docker…',
    'sem-projeto': 'Sem pasta do Soulcrate',
    desligada: 'Desligada',
    'no-ar': `No ar · ${r.saudaveis}/${r.total} saudáveis`,
    iniciando: 'Iniciando serviços…',
    'servico-parou': `${nomesDosServicos(r.servicos)} ${plural(r.servicos.length, 'parou', 'pararam')}`,
    'servico-nao-responde': `${nomesDosServicos(r.servicos)} ${plural(r.servicos.length, 'não responde', 'não respondem')}`,
  };
  return m[r.motivo];
}
