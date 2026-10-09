// Textos da interface em português do Brasil, num só lugar (§6.5 da especificação), prontos para i18n.
// Vocabulário do README: "lista", "lote", "biblioteca", "faixa", "stack".
import type { ErroCodigo } from './erros.js';
import type { TarefaEstado, TarefaSetupId } from './configuracao.js';
import type { EtapaDetalhe, EtapaEstado, EtapaId, MotivoResumo, OperacaoStack, ResumoStack } from './stack.js';
import type { ServicoId } from './servicos.js';
import { servicoPorId } from './servicos.js';
import type { MotivoFiltro } from './biblioteca.js';
import type { MotivoFim } from './eventos-lote.js';
import type { ResumoFim } from './lote-estado.js';
import type { OpcaoId } from './opcoes-lote.js';

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
    abrirAssistente: 'Abrir o assistente',
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
    abrirYml: 'Abrir o slskd.yml',
    verExecucao: 'Ver execução',
    abrirPastaLotes: 'Abrir a pasta lotes',
  },

  inicio: {
    rotulo: 'Início',
    etapas: 'Etapas do ambiente',
    interfacesWeb: 'Interfaces web',
    ultimoLote: 'Último lote concluído',
    semLote: 'Nenhum lote rodando',
    semLoteDica: 'Escolha uma lista e baixe tudo de uma vez, com a stack no ar. Fechar o app não interrompe o lote.',
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
            titulo: 'Vamos configurar o Soulcrate',
            subtitulo:
              'O assistente cria a pasta, gera o .env e o slskd.yml e liga a stack, sem você abrir nenhum arquivo. Leva poucos minutos.',
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
          return `${ctx.erros} ${plural(ctx.erros, 'problema', 'problemas')} no .env ou no slskd.yml. O assistente mostra o que falta e corrige.`;
        case 'config-sem-projeto':
          return 'Ainda não há uma pasta do Soulcrate. O assistente cria a pasta e a configuração.';
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
      abrirAssistente: 'Abrir o assistente',
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
    subtitulo: 'Pastas, contas e chaves da stack, e as preferências do app.',
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
    secoes: {
      grupoStack: 'Stack',
      grupoApp: 'App',
      aria: 'Seções',
      pastas: 'Pastas',
      soulseek: 'Conta Soulseek',
      webui: 'Web UI do slskd',
      rede: 'Rede',
      avancado: 'Avançado',
      conferencia: 'Conferência',
      app: 'Aplicativo',
      sobre: 'Sobre',
    },
    sempastaTitulo: 'Ainda não há uma pasta do Soulcrate',
    sempastaCorpo: 'O assistente cria a pasta, gera o .env e o slskd.yml e liga a stack sem você abrir nenhum arquivo.',
    abrirAssistente: 'Abrir o assistente de configuração',
    refazerAssistente: 'Refazer pelo assistente',
    abrirNoExplorer: 'Abrir no Explorer',
    outraPasta: 'Escolher outra pasta…',
    carregando: 'Lendo a configuração…',
    senhaConfigurada: 'Configurada',
    senha: 'Senha',
    trocarSenha: 'Trocar senha',
    gerarNova: 'Gerar nova',
    gerarNovaChave: 'Gerar nova chave',
    chaveSoLigada:
      'Ligue a stack para trocar a chave: o Soulbeet precisa receber a nova API key logo depois de ela mudar.',
    cancelarTroca: 'Cancelar a troca',
    senhaNuncaMostrada: 'Por segurança, senhas nunca aparecem nesta tela depois de gravadas.',
    chaveNoEnvEYml: 'API key no .env e no slskd.yml',
    chaveProblema: {
      ok: 'Iguais',
      ausente: 'Ausente',
      exemplo: 'De exemplo',
      diferentes: 'Diferentes',
    },
    rede: {
      abrir: 'Abrir as interfaces para outros aparelhos',
      abrirDica:
        'Libera Navidrome, Soulbeet e slskd na rede local (BIND_ADDR=0.0.0.0), para ouvir no celular, por exemplo. Desligado, só este PC acessa.',
      porta: 'Porta 2234 (Soulseek)',
      testar: 'Testar',
      testarDeNovo: 'Testar de novo',
      testando: 'Testando…',
      estado: {
        escutando: 'Escutando neste PC',
        livre: 'Nada escuta',
        ocupada: 'Em uso por outro programa',
        desconhecido: 'Não testada',
      },
      explicacao:
        'Redirecione a porta 2234/TCP do roteador para este PC. O app não consegue confirmar o redirecionamento daqui. Sem ele você ainda baixa, mas alguns usuários não conseguem se conectar a você, e quem não recebe conexões costuma ser despriorizado.',
      livre:
        'Nada atende na porta 2234 deste PC, embora a stack esteja no ar. Reinicie a stack; se continuar assim, confira se o Docker consegue publicar a porta.',
      ocupada:
        'Outro programa deste PC está usando a porta 2234 e a stack está desligada. Feche-o antes de ligar a stack, ou o slskd não consegue escutar.',
    },
    pendente: {
      titulo: 'Há alterações não gravadas',
      corpoDesligada: 'Valem na próxima vez que você ligar a stack.',
      corpoNoAr: 'Valem depois de reiniciar a stack. Um lote em andamento continua rodando durante o reinício.',
      descartar: 'Descartar',
      salvar: 'Salvar',
      aplicar: 'Aplicar e reiniciar',
      salvando: 'Gravando…',
      invalida: 'Corrija os campos marcados antes de gravar.',
    },
    gravado: {
      titulo: 'Configuração gravada',
      backup: (nomes: string) => `Backup: ${nomes}.`,
      reiniciando: 'Reiniciando a stack para valer as mudanças…',
    },
  },

  assistente: {
    titulo: 'Configuração inicial',
    sair: 'Sair do assistente',
    passosAria: 'Passos',
    barraAria: (n: number, total: number) => `Passo ${n} de ${total}`,
    escolher: {
      project: 'Escolha a pasta do Soulcrate',
      music: 'Escolha a pasta da biblioteca',
      downloads: 'Escolha a pasta dos downloads',
      incomplete: 'Escolha a pasta dos downloads incompletos',
    },
    passos: [
      'Pasta do Soulcrate',
      'Pastas das músicas',
      'Conta Soulseek',
      'Web UI do slskd',
      'Chaves',
      'Ajustes finos',
      'Revisar e gravar',
    ] as readonly string[],
    rotuloPasso: (n: number, total: number, opcional = false) =>
      `Passo ${n} de ${total}${opcional ? ' · opcional' : ''}`,
    voltar: 'Voltar',
    avancar: 'Avançar',
    gravar: 'Gravar e ligar a stack',
    gravando: 'Gravando…',
    preparando: 'Preparando a pasta…',
    escolherPasta: 'Escolher…',
    pasta: {
      vazia: 'Escolha uma pasta.',
      naoAbsoluta:
        'Informe o caminho completo da pasta, começando pelo disco (por exemplo C:\\Users\\você\\Soulcrate).',
      eArquivo: 'Esse caminho é um arquivo, não uma pasta.',
      naoExiste: 'Essa pasta não existe.',
      raizDoDisco: 'Escolha uma pasta dentro do disco, não o disco inteiro.',
      titulo: 'Onde fica o Soulcrate?',
      subtitulo: 'É a pasta com a stack, as listas e os relatórios. Os .bat continuam funcionando nela.',
      nova: 'Criar uma pasta nova',
      novaDica: 'O app copia os arquivos da stack para cá.',
      existente: 'Usar uma pasta do Soulcrate que já existe',
      existenteDica:
        'Para quem já usa pelo Git e pelos .bat. Nada é copiado; o app só confere e passa a gerenciar a pasta.',
      campo: 'Pasta',
      jaExistia: 'Essa pasta já tem o Soulcrate: o app vai usá-la como está, sem copiar nada.',
      copiados: (n: number) => `${n} arquivos da stack copiados.`,
    },
    pastas: {
      titulo: 'Pastas das músicas',
      subtitulo: 'Biblioteca e downloads precisam estar no mesmo disco para o beets mover os arquivos sem copiar.',
      music: 'Biblioteca',
      musicDica: 'MUSIC_DIR · o caixote final, organizado por gênero e artista',
      downloads: 'Downloads',
      downloadsDica: 'DOWNLOADS_DIR · arquivos prontos; o beets esvazia esta pasta',
      incomplete: 'Incompletos',
      incompleteDica: 'downloads em andamento',
      disco: (disco: string, livre: string | null) => (livre ? `Disco ${disco} · ${livre} livres` : `Disco ${disco}`),
      seraCriada: 'Será criada',
      mesmoDisco: 'Mesmo disco da biblioteca',
      outroDisco: 'Disco diferente da biblioteca',
      gravadoComo: (caminho: string) => `gravado como ${caminho}`,
      usarSugestao: (caminho: string) => `Usar ${caminho.replace(/\//g, '\\')}`,
      onedriveTitulo: 'Esta pasta está no OneDrive',
      discoExterno:
        'Se a pasta fica em um disco externo, mantenha o disco conectado enquanto a stack estiver no ar: sem ele o Docker não encontra a pasta.',
    },
    soulseek: {
      titulo: 'Sua conta no Soulseek',
      subtitulo:
        'Se ainda não tem conta, escolha um nome e uma senha: a conta é criada no primeiro login. O nome precisa ser único na rede.',
      usuario: 'Usuário',
      senha: 'Senha',
      senhaDica: 'Fica só no .env deste PC. O app não mostra esta senha de novo.',
      senhaMantida: 'Senha já configurada. Deixe em branco para manter.',
    },
    webui: {
      titulo: 'Acesso à interface do slskd',
      subtitulo: 'Login da tela de transferências em localhost:5030. Não é a conta do Soulseek.',
      usuario: 'Usuário',
      senha: 'Senha',
      gerar: 'Gerar senha',
      copiar: 'Copiar senha',
      copiada: 'Copiada',
      geradaDica:
        'Anote ou copie esta senha agora: o app não a mostra de novo. O mesmo usuário e senha entram no Navidrome e no Soulbeet.',
      dicaReuso: 'O mesmo usuário e senha também criam o administrador do Navidrome e o login do Soulbeet.',
      dicaTrocaDeSenha:
        'Trocar esta senha muda só o login do slskd. A senha do Navidrome e o login do Soulbeet continuam os de antes; se quiser trocá-los, faça nas próprias interfaces.',
    },
    chaves: {
      titulo: 'Chaves',
      subtitulo: 'Geradas aqui e gravadas nos dois arquivos ao mesmo tempo. Você não precisa ver nem copiar nada.',
      soulbeet: 'Chave secreta do Soulbeet',
      soulbeetOnde: 'SOULBEET_SECRET_KEY · .env',
      slskd: 'API key do slskd',
      slskdOnde: 'SLSKD_API_KEY_SOULBEET · .env e slskd.yml, idênticas',
      seraGerada: 'Será gerada',
      mantida: 'Mantida',
      seraTrocada: 'Será trocada',
      gerarNovas: 'Gerar novas chaves',
      cancelarNovas: 'Manter as chaves atuais',
      aviso: 'Chaves novas valem depois de reiniciar a stack; o Soulbeet recebe a nova API key sozinho.',
    },
    ajustes: {
      titulo: 'Ajustes finos',
      subtitulo: 'Os padrões servem para quase todo mundo.',
      tz: 'Fuso horário',
      tzDica: 'Vem do Windows.',
      puid: 'PUID',
      pgid: 'PGID',
      contato: 'Contato para o MusicBrainz',
      contatoPlaceholder: 'seu@email',
      contatoDica: 'MUSICBRAINZ_CONTATO · o MusicBrainz pede um contato de quem consulta o catálogo.',
    },
    revisao: {
      titulo: 'Revisar e gravar',
      subtituloNovo: 'O app cria o .env e o slskd.yml com o que você escolheu.',
      subtituloExistente: 'O .env e o slskd.yml já existem: o app faz um backup antes de gravar.',
      pasta: 'Pasta do Soulcrate',
      biblioteca: 'Biblioteca',
      downloads: 'Downloads',
      incompletos: 'Incompletos',
      contaSoulseek: 'Conta Soulseek',
      webui: 'Web UI do slskd',
      chaves: 'Chaves',
      chavesDescricao: (trocadas: boolean) =>
        trocadas ? 'novas · iguais nos dois arquivos' : 'geradas · iguais nos dois arquivos',
      chavesMantidas: 'mantidas · iguais nos dois arquivos',
      senhaConfigurada: 'senha configurada',
      criarPastas: 'Pastas que serão criadas',
      backup: 'Backup',
      avisos: 'Avisos',
    },
    fim: {
      rotulo: 'Pronto',
      tituloRodando: 'Configuração gravada. Ligando a stack.',
      tituloOk: 'Tudo pronto. A stack está no ar.',
      tituloAtencao: 'Configuração gravada. Falta terminar um passo.',
      subtitulo: 'O app agora termina sozinho o que antes era feito à mão nas interfaces web.',
      irParaInicio: 'Ir para o Início',
      tentarDeNovo: 'Tentar de novo',
      loginTitulo: 'Esse Navidrome já tem um administrador',
      loginCorpo:
        'Informe o usuário e a senha dele. Eles servem também para o login do Soulbeet e não ficam guardados.',
      loginUsuario: 'Usuário do Navidrome',
      loginSenha: 'Senha do Navidrome',
      loginContinuar: 'Continuar',
      loginErrado: 'Esse usuário e senha não entraram no Navidrome.',
      construindo: 'O primeiro build leva de 5 a 10 minutos.',
      /** o nome da tarefa fala no passado só quando ela terminou (no protótipo: "Stack no ar", "…criado") */
      tarefa(id: TarefaSetupId, estado: TarefaEstado, detalhe: string | null): string {
        switch (id) {
          case 'gravar':
            return '.env e slskd/slskd.yml gravados';
          case 'stack':
            return estado === 'feito' ? 'Stack no ar' : 'Ligar a stack';
          case 'navidrome':
            return estado === 'feito' && detalhe === null
              ? 'Administrador do Navidrome criado'
              : 'Administrador do Navidrome';
          case 'soulbeet':
            return 'Soulbeet: URL do slskd, API key e pasta /music';
          case 'porta':
            return 'Conferir a porta 2234';
        }
      },
      tarefasAria: 'Tarefas',
      estado: {
        feito: 'Feito',
        agora: 'Agora',
        depois: 'Depois',
        erro: 'Erro',
        aviso: 'Atenção',
        'precisa-login': 'Precisa de login',
      },
    },
  },

  lote: {
    rotulo: 'Baixar lista',
    etapas: {
      rotulo: 'Etapas do lote',
      lista: 'Lista',
      opcoes: 'Opções',
      execucao: 'Execução',
    },
    lista: {
      salvaAgora: 'salva agora',
      salvaHa: (tempo: string) => `salva há ${tempo}`,
      salvando: 'salvando…',
      naoSalva: 'alterações não salvas',
      listasRecentes: 'Listas recentes',
      novaDoExemplo: 'Nova a partir do exemplo',
      novaEmBranco: 'Nova em branco',
      importar: 'Importar .txt ou .csv',
      importarTitulo: 'Importar lista',
      filtroArquivos: 'Listas (.txt e .csv)',
      salvar: 'Salvar',
      editor: 'Editor da lista',
      textoDaLista: 'Texto da lista',
      cabecalhoEditor: 'Uma faixa por linha · Artista - Título (Mix)',
      linhas: (n: number) => `${n} ${plural(n, 'linha', 'linhas')}`,
      dica: 'Solte um .txt ou .csv do Spotify na janela, ou cole uma tracklist: numeração, traço longo e duração são limpos sozinhos.',
      somenteLeitura:
        'Lista em CSV: o app só lê. O lote usa as colunas de artista e título; para mudar a lista, edite o arquivo em outro programa.',
      previa: 'Pré-visualização',
      comoVaiLer: 'Como o lote vai ler',
      atualizando: 'Atualizando…',
      paraBaixar: (n: number) => `${n} para baixar`,
      duplicadas: (n: number) => `${n} ${plural(n, 'duplicada', 'duplicadas')}`,
      naBiblioteca: (n: number) => `${n} na biblioteca`,
      jaFeitas: (n: number) => `${n} ${plural(n, 'já feita', 'já feitas')}`,
      colunas: { numero: '#', artista: 'Artista', titulo: 'Título', mix: 'Mix', aviso: 'Aviso' },
      previaVazia: 'Nenhuma faixa ainda. Escreva ou cole faixas ao lado.',
      analiseFalhou: 'Não consegui ler a lista',
      avisos: {
        duplicada: (linha: number) => `Duplicada · linha ${linha}`,
        naBiblioteca: 'Já na biblioteca',
        jaFeita: 'Feita em execução anterior',
        ignorada: 'Ignorada',
        semTraco: 'Falta o " - "',
        tituloVazio: 'Título vazio',
        remixer: 'Artista é o remixer: aceita qualquer original',
      },
      retomada: {
        titulo: (data: string) => `Esta lista já rodou em ${data}.`,
        corpo: (feitas: number) =>
          feitas > 0
            ? `O lote continua de onde parou e pula ${feitas === 1 ? 'a faixa já feita' : `as ${feitas} faixas já feitas`}.`
            : 'Nada do que já foi feito será pulado.',
        retentar: 'Tentar de novo as que falharam',
      },
      rodandoAgora: 'Esta lista está rodando agora.',
      verExecucao: 'Ver execução',
      rodapeFaixas: (n: number) => (n === 1 ? 'faixa para baixar' : 'faixas para baixar'),
      opcoesPadrao: 'Opções: padrão',
      opcoesAlteradas: (n: number) => `Opções: padrão, com ${n} ${plural(n, 'alteração', 'alterações')}`,
      revisarOpcoes: 'Revisar opções',
      iniciar: 'Iniciar lote',
      iniciando: 'Iniciando…',
      semFaixas: 'Não há faixas para baixar nesta lista.',
      vazio: {
        titulo: 'Escolha uma lista',
        corpo:
          'Uma faixa por linha, no formato Artista - Título (Mix). Abra uma lista que você já tem, importe um .txt ou .csv, ou comece pelo exemplo.',
      },
      recentes: {
        titulo: 'Listas recentes',
        corpo: 'Listas que estão na pasta do Soulcrate, da mais recente para a mais antiga.',
        vazio: 'Nenhuma lista na pasta do Soulcrate ainda.',
        fechar: 'Fechar',
      },
      soltar: 'Solte um .txt ou .csv para importar',
      erroAbrir: 'Não consegui abrir a lista',
      erroSalvar: 'Não consegui salvar a lista',
      erroImportar: 'Não consegui importar o arquivo',
      soTxtCsv: 'Só arquivos .txt e .csv podem ser importados.',
    },
    opcoes: {
      receitas: 'Receitas',
      receitasDica: 'Um clique ajusta as opções para a situação.',
      avancadas: 'Avançadas',
      avancadasDica: 'Ritmo, filas e tentativas',
      diferente: '≠ PADRÃO',
      padrao: (v: string) => `PADRÃO ${v}`,
      alteradas: (n: number) => `${n} ${plural(n, 'ALTERADA', 'ALTERADAS')}`,
      resumo: 'Resumo',
      nenhuma: 'Nenhuma opção diferente do padrão do script',
      algumas: (n: number) => `${plural(n, 'opção diferente', 'opções diferentes')} do padrão do script`,
      equivale: 'Equivale a rodar',
      restaurar: 'Restaurar padrões',
      conferirStack: 'Antes de começar, o app confere se a stack está no ar e oferece ligá-la.',
      iniciar: (n: number) => `Iniciar lote · ${n} ${plural(n, 'faixa', 'faixas')}`,
      iniciarSemContagem: 'Iniciar lote',
      diminuir: (titulo: string) => `Diminuir: ${titulo}`,
      aumentar: (titulo: string) => `Aumentar: ${titulo}`,
      grupos: {
        qualidade: { nome: 'Qualidade', desc: 'O que aceitar além de FLAC e MP3 320' },
        titulos: { nome: 'Títulos', desc: 'Como comparar o título da linha com o do arquivo' },
        comportamento: { nome: 'Comportamento', desc: 'O que fazer com o que já foi feito' },
        ritmo: { nome: 'Ritmo', desc: '' },
        filas: { nome: 'Filas e tentativas', desc: '' },
      },
      itens: {
        AceitarWav: { titulo: 'Aceitar WAV e AIFF', desc: 'Aceita WAV e AIFF antes do MP3.' },
        AceitarMp3Menor: {
          titulo: 'Aceitar MP3 256 e VBR (V0)',
          desc: 'Quando a faixa não existe em FLAC nem em MP3 320.',
        },
        TituloAproximado: {
          titulo: 'Aceitar títulos com palavras a mais',
          desc: 'Tentados por último e marcados para conferir no resultado.',
        },
        NaoTolerarGrafia: {
          titulo: 'Exigir o título sem erros de digitação',
          desc: 'Por padrão, "Abaddon" também acha "Abbadon".',
        },
        SemCatalogo: {
          titulo: 'Não conferir os títulos no MusicBrainz',
          desc: 'Começa a buscar antes, mas não corrige títulos errados.',
        },
        PularForaDoCatalogo: {
          titulo: 'Pular títulos que não existem no catálogo',
          desc: 'Nem busca. Corrija a lista com o relatório do catálogo.',
        },
        Retentar: { titulo: 'Tentar de novo o que falhou antes', desc: 'Necessário ao rodar a mesma lista outra vez.' },
        NaoPularExistentes: {
          titulo: 'Baixar mesmo o que já está na biblioteca',
          desc: 'Para trocar um arquivo ruim que já foi apagado.',
        },
        SemBeets: { titulo: 'Só baixar, sem organizar', desc: 'Os arquivos ficam em downloads/ para importar depois.' },
        SemBuscaArtista: {
          titulo: 'Não buscar só pelo nome do artista',
          desc: 'Mais rápido em listas enormes, mas acha menos.',
        },
        Paralelo: { titulo: 'Downloads simultâneos', desc: '' },
        Buscas: { titulo: 'Buscas simultâneas', desc: '' },
        BuscasPorJanela: { titulo: 'Buscas a cada 220 s', desc: '' },
        PausaBloqueioMin: { titulo: 'Pausa quando o servidor bloqueia', desc: '' },
        Tentativas: { titulo: 'Usuários ou arquivos tentados por faixa', desc: '' },
        FilaMaxMin: { titulo: 'Espera na fila de um usuário', desc: '' },
        FilaUltimoMin: { titulo: 'Espera quando é o último usuário', desc: '' },
        DownloadMaxMin: { titulo: 'Tempo máximo de cada transferência', desc: '' },
        LoteBeets: { titulo: 'Faixas por chamada do beets', desc: '' },
      } satisfies Record<OpcaoId, { titulo: string; desc: string }>,
      receitasNomes: {
        listaGrande: 'Lista grande, internet boa',
        usuariosLentos: 'Usuários lentos, filas longas',
        querTudo: 'Quero tudo, nem que seja MP3 256',
        tentarDeNovo: 'Tentar de novo as que falharam',
        soBaixar: 'Só baixar, organizar depois',
        buscasSemResposta: 'Muitas buscas sem resposta',
        titulosDuvidosos: 'Muitos títulos duvidosos',
        titulosIncompletos: 'Títulos da lista incompletos',
        listaEnormeComPressa: 'Lista enorme e com pressa',
      } as Record<string, string>,
    },
    antesDeIniciar: {
      semStackTitulo: 'A stack não está no ar',
      semStackCorpo:
        'Para baixar, o slskd precisa estar rodando. O app liga a stack e começa o lote assim que os serviços estiverem saudáveis. Na primeira vez, o build leva de 5 a 10 minutos.',
      ligarEComecar: 'Ligar e começar',
      ligandoTitulo: 'Ligando a stack…',
      ligandoCorpo: 'Esperando os serviços ficarem saudáveis. O lote começa sozinho em seguida.',
      naoDaTitulo: 'Não dá para ligar a stack agora',
      naoDaCorpo: (motivo: string) =>
        `${motivo}. Resolva isso no Início e volte aqui; sua lista e suas opções ficam como estão.`,
      irParaInicio: 'Ir para o Início',
      cancelar: 'Cancelar',
      demorou: 'A stack não ficou saudável a tempo. Veja os serviços e tente de novo.',
    },
    execucao: {
      rotulo: (id: string) => `Baixar lista · execução ${id}`,
      vazio: {
        titulo: 'Nenhum lote em execução',
        corpo: 'Escolha uma lista, revise as opções e inicie o lote. O painel ao vivo aparece aqui.',
        irParaLista: 'Ir para a lista',
      },
      estado: {
        preparando: 'Iniciando',
        rodando: 'Rodando',
        pausado: 'Buscas pausadas',
        parando: 'Parando',
        completed: 'Concluído',
        user: 'Parado pelo usuário',
        error: 'Terminou com erro',
        slskd_down: 'slskd não respondeu',
        config: 'Configuração inválida',
        locked: 'Lista já estava rodando',
        interrupted: 'Interrompido',
      } satisfies Record<string, string>,
      abrirPasta: 'Abrir pasta lotes',
      parar: 'Parar',
      abrirResultado: 'Abrir resultado',
      abrirNaoBaixadas: 'Abrir não baixadas',
      novaExecucao: 'Voltar à lista',
      faixa: {
        iniciando: ['Iniciando o lote…', 'Esperando o primeiro sinal do script.'] as const,
        catalogo: (feitas: number, total: number) =>
          ['Conferindo os títulos no MusicBrainz', `${feitas}/${total} faixas conferidas antes de buscar.`] as const,
        janelaCheia: (limite: number, janela: number) =>
          [
            'Limite de buscas atingido',
            `${limite} buscas a cada ${janela} s. As próximas buscas começam em instantes; os downloads seguem normalmente.`,
          ] as const,
        pausado: (hora: string) =>
          [
            `Buscas pausadas até ${hora}`,
            'O servidor do Soulseek não respondeu nem à busca de teste. Os downloads continuam; as buscas voltam sozinhas.',
          ] as const,
        parando: [
          'Finalizando e gravando relatórios…',
          'Esperando os downloads em andamento terminarem a etapa atual. Não feche o Soulcrate à força.',
        ] as const,
        gravados: [
          'Relatórios gravados em lotes/',
          'resultado, não baixadas, diagnóstico e catálogo desta execução.',
        ] as const,
        concluido: ['Lote concluído', 'Os relatórios desta execução estão em lotes/.'] as const,
      },
      avisoSlskd: 'O slskd não respondeu',
      avisoMusicbrainz: 'MusicBrainz indisponível',
      progresso: 'Progresso',
      concluidas: 'concluídas',
      rodandoHa: 'rodando há',
      faltam: 'faltam',
      calculando: 'calculando…',
      barra: (c: { baixadas: number; atencao: number; puladas: number; andamento: number; aguardando: number }) =>
        `Progresso por faixa: ${c.baixadas} baixadas, ${c.atencao} com atenção, ${c.puladas} puladas, ${c.andamento} em andamento, ${c.aguardando} aguardando`,
      contadores: {
        buscando: 'Buscando',
        baixando: 'Baixando',
        naFila: 'Na fila',
        beets: 'Beets',
        aguardando: 'Aguardando',
        baixadas: 'Baixadas',
        naoAchadas: 'Não achadas',
        falhas: 'Falhas',
        puladas: 'Puladas',
      },
      abas: { visao: 'Visão', faixas: 'Faixas', log: 'Log bruto' },
      filtros: {
        todas: 'Todas',
        andamento: 'Em andamento',
        concluida: 'Concluídas',
        atencao: 'Atenção',
        pulada: 'Puladas',
      },
      buscar: 'Buscar artista ou título',
      buscarRotulo: 'Buscar faixa',
      colunas: {
        numero: '#',
        faixa: 'Faixa',
        status: 'Status',
        formato: 'Formato',
        usuario: 'Usuário',
        tentativa: 'Tent.',
        observacao: 'Observação',
      },
      tabelaVazia: 'Nenhuma faixa neste filtro.',
      tabela: 'Faixas do lote',
      logVazio: 'Nenhuma saída ainda.',
      log: 'Log bruto do lote',
    },
    fim: {
      sumiu:
        'O processo do lote terminou sem registrar o fim (foi encerrado à força ou o PC foi desligado). Rode a lista de novo: ela continua de onde parou.',
      naoComecou: 'O lote não chegou a começar.',
    },
    status: {
      aguardando: 'Aguardando',
      buscando: 'Buscando',
      aguardandoVaga: 'Aguardando vaga',
      baixando: 'Baixando',
      naFila: 'Na fila do usuário',
      organizando: 'Organizando (beets)',
      naBiblioteca: 'Na biblioteca',
      baixada: 'Baixada (não organizada)',
      beetsFalhou: 'Baixada, beets falhou',
      jaEstavaNaBiblioteca: 'Já estava na biblioteca',
      jaFeita: 'Feita em execução anterior',
      naoEncontrada: 'Não encontrada',
      falhou: 'Falhou',
    },
    observacao: {
      tituloCorrigido: (linha: string) => `título corrigido: ${linha}`,
      busca: (etapa: number, etapas: number, consulta: string) => `busca ${etapa}/${etapas}: ${consulta}`,
      candidatos: (n: number) => `${n} ${plural(n, 'candidato', 'candidatos')}`,
      naFilaDoUsuario: 'na fila do usuário',
      organizando: 'importando no beets',
      tentativaFalhou: (motivo: string) => `tentativa anterior falhou (${motivo})`,
    },
    notificacao: {
      titulo: {
        completed: 'Lote concluído',
        user: 'Lote parado',
        error: 'O lote terminou com erro',
        slskd_down: 'O slskd não respondeu',
        config: 'Configuração inválida',
        locked: 'Esta lista já estava rodando',
        interrupted: 'Lote interrompido',
      } satisfies Record<MotivoFim, string>,
      contagem: (r: ResumoFim) =>
        `${r.ok} ${plural(r.ok, 'baixada', 'baixadas')} · ${r.naoAchadas} ${plural(r.naoAchadas, 'não encontrada', 'não encontradas')} · ${r.falhas} ${plural(r.falhas, 'falha', 'falhas')}`,
      buscasPausadasTitulo: 'Buscas pausadas',
      buscasPausadasCorpo: (hora: string, lista: string | null) =>
        `${lista ? `${lista}: ` : ''}o servidor do Soulseek bloqueou as buscas até ${hora}. Os downloads continuam.`,
    },
    sidebar: {
      rodando: 'Lote rodando',
      terminou: 'Lote terminou',
      progresso: (feitas: number, total: number, eta: number | null) =>
        `${feitas}/${total}${eta !== null ? ` · ~${eta} min` : ''}`,
    },
    inicio: {
      rodando: 'Lote rodando',
      terminou: 'Último lote',
      ver: 'Ver execução',
      baixarLista: 'Baixar uma lista',
      progresso: (feitas: number, total: number) => `${feitas}/${total} concluídas`,
    },
  },

  historico: {
    rotulo: 'Histórico',
    titulo: 'Execuções',
    subtitulo: 'Tudo o que está em lotes/, inclusive o que foi rodado pelos .bat.',
    apagarAntigas: 'Apagar execuções antigas…',
    abrirPasta: 'Abrir pasta lotes',
    filtros: { todas: 'Todas', faltas: 'Com faixas que não vieram' },
    tabela: 'Execuções',
    colunas: {
      quando: 'Quando',
      lista: 'Lista',
      duracao: 'Duração',
      resultado: 'Resultado',
      fim: 'Fim',
      acoes: 'Ações',
    },
    hoje: 'Hoje',
    ontem: 'Ontem',
    semLista: 'lista não registrada',
    semDuracao: '—',
    fonte: {
      eventos: 'eventos',
      aoVivo: 'eventos ao vivo',
      resultado: 'antiga · lida do resultado-*.txt',
      log: 'antiga · só o log da tela',
    },
    resumo: {
      completo: (c: { ok: number; naoVieram: number; puladas: number; atencao: number }) =>
        [
          `${c.ok} na biblioteca`,
          `${c.naoVieram} não ${plural(c.naoVieram, 'veio', 'vieram')}`,
          `${c.puladas} ${plural(c.puladas, 'pulada', 'puladas')}`,
          ...(c.atencao > 0 ? [`${c.atencao} com o beets falhando`] : []),
        ].join(' · '),
      parou: (ok: number, naoIniciadas: number) =>
        `${ok} na biblioteca · ${naoIniciadas} ${plural(naoIniciadas, 'não iniciada', 'não iniciadas')}`,
      rodando: (feitas: number, total: number) => `${feitas}/${total} concluídas`,
      semFaixas: 'nenhuma faixa registrada',
    },
    verFaltas: 'Ver faltas',
    abrir: 'Abrir',
    abrirNoPainel: 'Ver ao vivo',
    vazio: {
      titulo: 'Nenhuma execução ainda',
      corpo: 'Quando você rodar uma lista, pelo app ou pelo .bat, ela aparece aqui com o resultado de cada faixa.',
      irParaLista: 'Baixar uma lista',
    },
    filtroVazio: 'Nenhuma execução com faixas que não vieram.',
    semRelatorio:
      'Esta execução não gravou relatório: só o log da tela sobrou. Provavelmente foi interrompida ou deu erro antes do fim.',
    erroCarregar: 'Não consegui ler a pasta lotes',
    carregando: 'Lendo a pasta lotes…',
    avisoEmAndamento: 'Esta execução ainda está rodando. Os números abaixo acompanham o lote.',
    verAoVivo: 'Ver painel ao vivo',

    detalhe: {
      voltar: 'Histórico',
      rotulo: (id: string, quando: string, duracao: string | null) =>
        `Execução ${id} · ${quando}${duracao ? ` · ${duracao}` : ''}`,
      listaDesconhecida: 'lista não registrada',
      reprocessar: 'Reprocessar a lista do zero…',
      tentarDeNovo: (n: number) => `Tentar de novo ${n === 1 ? 'a faixa' : `as ${n}`}`,
      cartoes: {
        naBiblioteca: 'Na biblioteca',
        naoEncontradas: 'Não encontradas',
        falharam: 'Falharam',
        paraConferir: 'Para conferir',
        naoTerminadas: 'Não terminadas',
      },
      filtros: {
        todas: 'Todas',
        bib: 'Na biblioteca',
        nao: 'Não vieram',
        conf: 'Para conferir',
        inc: 'Não terminadas',
      },
      tabela: 'Faixas da execução',
      tabelaVazia: 'Nenhuma faixa neste filtro.',
      semFaixas:
        'Esta execução não registrou nenhuma faixa. Se terminou com erro, a explicação está no cartão acima e no log.',
      colunas: { status: 'Status', faixa: 'Faixa', arquivo: 'Arquivo na biblioteca', acoes: 'Ações' },
      mostrarNoExplorer: 'Mostrar no Explorer',
      mostrarNoExplorerDe: (linha: string) => `Mostrar no Explorer: ${linha}`,
      porQue: 'Por quê?',
      porQueDe: (linha: string) => `Por que não veio: ${linha}`,
      emDownloads: 'ainda em downloads/ (não organizada)',
      arquivoNaoAchado: 'não achei em music/',
      arquivoNaoAchadoDica:
        'O beets move e renomeia o arquivo; o app o procura em music/ pelo título. Se você mudou as tags ou apagou o arquivo, ele não aparece.',
      relatorios: 'Relatórios em lotes/',
      relatoriosVazio: 'Nenhum relatório desta execução está em lotes/.',
      abrirArquivo: (nome: string) => `Abrir ${nome}`,
      opcoesUsadas: 'Opções usadas',
      opcoesPadrao: 'padrão do script',
      opcoesNaoRegistradas: 'não registradas (execução antiga, sem eventos)',
      semDiagnostico: 'Sem diagnóstico',
      naoAbriu: 'Não consegui abrir o arquivo.',
      naoMostrou: 'Não achei o arquivo no disco.',
      naoExiste: {
        titulo: 'Execução não encontrada',
        corpo:
          'Os arquivos desta execução não estão mais em lotes/. Ela pode ter sido apagada ou a pasta do Soulcrate mudou.',
      },
    },

    arquivos: {
      resultado: 'Status e caminho de cada faixa',
      'nao-baixadas': (n: number | null) =>
        n === null ? 'As linhas que faltaram' : `${n === 1 ? 'A linha que faltou' : `As ${n} linhas que faltaram`}`,
      diagnostico: 'Por que não vieram',
      catalogo: 'Conferência no MusicBrainz',
      beets: 'Saída do beets',
      log: 'Tudo o que apareceu na tela',
    },

    reprocessar: {
      titulo: 'Reprocessar a lista do zero?',
      corpo: (lista: string, feitas: number) =>
        `O app vai apagar a memória de ${lista}${feitas > 0 ? ` (${feitas} ${plural(feitas, 'faixa registrada', 'faixas registradas')})` : ''}. Na próxima execução, nada será pulado por já ter sido feito: o lote busca tudo de novo. A biblioteca e os relatórios não mudam.`,
      aviso: 'O arquivo vai para a Lixeira; dá para restaurá-lo de lá.',
      semMemoria: 'Esta lista não tem memória a apagar: ela nunca rodou, ou já foi reprocessada.',
      rodando: 'Esta lista está rodando agora. Espere o lote terminar.',
      confirmar: 'Reprocessar do zero',
      cancelar: 'Cancelar',
      pronto: (lista: string) => `A memória de ${lista} foi para a Lixeira. A próxima execução começa do zero.`,
      erro: 'Não consegui apagar a memória da lista',
    },

    limpar: {
      titulo: 'Apagar execuções antigas',
      corpo:
        'Os relatórios e o log de cada execução vão para a Lixeira. A memória das listas (o que já foi feito) e a biblioteca não mudam. Execuções em andamento ficam.',
      criterio: 'O que apagar',
      opcoes: {
        dias30: 'Mais antigas que 30 dias',
        dias90: 'Mais antigas que 90 dias',
        dias180: 'Mais antigas que 6 meses',
        manter10: 'Tudo, menos as 10 mais recentes',
        manter30: 'Tudo, menos as 30 mais recentes',
      },
      previa: (execucoes: number, arquivos: number, tamanho: string) =>
        `${execucoes} ${plural(execucoes, 'execução', 'execuções')} · ${arquivos} ${plural(arquivos, 'arquivo', 'arquivos')} · ${tamanho}`,
      nada: 'Nenhuma execução se encaixa neste critério.',
      calculando: 'Conferindo…',
      confirmar: 'Mandar para a Lixeira',
      cancelar: 'Cancelar',
      apagando: 'Apagando…',
      pronto: (execucoes: number) =>
        `${execucoes} ${plural(execucoes, 'execução foi para a Lixeira', 'execuções foram para a Lixeira')}.`,
      falhas: (n: number) =>
        `${n} ${plural(n, 'arquivo não pôde ser apagado', 'arquivos não puderam ser apagados')} (talvez abertos em outro programa).`,
      erro: 'Não consegui apagar',
    },

    diagnostico: {
      voltar: (lista: string, quando: string) => `${lista} · ${quando}`,
      rotulo: 'Diagnóstico',
      titulo: (n: number) => (n === 1 ? '1 faixa não veio' : `${n} faixas não vieram`),
      tituloNenhuma: 'Nenhuma faixa ficou de fora',
      subtitulo: 'Para cada uma: o que foi encontrado, por que foi recusado e o que fazer.',
      semFaltas: {
        titulo: 'Nada para diagnosticar',
        corpo: 'Todas as faixas desta execução vieram, foram puladas ou ainda estão em andamento.',
        voltar: 'Voltar à execução',
      },
      nav: 'Faixas',
      corrigida: 'Corrigida',
      musicbrainz: (r: string) => `MusicBrainz: ${r}`,
      linha: (n: number, lista: string) => `linha ${n} de ${lista}`,
      buscas: (b: string) => `buscas: ${b}`,
      buscaArtista: (a: string) => `[artista] ${a}`,
      semBuscas: 'buscas: nenhuma registrada',
      talvezSeja: 'Talvez seja',
      cliquePara: 'Clique para corrigir a linha na lista.',
      doCatalogo: 'Títulos do catálogo do artista também servem: clique em um deles abaixo.',
      corrigindo: 'Corrigindo…',
      corrigidaAviso: 'entra no próximo "tentar de novo"',
      listaAtualizada: (lista: string, n: number) => `${lista} também foi atualizada (linha ${n}).`,
      listaNaoAtualizada: {
        'sem-lista':
          'A lista desta execução não está mais na pasta do Soulcrate: só o "tentar de novo" leva a correção.',
        csv: 'A lista é um CSV, que o app só lê: só o "tentar de novo" leva a correção.',
        'nao-achou':
          'Não achei esta linha na lista (ela mudou desde a execução): só o "tentar de novo" leva a correção.',
        editando: 'A lista está aberta no editor com alterações não salvas: só o "tentar de novo" leva a correção.',
        generico: 'Só o "tentar de novo" leva a correção: a lista original não foi mexida.',
      },
      desfazer: 'Desfazer',
      erroCorrigir: 'Não consegui corrigir a linha',
      desfazerSemLista:
        'A correção foi esquecida, mas a linha na lista já não está como o app a deixou e não foi mexida.',
      porQueRecusada: 'Por que foi recusada · o que fazer',
      semMotivos: {
        rotulo: 'Sem motivos registrados',
        acao: 'Esta execução não guardou os motivos desta faixa. Veja o diagnostico-*.txt ou o log da execução.',
      },
      maisParecidos: 'Arquivos mais parecidos',
      tentativasFalhas: 'Tentativas que falharam',
      semArquivos: 'Nenhum arquivo com o título ou o artista apareceu.',
      semTentativas: 'Nenhuma tentativa de download foi registrada.',
      catalogo: (artista: string) => `Catálogo de ${artista} no Soulseek`,
      catalogoVazio: 'A busca só pelo artista não achou nenhuma faixa dele.',
      catalogoNaoBuscado: 'O catálogo do artista não foi consultado nesta execução.',
      usuarios: (n: number) => `${n} ${plural(n, 'usuário', 'usuários')}`,
      usarTitulo: (t: string) => `Usar o título ${t}`,
      mostrarTodos: (n: number) => `Mostrar os ${n}`,
      mostrarMenos: 'Mostrar menos',
      opcoesCatalogo: 'Catálogo',
      rodape: {
        titulo: (n: number) => `Tentar de novo ${n === 1 ? 'a faixa' : `as ${n}`}`,
        antes: 'Gera',
        depois: 'com as correções e abre o lote com as opções sugeridas pelos motivos:',
        opcoesPadrao: 'as opções padrão do script',
        revisar: 'Revisar e tentar de novo',
        gerando: 'Gerando a lista…',
        erro: 'Não consegui gerar a lista',
        retentarAviso: 'Esta lista já rodou: o -Retentar tenta de novo o que falhou.',
      },
      abrirSoulbeet: 'Abrir o Soulbeet',
      receitaUsuariosLentos: 'Receita: usuários lentos',
      selecionar: (linha: string) => `Ver o diagnóstico de ${linha}`,
    },

    mb: {
      OK: 'OK',
      CORRIGIDO: 'Título corrigido',
      'NAO EXISTE': 'NÃO EXISTE',
      'NAO CONFIRMADO': 'NÃO CONFIRMADO',
      'SEM DADOS': 'SEM DADOS',
      INDISPONIVEL: 'INDISPONÍVEL',
    } as Record<string, string>,

    via: {
      buscaArtista: 'veio da busca pelo artista',
      tituloAproximado: (titulo: string) => `título aproximado: "${titulo}" · confira`,
      tituloOriginal: 'usou o título original da lista (a correção do catálogo não achou)',
      beetsFalhou: 'baixada, mas o beets falhou: importe depois (BEET import) ou rode de novo',
    },

    resumoDaFalta: {
      tituloErrado: 'Título provavelmente errado',
      soFormato: 'Só existe em formato não aceito',
      usuarios: 'Usuários não entregaram a tempo',
      ninguemTem: 'Ninguém compartilha',
      semCompativel: 'Respostas sem arquivo compatível',
      erroInterno: 'Erro ao processar a busca',
      generico: 'Veja o diagnóstico',
    },

    motivos: {
      wav: {
        rotulo: (ext: string) => `Formato ${ext.toUpperCase()}`,
        acao: 'Só existe em WAV ou AIFF, que o lote só aceita com -AceitarWav. Rode de novo com essa opção.',
      },
      mp3Menor: {
        rotulo: (detalhe: string) => `MP3 ${detalhe}`,
        acao: 'Só existe em MP3 abaixo de 320 kbps, que o lote só aceita com -AceitarMp3Menor. Rode de novo com essa opção.',
      },
      mp3Baixo: {
        rotulo: (detalhe: string) => `MP3 ${detalhe}`,
        acao: 'Só existe em qualidade baixa (menos de 256 kbps). Compre a faixa ou procure outra versão.',
      },
      formato: {
        rotulo: (ext: string) => `Formato ${ext}`,
        acao: 'Só existe nesse formato, que o lote não aceita. Compre a faixa ou baixe pelo Soulbeet, escolhendo o arquivo na mão.',
      },
      titulo: {
        rotulo: 'Título diferente',
        acaoComSugestao:
          'O título da linha provavelmente está errado. Escolha um dos títulos sugeridos acima ou do catálogo do artista.',
        acao: 'O título da linha provavelmente está errado. Confira a grafia ou escolha um dos títulos do catálogo do artista.',
      },
      outroArtista: {
        rotulo: (nome: string) => (nome ? `Outro artista no nome: ${nome}` : 'Outro artista no nome'),
        acao: 'O arquivo é de outro artista, numa pasta com o nome do seu. A recusa estava certa.',
      },
      tituloComArtista: {
        rotulo: 'Título só aparece junto do nome do artista',
        acao: 'O título é uma palavra que também aparece no nome dos artistas (ex.: "X"). A recusa estava certa.',
      },
      palavraExtra: {
        rotulo: (palavra: string) => (palavra ? `Palavra a mais no título: ${palavra}` : 'Palavra a mais no título'),
        acao: 'O arquivo tem o título da linha mais alguma palavra. Se o título completo é outro, corrija a linha ou rode com -TituloAproximado. Se for outra faixa (como "Northern Power"), a recusa estava certa.',
      },
      artista: {
        rotulo: 'Artista não aparece',
        acao: 'Troque o artista principal na linha (ex.: pelo outro colaborador).',
      },
      mix: { rotulo: 'Mix diferente', acao: 'Confira o nome exato do remix.' },
      versao: {
        rotulo: (v: string) => (v ? `Outra versão (${v})` : 'Outra versão'),
        acao: (v: string) =>
          v
            ? `Só existe a versão "${v}". Se servir, escreva-a entre parênteses na linha (ex.: "(... ${v})").`
            : 'Só existe outra versão. Se servir, escreva o nome dela entre parênteses na linha.',
      },
      bloqueado: {
        rotulo: 'Arquivo bloqueado pelo usuário',
        acao: 'O dono não libera o download deste arquivo. Tente outro dia ou procure outra versão.',
      },
      curto: {
        rotulo: 'Arquivo curto demais (prévia)',
        acao: 'É só uma prévia de menos de 90 segundos. A recusa estava certa.',
      },
      ilegivel: {
        rotulo: 'Nome de arquivo ilegível',
        acao: 'O nome do arquivo não pôde ser lido e foi ignorado. Nada a fazer.',
      },
      semRespostas: {
        rotulo: '0 respostas',
        acao: 'Ninguém compartilha nada desse artista no momento. Confira a grafia do artista, tente outro dia ou compre a faixa.',
      },
      semCompativel: {
        rotulo: (n: number) => `${n} ${plural(n, 'resposta', 'respostas')}, nenhuma compatível`,
        acao: 'Havia respostas, mas nenhum arquivo servia. Confira o título e o artista da linha.',
      },
      fila: {
        rotulo: 'Fila longa demais',
        acao: 'Havia candidatos, mas ficaram na fila do usuário por mais tempo que o limite. Tente de novo dando mais tempo à fila e à transferência.',
      },
      tempo: {
        rotulo: 'Transferência demorou demais',
        acao: 'Havia candidatos, mas a transferência passou do tempo máximo. Tente de novo dando mais tempo à fila e à transferência.',
      },
      erroUsuario: {
        rotulo: (estado: string) => (estado ? `A transferência falhou (${estado})` : 'A transferência falhou'),
        acao: 'O usuário ficou offline, recusou o pedido ou a transferência deu erro. Tente de novo mais tarde: o app tenta outro usuário.',
      },
      sumiu: {
        rotulo: 'Transferência sumiu da fila',
        acao: 'O slskd perdeu a transferência. Tente de novo.',
      },
      naoEnfileirou: {
        rotulo: 'Não consegui enfileirar o download',
        acao: 'O slskd recusou o pedido. Confira se ele está saudável em Serviços e tente de novo.',
      },
      erroInterno: {
        rotulo: 'Erro ao processar a busca',
        acao: 'Falha interna do script. Abra o log desta execução; se repetir, copie os detalhes e abra um problema.',
      },
      desconhecido: {
        rotulo: (bruto: string) => bruto,
        acao: 'Motivo que o app ainda não conhece. Veja o arquivo mais parecido abaixo.',
      },
    },
  },

  biblioteca: {
    rotulo: 'Biblioteca',
    titulo: 'O caixote',
    /** `D:\Musica\Soulcrate\music · 1.204 faixas` */
    subtitulo: (pasta: string, n: number) => `${pasta} · ${n.toLocaleString('pt-BR')} ${plural(n, 'faixa', 'faixas')}`,
    abrirMusic: 'Abrir music no Explorer',
    atualizar: 'Atualizar',
    carregando: 'Lendo a biblioteca…',
    lendo: 'Lendo a biblioteca com o beets. Com milhares de faixas, leva alguns segundos.',
    ignoradas: (n: number) =>
      `${n} ${plural(n, 'linha da saída do beets não foi entendida e ficou de fora', 'linhas da saída do beets não foram entendidas e ficaram de fora')}.`,
    indicadores: {
      grupo: 'Filtrar por pendência',
      bpm: 'Sem BPM',
      tom: 'Sem tom',
      gen: 'Em _Sem Genero',
      dl: 'Parados em downloads/',
    },
    buscar: 'Buscar na biblioteca',
    placeholderBusca: 'Artista ou título',
    contagem: (visiveis: number, total: number) =>
      `${visiveis.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}`,
    tabela: 'Faixas da biblioteca',
    colunas: {
      artista: 'Artista',
      titulo: 'Título',
      bpm: 'BPM',
      tom: 'Tom',
      genero: 'Gênero',
      formato: 'Formato',
      acoes: 'Ações',
    },
    sem: 'sem',
    semGenero: '_Sem Genero',
    mostrarNoExplorer: (titulo: string) => `Mostrar ${titulo} no Explorer`,
    removerFaixa: (titulo: string) => `Remover ${titulo}`,
    naoAchouArquivo: 'O arquivo não está mais em music/. Use "Sincronizar com o disco" para o beets esquecer a faixa.',
    vazioFiltro: 'Nenhuma faixa com esse filtro.',
    vazioBiblioteca: {
      titulo: 'A biblioteca está vazia',
      corpo:
        'Ainda não há faixas no beets. Baixe uma lista (ou uma faixa pelo Soulbeet) e elas aparecem aqui, já com BPM, tom e gênero.',
      irParaLista: 'Baixar uma lista',
    },
    parados: {
      titulo: 'Parados em downloads/',
      resumo: (itens: number, arquivos: number) =>
        `${arquivos} ${plural(arquivos, 'arquivo', 'arquivos')} em ${itens} ${plural(itens, 'pasta que o beets não importou', 'pastas que o beets não importou')}.`,
      /** `1 arquivo: Vengeance Of The Masked.mp3`, `15 arquivos: a.flac, b.flac e mais 13` */
      detalhe: (arquivos: string[], total: number) => {
        const mais = total > arquivos.length ? ` e mais ${total - arquivos.length}` : '';
        return `${total} ${plural(total, 'arquivo', 'arquivos')}: ${arquivos.join(', ')}${mais}`;
      },
      item: (nome: string, arquivos: string[], total: number) =>
        `downloads/${nome}/ tem ${total} ${plural(total, 'arquivo', 'arquivos')} que o beets não importou: ${arquivos.join(', ')}${total > arquivos.length ? ` e mais ${total - arquivos.length}` : ''}`,
      desde: (momento: string) => `parado desde ${momento}`,
      nenhum: 'Nada parado em downloads/: o beets importou tudo.',
      importarAgora: 'Importar agora',
    },
    manutencao: {
      titulo: 'Manutenção',
      rodando: 'Rodando agora',
      verProgresso: 'Ver andamento',
      tomEBpm: {
        titulo: 'Recalcular tom e BPM',
        descricao: 'Só das faixas sem · keyfinder e autobpm',
      },
      importLeftovers: {
        titulo: 'Importar o que sobrou em downloads/',
        descricao: (itens: number, desde: string | null) =>
          itens === 0
            ? 'Nada parado em downloads/'
            : `${itens} ${plural(itens, 'pasta parada', 'pastas paradas')}${desde ? ` desde ${desde}` : ''}`,
      },
      update: {
        titulo: 'Sincronizar com o disco',
        descricao: 'Depois de apagar ou editar arquivos fora do app · update',
      },
      move: {
        titulo: 'Reorganizar pastas',
        descricao: 'Depois de mudar o padrão de pastas · move',
      },
    },
    compartilhamento: {
      titulo: 'Compartilhamento',
      /** vem depois do número: `1.204` + `arquivos anunciados no Soulseek` */
      anunciados: (n: number) => `${plural(n, 'arquivo anunciado', 'arquivos anunciados')} no Soulseek`,
      desconhecido: 'Não consegui ler quantos arquivos o slskd anuncia.',
      varrendo: 'O slskd está varrendo a biblioteca…',
      zero: 'O slskd anuncia 0 arquivos: quem não compartilha nada costuma ser recusado ou ficar no fim da fila. Reescaneie.',
      dica: 'Compartilhar ajuda sua reputação na rede: quem não compartilha costuma ser despriorizado.',
      reescanear: 'Reescanear',
      pedido: 'Pedi a varredura ao slskd. O número sobe conforme ela avança.',
      stackFora: 'Ligue a stack para ver o compartilhamento.',
    },
    rekordbox: {
      titulo: 'Rekordbox',
      instrucao:
        'Em Preferências › Avançado › Gerenciamento de banco de dados, adicione esta pasta como monitorada. As faixas novas aparecem sozinhas.',
      pastaMonitorada: 'Pasta para monitorar no Rekordbox',
      copiar: 'Copiar',
      copiado: 'Copiado',
    },
    remover: {
      rotulo: 'Ação destrutiva',
      titulo: 'Remover da biblioteca e do disco',
      filtro: 'Filtro do beets',
      dicaFiltro:
        'Mesmo filtro dos comandos do beets. id:… pega só esta faixa; troque por artist:"…" para várias. Antes de apagar, o app lista tudo o que ele pega.',
      conferindo: 'Conferindo o filtro…',
      sera: 'Será apagado',
      resumo: (faixas: number) =>
        `${faixas} ${plural(faixas, 'faixa', 'faixas')} · ${faixas} ${plural(faixas, 'arquivo', 'arquivos')}`,
      eMais: (n: number) => `e mais ${n} ${plural(n, 'faixa', 'faixas')}`,
      nenhuma: 'O filtro não pega nenhuma faixa. Nada será apagado.',
      aviso: 'O arquivo é apagado de vez, sem passar pela Lixeira. O app não consegue desfazer isto.',
      massa: (faixas: number, porcento: number) =>
        `Atenção: este filtro pega ${faixas} faixas (${porcento}% da biblioteca). Confira se é isso mesmo.`,
      digitar: (n: number) => `Digite ${n} para confirmar`,
      conferi: (n: number) => `Conferi a lista acima: pode apagar ${n} ${plural(n, 'arquivo', 'arquivos')}`,
      cancelar: 'Cancelar',
      apagar: (n: number) => `Apagar ${n} ${plural(n, 'faixa', 'faixas')}`,
      apagando: 'Apagando…',
      feito: 'Removida',
      feitoTitulo: (f: { artista: string; titulo: string }[]) =>
        f.length === 1 && f[0]
          ? `${f[0].artista ? `${f[0].artista} – ` : ''}${f[0].titulo} saiu da biblioteca`
          : `${f.length} faixas saíram da biblioteca`,
      aposRemover:
        'Para baixar a faixa certa, coloque a linha numa lista nova. Na mesma lista, use as opções Tentar de novo e Baixar mesmo o que já está na biblioteca.',
      voltar: 'Voltar à biblioteca',
      novaLista: 'Nova lista com esta faixa',
      erroNovaLista: 'Não consegui criar a lista',
    },
    dialogo: {
      previa: 'Conferindo o que o beets faria…',
      rodando: 'Rodando',
      concluido: 'Concluído',
      concluidoCorpo: 'A tarefa terminou. A biblioteca foi lida de novo.',
      fechar: 'Fechar',
      cancelar: 'Cancelar',
      emSegundoPlano:
        'Pode fechar esta janela: a tarefa continua e o andamento fica no cartão Manutenção. Não desligue a stack até ela terminar.',
      saida: 'Saída do beets',
      tomEBpm: {
        titulo: 'Recalcular tom e BPM',
        corpo: (semBpm: number, semTom: number) =>
          `O beets calcula o tom (keyfinder) e o BPM (autobpm) só das faixas que não têm. O que já tem fica como está. Hoje há ${semBpm} ${plural(semBpm, 'faixa', 'faixas')} sem BPM e ${semTom} sem tom. As tags são gravadas nos arquivos e a análise pode demorar.`,
        nada: 'Todas as faixas já têm tom e BPM: não há o que calcular.',
        confirmar: 'Recalcular',
      },
      importLeftovers: {
        titulo: 'Importar o que sobrou em downloads/',
        corpo:
          'O beets importa estas pastas com as tags que os arquivos já têm (import -q -s) e as move para music/. Só entram aqui arquivos parados há mais de 10 minutos: o que acabou de chegar o lote e o Soulbeet importam sozinhos.',
        nada: 'Nada parado em downloads/: o beets importou tudo.',
        confirmar: 'Importar',
      },
      update: {
        titulo: 'Sincronizar com o disco',
        corpo:
          'O beets (update) confere cada faixa com o arquivo no disco: esquece as que você apagou fora do app e relê as tags das que você editou. Nenhum arquivo é apagado.',
        nada: 'O banco e o disco estão iguais: não há o que sincronizar.',
        resumo: (afetadas: number, esquecidas: number) => {
          const partes: string[] = [];
          if (esquecidas > 0)
            partes.push(
              `${esquecidas} ${plural(esquecidas, 'faixa será esquecida', 'faixas serão esquecidas')} (o arquivo não existe mais)`,
            );
          const lidas = afetadas - esquecidas;
          if (lidas > 0)
            partes.push(`${lidas} ${plural(lidas, 'faixa terá as tags relidas', 'faixas terão as tags relidas')}`);
          return partes.join(' · ');
        },
        confirmar: 'Sincronizar',
      },
      move: {
        titulo: 'Reorganizar pastas',
        corpo:
          'O beets (move) leva cada arquivo para o lugar que o padrão de pastas do config.yaml manda (Gênero/Artista/Título). Os arquivos mudam de pasta; nenhum é apagado.',
        nada: 'Todos os arquivos já estão onde o padrão de pastas manda.',
        resumo: (n: number) => `${n} ${plural(n, 'arquivo será movido', 'arquivos serão movidos')}`,
        confirmar: 'Reorganizar',
      },
      maisLinhas: (n: number) => `e mais ${n} ${plural(n, 'linha', 'linhas')}`,
    },
  },

  emBreve: {
    irParaInicio: 'Ir para o Início',
  },

  /** Configurações → Aplicativo (Fase 6): o protótipo "Configurações" */
  aplicativo: {
    iniciarComWindows: { titulo: 'Iniciar com o Windows', dica: 'Abre minimizado na bandeja ao ligar o PC.' },
    bandeja: {
      titulo: 'Fechar a janela minimiza para a bandeja',
      dica: 'O lote continua de qualquer forma; isto só decide se o app sai junto.',
    },
    avisarLote: {
      titulo: 'Avisar quando um lote terminar',
      dica: 'Notificação do Windows com a contagem de faixas.',
    },
    avisarPausa: {
      titulo: 'Avisar quando as buscas forem pausadas',
      dica: 'Quando o servidor do Soulseek bloqueia as buscas por alguns minutos.',
    },
    abrirWebUi: { grupo: 'Abrir Soulbeet, slskd e Navidrome', app: 'Dentro do app', navegador: 'No navegador' },
    tema: {
      grupo: 'Tema',
      dica: 'Vale para o app inteiro: as interfaces web do Soulbeet, do slskd e do Navidrome, os menus e as janelas do sistema também seguem.',
      escuro: 'Escuro',
      claro: 'Claro',
      sistema: 'Igual ao Windows',
    },
    carregando: 'Lendo as preferências…',
  },

  /** Configurações → Sobre (Fase 6) */
  sobre: {
    versoes: 'Versões',
    app: 'App',
    stack: 'Stack',
    desenvolvimento: 'desenvolvimento',
    stackDoApp: (versao: string) => `o app traz a ${versao}`,
    lidaDoConteiner: 'lida do contêiner',
    daImagem: 'rótulo da imagem do contêiner',
    semVersao: {
      'sem-pasta': 'Sem pasta do Soulcrate',
      'docker-fora': 'Docker fechado',
      'stack-desligada': 'Ligue a stack para ler',
      'nao-lida': 'Não consegui ler',
    },
    nao: 'não encontrada',
    lendo: 'Lendo as versões dos contêineres…',
    creditos: 'Créditos e licença',
    creditosTitulo: 'Créditos e licença',
    creditosDescricao:
      'O Soulcrate junta ferramentas abertas. Cada uma segue a própria licença; os links levam ao projeto de origem.',
    licencaDoSoulcrate: 'Licença do Soulcrate',
    licencasDeTerceiros: 'Licenças que o instalador traz',
    codigoFonte: 'Código-fonte no GitHub',
    fechar: 'Fechar',
    erroLer: 'Não consegui ler as informações do app.',
  },

  /** A atualização do app (Fase 7): a linha em Sobre e o aviso no Início */
  atualizacao: {
    procurar: 'Procurar atualização',
    procurando: 'Procurando…',
    reiniciar: 'Reiniciar e atualizar',
    indisponivel: {
      desenvolvimento: 'A atualização automática só existe no app instalado.',
      'sem-instalador':
        'Este app não foi aberto pelo instalador, então não se atualiza sozinho. Instale a versão nova pelo instalador.',
    },
    ocioso: 'O app procura atualização ao abrir e a cada 24 horas.',
    verificando: 'Procurando atualização…',
    atualizado: (quando: string) => `Você está na versão mais nova. Última checagem: ${quando}.`,
    baixando: (versao: string, percentual: number) => `Baixando a versão ${versao}… ${percentual}%`,
    pronta: (versao: string) => `A versão ${versao} está pronta. Ela entra quando o app reiniciar.`,
    aviso: {
      titulo: (versao: string) => `A versão ${versao} está pronta`,
      corpo: 'Reinicie o app para instalar. A atualização nunca interrompe um lote: se houver um rodando, ela espera.',
      corpoLote: 'Há um lote rodando. A atualização espera ele terminar para reiniciar o app.',
      baixando: (versao: string, percentual: number) => `Baixando a versão ${versao}… ${percentual}%`,
      depois: 'Mais tarde',
    },
  },

  /** Os arquivos da stack que o app instalou na pasta do Soulcrate (Fase 7, §3.3) */
  arquivosDaStack: {
    aviso: {
      titulo: 'Os arquivos da stack foram atualizados',
      corpo: (de: string | null, para: string | null) =>
        de && para && de !== para
          ? `A pasta do Soulcrate passou da stack ${de} para a ${para}. O que você não tinha editado foi trocado; seus arquivos de configuração e a biblioteca não foram tocados.`
          : 'Os arquivos da stack da pasta do Soulcrate foram atualizados. Seus arquivos de configuração e a biblioteca não foram tocados.',
      reconstruir: 'A imagem do Soulbeet ou o compose mudou: reconstrua a stack para a mudança valer.',
      mantidos: (n: number) =>
        `${n} ${plural(n, 'arquivo que você editou foi mantido', 'arquivos que você editou foram mantidos')}: a versão nova está ao lado, com a extensão .novo. Compare e junte as mudanças quando quiser.`,
      reconstruirAgora: 'Reconstruir a stack',
      verPasta: 'Abrir a pasta',
    },
    esperando: 'Há arquivos da stack para atualizar. Eles entram quando o lote em andamento terminar.',
    atualizarAgora: 'Atualizar agora',
    migracao: {
      titulo: 'Esta pasta tem alterações locais nos arquivos da stack',
      corpoGit:
        'O app não altera esta pasta (quem a atualiza é o git). Um git pull pode esbarrar nestas alterações, e elas valem só para este clone:',
      corpoSemGit:
        'O app não altera esta pasta. Estes arquivos da stack são diferentes dos que o app traz (pode ser só uma versão diferente):',
      gitIndisponivel: 'Não consegui consultar o git; a comparação é com os arquivos que o app traz.',
      continuar: 'Quando estiver ciente, clique em Avançar para continuar.',
    },
    gerenciada: (versao: string | null) =>
      `O app cuida dos arquivos da stack desta pasta${versao ? ` (stack ${versao})` : ''}.`,
    naoGerenciada: 'Esta pasta já existia quando o app a adotou: quem a atualiza é quem a criou (por exemplo, o git).',
  },

  /** Rede de segurança do renderer (Fase 6): uma tela que quebrou não derruba a janela inteira */
  telaQuebrou: {
    titulo: 'Esta tela travou',
    mensagem:
      'Algo inesperado aconteceu e eu não consegui desenhar esta tela. O resto do app continua funcionando e nada foi perdido.',
    voltarAoInicio: 'Ir para o Início',
    recarregar: 'Tentar de novo',
  },

  /** Navegação por teclado e leitores de tela (Fase 6) */
  acessibilidade: {
    pularParaConteudo: 'Pular para o conteúdo',
    conteudo: 'Conteúdo',
  },

  /** o pacote de suporte (Fase 6): o botão em Configurações → Sobre e o LEIA-ME que vai dentro do zip */
  suporte: {
    titulo: 'Suporte',
    descricao:
      'O pacote reúne os logs do app, os últimos execucao-*.log, o docker compose ps e as versões. Senhas e chaves são removidas antes de gerar o arquivo.',
    gerar: 'Gerar pacote de suporte',
    gerando: 'Gerando…',
    salvarTitulo: 'Salvar o pacote de suporte',
    filtroZip: 'Arquivo zip',
    pronto: 'Pacote gerado',
    prontoCorpo: (arquivos: number, tamanho: string) =>
      `${arquivos} ${plural(arquivos, 'arquivo', 'arquivos')} · ${tamanho}. Senhas e chaves foram removidas.`,
    mostrarNaPasta: 'Mostrar na pasta',
    leiaMeTitulo: 'Pacote de suporte do Soulcrate',
    leiaMeCorpo: [
      'Este arquivo foi gerado no seu PC e não foi enviado a lugar nenhum: quem decide para quem mandá-lo é você.',
      'Senhas e chaves foram removidas dos logs e do .env (aparecem como ***). Mesmo assim, dê uma olhada antes de enviar: os logs podem trazer nomes de listas, de faixas e de pastas do seu PC.',
      'O .env e o slskd.yml em si não fazem parte do pacote.',
    ],
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
    gerarPacoteSuporte: 'Gerar pacote de suporte…',
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
      'config.nao-gravou': 'Erro · configuração',
      'config.yml-invalido': 'Erro · configuração',
      'pasta.nao-instalou': 'Erro · configuração',
      'setup.falhou': 'Erro · configuração',
      'porta.em-uso': 'Erro · rede',
      'servico.inacessivel': 'Erro · serviço',
      'slskd.chave-recusada': 'Erro · configuração',
      'operacao.falhou': 'Erro · stack',
      'lote.lista-rodando': 'Erro · lote',
      'lote.stack-fora': 'Erro · lote',
      'lote.nao-iniciou': 'Erro · lote',
      'lote.slskd-fora': 'Erro · lote',
      'lote.config': 'Erro · lote',
      'lote.erro': 'Erro · lote',
      'lote.interrompido': 'Erro · lote',
      'biblioteca.stack-fora': 'Erro · biblioteca',
      'biblioteca.ocupada': 'Erro · biblioteca',
      'biblioteca.filtro-invalido': 'Erro · filtro',
      'biblioteca.mudou': 'Erro · biblioteca',
      'biblioteca.falhou': 'Erro · biblioteca',
      'suporte.nao-gerou': 'Erro · suporte',
      'atualizacao.falhou': 'Erro · atualização',
      'atualizacao.lote-rodando': 'Atualização · espera',
      'stack.atualizacao-falhou': 'Erro · stack',
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
    configNaoGravou: {
      titulo: 'Não consegui gravar a configuração',
      mensagem:
        'Nada foi alterado. Veja se a pasta do Soulcrate permite gravação e se nenhum outro programa está com o .env aberto, e tente de novo.',
    },
    configYmlInvalido: {
      titulo: 'O slskd.yml tem um erro de sintaxe',
      mensagem:
        'Não consegui ler o slskd/slskd.yml, então não mexi em nenhum arquivo. Corrija o arquivo (ou apague-o para o assistente criar um novo) e tente de novo.',
    },
    pastaNaoInstalou: {
      titulo: 'Não consegui preparar a pasta do Soulcrate',
      mensagem:
        'Os arquivos da stack não foram copiados por inteiro. Escolha outra pasta ou confira a permissão de gravação.',
    },
    setupFalhou: {
      titulo: (passo: string) => `Não consegui terminar ${passo}`,
      mensagem:
        'A configuração foi gravada e a stack está no ar, mas este passo não terminou. Dá para tentar de novo agora, ou depois pelas Configurações.',
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
    loteListaRodando: {
      titulo: (lista: string) => `${lista} já está rodando`,
      mensagem: (desde: string | null) =>
        `Esta lista já está sendo baixada por outro lote${desde ? ` (desde ${desde})` : ''}, pelo app ou pelo baixar-lista.bat. Espere terminar, ou pare aquele lote, antes de iniciar de novo.`,
    },
    loteStackFora: {
      titulo: 'A stack não está no ar',
      mensagem:
        'O slskd precisa estar rodando para baixar. Ligue a stack, espere os serviços ficarem saudáveis e tente de novo.',
    },
    loteNaoIniciou: {
      titulo: 'Não consegui iniciar o lote',
      mensagem: 'O PowerShell não chegou a rodar o baixar-lista.ps1. Os detalhes explicam o motivo.',
    },
    loteSlskdFora: {
      titulo: 'O slskd não respondeu',
      mensagem:
        'O lote parou porque o slskd ficou inacessível. Veja os serviços; ao rodar a lista de novo, ela continua de onde parou.',
    },
    loteConfig: {
      titulo: 'O lote não pôde começar',
      mensagem:
        'O script recusou a configuração (lista, API key ou parâmetros). Os detalhes dizem o que precisa mudar.',
    },
    loteInterrompido: {
      titulo: 'O lote foi interrompido',
      mensagem:
        'O processo do lote terminou sem gravar o fim (foi encerrado à força, ou o PC foi desligado). Rode a lista de novo: ela continua de onde parou.',
    },
    loteErro: {
      titulo: 'O lote terminou com erro',
      mensagem: 'Aconteceu um erro durante o lote. Os detalhes e o log da execução dizem onde.',
    },
    slskdChaveRecusada: {
      titulo: 'O slskd recusou a API key',
      mensagem:
        'A chave do .env (SLSKD_API_KEY_SOULBEET) e a do slskd.yml precisam ser idênticas. Confira em Configurações; se mudar a chave, use Aplicar e reiniciar para o slskd reler o arquivo.',
    },
    bibliotecaStackFora: {
      titulo: 'A biblioteca só abre com a stack no ar',
      mensagem:
        'Quem lê e mexe na biblioteca é o beets, que roda dentro do contêiner do Soulbeet. Ligue a stack e volte aqui.',
    },
    bibliotecaOcupada: {
      titulo: 'Há um lote rodando',
      mensagem:
        'Mexer na biblioteca enquanto o lote importa faixas pode travar o banco do beets ou apagar o que está chegando. Espere o lote terminar (ou pare-o) e tente de novo.',
    },
    bibliotecaFiltro: {
      titulo: 'Esse filtro não serve',
      mensagem: {
        vazio:
          'Escreva o que procurar, por exemplo title:"Northern Power". Sem filtro, o beets pegaria a biblioteca inteira.',
        aspas: 'Faltou fechar as aspas do filtro.',
        opcao:
          'Termos que começam com "-" são opções do beets, não filtros. Para excluir, use ^ (por exemplo ^artist:Azyr).',
        longo: 'Um dos termos do filtro é grande demais.',
        muitos: 'O filtro tem termos demais. Escreva só o necessário para achar a faixa.',
      } satisfies Record<MotivoFiltro, string>,
    },
    bibliotecaMudou: {
      titulo: 'A biblioteca mudou desde a pré-visualização',
      mensagem:
        'As faixas que o filtro pega já não são as que você conferiu (ou a confirmação expirou). Nada foi apagado: confira a lista de novo.',
    },
    bibliotecaFalhou: {
      titulo: (tarefa: string) => `Não consegui ${tarefa}`,
      mensagem: 'O beets devolveu um erro. As últimas linhas da saída estão nos detalhes.',
    },
    suporteNaoGerou: {
      titulo: 'Não consegui gerar o pacote de suporte',
      mensagem:
        'Nada foi gravado nem enviado a lugar nenhum. Veja se a pasta escolhida permite gravação (tente a Área de Trabalho) e tente de novo.',
    },
    atualizacaoFalhou: {
      titulo: 'Não consegui procurar atualização',
      mensagem:
        'O app só fala com o GitHub para isso. Confira a conexão com a internet e tente de novo: enquanto isso o Soulcrate segue funcionando na versão atual.',
    },
    atualizacaoLoteRodando: {
      titulo: 'Há um lote rodando',
      mensagem:
        'O app só reinicia para atualizar quando nenhum lote está rodando. A atualização já foi baixada e espera: termine ou pare o lote e tente de novo.',
    },
    stackAtualizacaoFalhou: {
      titulo: 'Não consegui atualizar os arquivos da stack',
      mensagem:
        'Nenhum arquivo seu foi alterado. Veja se a pasta do Soulcrate permite gravação e se nenhum outro programa está com um deles aberto, e tente de novo.',
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
