# 0003. App desktop: decisões da primeira versão

- Status: Aceito
- Data: 2026-10-19

## Contexto

O app desktop (Electron) nasceu de uma especificação longa, escrita antes do código e atualizada fase a fase (versões 1.0.0 a 1.1.1). Com tudo implementado, o que a especificação descrevia passou a estar no código, nos testes e nos documentos de referência, e o que ela guardava de único eram as **decisões e o porquê**. Este ADR reúne só isso. A especificação foi removida; o texto completo continua no histórico do git (`git show 549aa7e:docs/interface-electron.md`).

Onde ficou o resto: o protocolo do lote em [`eventos-lote.md`](../eventos-lote.md), as regras de validação em [`validacao-configuracao.md`](../validacao-configuracao.md), o contrato do IPC em `app/src/shared/ipc.ts`, o mapa de status das faixas em `app/src/shared/`, a instalação e a release em [`distribuicao.md`](../distribuicao.md), a matriz de teste manual em [`roteiro-manual.md`](../roteiro-manual.md) e o Modo DJ no [ADR 0002](0002-modo-dj-e-modo-dev.md).

## Decisão

### Arquitetura

- **O app é uma camada de orquestração e visualização.** A busca, o filtro e a escolha de arquivo continuam no `baixar-lista.ps1`, e o tagging no beets. O app não reimplementa regra de negócio, e os `.bat` seguem funcionando na mesma pasta, com o mesmo estado (`lotes/estado-*.tsv`, `.env`).
- **Os arquivos da stack ficam numa pasta do usuário**, não na do programa. O instalador traz os recursos, e o assistente os copia para a pasta do Soulcrate (padrão `%USERPROFILE%\Soulcrate`, com escolha livre). Arquivos do usuário nunca são sobrescritos. Os da stack que ele pode editar (`soulbeet/config/config.yaml`) são controlados por hash em `.soulcrate/manifesto.json`: se não foram editados, são trocados; se foram, o novo vai ao lado como `.novo`. Uma pasta já existente (clone do Git) é só validada e gerenciada, sem cópia.
- **O lote roda destacado do app**, por um PowerShell lançador com `Start-Process -WindowStyle Hidden` e a saída em arquivos. Assim fechar o app não mata o lote, e ao reabrir o app se reconecta. `spawn` com `detached: true` **não serve** com o PowerShell (ele sai na hora sem rodar nada), e sem o lançador o lote morre junto com o app. O progresso vem do JSONL de eventos, lido por offset; a parada é por arquivo-sinal, nunca por `kill`, para o `finally` do script gravar os relatórios.
- **Serviços do main, um por assunto, atrás de interfaces com dublês**; o renderer só fala com o main pelo `window.soulcrate`. Segredos nunca atravessam o IPC.

### Decisões pontuais

| Assunto | Decidido | Por quê |
| --- | --- | --- |
| Pasta do Soulcrate | Padrão `%USERPROFILE%\Soulcrate`, escolha livre no assistente, nunca dentro da pasta de instalação | A atualização do programa não pode tocar nos dados |
| Portas | Só em `127.0.0.1` por padrão; `BIND_ADDR=0.0.0.0` no `.env` libera a rede | Reduz a exposição da API do slskd. A porta 2234 (Soulseek) continua aberta |
| Assinatura de código | Sem certificado; SmartScreen documentado, SHA-256 na release, caminho para assinar pronto no workflow | Custo. Ver [`distribuicao.md`](../distribuicao.md#8-assinatura-de-código) |
| Healthcheck | slskd: `/health`. Navidrome: `/ping`. Soulbeet: checagem HTTP da raiz | O `/api/system/health` do Soulbeet exige login e o `/health` devolve a SPA. Ver [`apis-da-stack.md`](../apis-da-stack.md) |
| Navidrome e Soulbeet | Configurados automaticamente pelo assistente | As rotas existem e foram testadas ([`apis-da-stack.md`](../apis-da-stack.md)) |
| Conta do Navidrome e do Soulbeet | Reaproveita o usuário e a senha da Web UI do slskd | O assistente não pede um terceiro par. Se o Navidrome já tem outro administrador, a tela final pede o login dele e não o guarda |
| Gerenciador de pacotes | npm | Um só, com lockfile |
| Fechar a janela com lote rodando | Minimiza para a bandeja, com aviso na primeira vez | O lote continua de qualquer forma |
| Pré-visualização da lista | Analisa o **arquivo salvo**, com salvamento automático depois de uma pausa na digitação | O `-SoAnalisar` lê o arquivo, e o `estado-<lista>.tsv` é pelo nome dele |
| Listas `.csv` | Só leitura no editor; importar sempre **copia** para a pasta do Soulcrate | Editar as colunas como texto estraga o arquivo |
| Lote iniciado pelo `.bat` | Não aparece no painel (só os do app têm `-Eventos`), mas a trava o reconhece e recusa o segundo | Não há eventos para mostrar |
| Caminho da faixa no histórico | Procura em `music/` pelo nome, aceitando só com mais uma pista (artista na pasta ou data) | Funciona com a stack desligada, que é quando se olha o histórico |
| "Talvez seja" | Corrige a linha na lista do "tentar de novo" e na da execução, mas só se a linha ainda for a da execução e sem editor com texto não salvo; "Desfazer" restaura | Não reescrever por baixo de quem está editando |
| Mexer na biblioteca durante um lote | Recusa tudo o que escreve (remover, `update`, `move`, tom e BPM, importar); ler continua liberado | O lote importa no mesmo banco do beets, e um `remove` ou `move` pode travá-lo ou apagar o que está chegando |
| Filtro do botão de remover | `id:N` | `artist:` e `title:` são buscas por trecho: `title:Power` pega "Power (Extended Mix)", e `artist:` vazio pega a biblioteca toda |
| "Parado em `downloads/`" | Só o que está quieto há mais de 10 minutos | O lote e o Soulbeet importam em segundos; "Importar agora" disputaria o arquivo |
| Desinstalador | Nunca oferece apagar a pasta do Soulcrate; pergunta (padrão "Não") só das preferências e logs do app | A pasta tem o `.env`, as listas e, às vezes, a biblioteca inteira, e um "Sim" por engano é irreversível |
| Onde abrem as Web UIs | Preferência ("Dentro do app" por padrão); o ícone ao lado oferece o outro destino na hora | |
| Pacote de suporte | Filtro de padrões **e** de valores: troca por `***` as senhas e chaves que estão de fato no `.env` e no `slskd.yml` | O filtro de padrões não pega uma senha solta numa mensagem de erro. O `.env` e o `slskd.yml` nunca entram |
| Tema | `nativeTheme.themeSource` e `prefers-color-scheme` | Nenhum script pinta a página (sem piscar), e as Web UIs integradas seguem o mesmo tema |
| Primeira versão | Direto a `1.0.0`, sem beta fechado | Os problemas chegam por issues e pelo [roteiro manual](../roteiro-manual.md). App e stack têm versões independentes |

### Manutenção contínua

| Tarefa | Frequência |
| --- | --- |
| Atualizar o Electron (só as últimas versões principais recebem correção de segurança) | A cada versão principal, no máximo com uma de atraso |
| `npm audit --omit=dev --audit-level=high` no `app/` (o CI já exige) e revisão das dependências | Contínuo |
| Revalidar a stack e repetir os testes de [`apis-da-stack.md`](../apis-da-stack.md) | A cada versão nova do slskd, Navidrome ou Soulbeet; passa pelo roteiro manual antes de ir para uma release do app |
| Revisar o catálogo de erros com base nas issues | A cada release |
| Renovar o certificado de assinatura (se adotado) | Anual |

## Alternativas consideradas

- **`spawn` com `detached: true`, ou `cmd /c start`:** o primeiro não roda o PowerShell; o segundo deixa uma janela minimizada na barra de tarefas.
- **Uma partição de sessão para as três Web UIs:** os três serviços respondem no mesmo host e cookie não é separado por porta, então dois que usem o mesmo nome (`auth_token`) se sobrescreveriam. Cada serviço tem a sua partição persistente (`persist:soulcrate-webui-<serviço>`), sem preload.
- **Reescrever o `baixar-lista.ps1` em TypeScript na v1:** adiado. Os testes Pester e as fixtures servem de especificação para um porte futuro.

## Consequências

- Os riscos que ainda pedem atenção: a API interna do Soulbeet e do Navidrome pode mudar numa versão nova (por isso as versões são fixas); uma atualização do app não pode sobrescrever o `config.yaml` editado (manifesto e `.novo`); o SmartScreen avisa enquanto não houver assinatura; um lote destacado pode ficar órfão ou duplicado (trava com PID, reconexão na abertura e parada por arquivo-sinal; só depois de 2 minutos o app oferece encerrar à força, avisando que os relatórios se perdem).
- Roadmap, sem compromisso de data, em ordem:
  1. Portar a lógica do lote para TypeScript no main, o que elimina a dependência do PowerShell. Só com a v1 estável.
  2. Builds para Linux e macOS, depois do item 1.
  3. Importar mais playlists por link: faltam Beatport, 1001Tracklists e a Amazon Music (sem caminho gratuito hoje). Spotify, Apple Music, YouTube Music e Deezer (públicas) já funcionam.
  4. Acesso remoto: modo servidor opcional para enviar listas pelo celular.
  5. Integração mais profunda com o Rekordbox (por exemplo, gerar o XML de uma playlist a partir de uma lista baixada).
  6. Redirecionamento automático de porta (UPnP), com consentimento explícito.
- O que os testes automáticos só cobrem com dublês, a partida a frio do Docker Desktop e a atualização contra o GitHub Releases de verdade, é conferido pelo [roteiro manual](../roteiro-manual.md) (cenários B e G).
