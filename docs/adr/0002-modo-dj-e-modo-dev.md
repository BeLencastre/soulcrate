# 0002. Modo DJ e Modo Dev: uma preferência que muda só o que aparece

- Status: Aceito
- Data: 2026-10-17

## Contexto

O app nasceu mostrando tudo o que a stack faz: as cinco etapas do ambiente, os contêineres com porta, os logs do `docker compose`, os flags do `baixar-lista.ps1`, o comando equivalente, os relatórios de `lotes/`. Para quem só quer baixar uma lista, organizar e ouvir, isso é ruído; para quem resolve problemas, é indispensável. Os protótipos de `soulcrate-prototipos/modos-dev-dj` propõem dois modos: o **Modo DJ** (sem termos técnicos) e o **Modo Dev** (o app de antes), trocados por um alternador na barra lateral, por Ctrl+Shift+D e em Configurações → Aplicativo, e perguntados na tela final do assistente.

Restrições: quem já usa o app não pode ver nada mudar sem pedir (premissa 6, compatibilidade); o modo não pode mudar o que o app **faz** (um lote rodando não para, as opções gravadas são as mesmas); e a escolha precisa sobreviver a fechar o app.

## Decisão

- O modo é uma **preferência do app** (`AppSettings.modo: 'dj' | 'dev' | null`, no `settings.json` do `userData`), como o tema. `null` quer dizer "nunca escolheu" e vale como Modo Dev: um `settings.json` antigo, sem o campo, abre igual a antes. O assistente propõe o Modo DJ a quem nunca escolheu e repete a escolha de quem já escolheu. A regra fica em `shared/modo.ts` (`modoEfetivo`, `modoProposto`); o main só normaliza o valor.
- **O modo é só apresentação.** Nenhum serviço do main, nenhum IPC e nenhum formato de evento conhece o modo. O renderer lê a preferência (`useModo`) e escolhe o que desenhar. Onde a tela muda de estrutura (Início e Serviços), o Modo DJ tem um componente próprio (`paginas/inicio/InicioDj.tsx`, `paginas/servicos/ServicosDj.tsx`) e a página escolhe entre os dois; onde muda pouco (Detalhe, O que faltou, Configurações), a mesma página troca textos e esconde o que é técnico. Os Ajustes de Baixar lista têm um layout só: o Modo DJ explica cada ajuste em palavras (com os interruptores invertidos) e resume em frases, o Modo Dev mostra o parâmetro do script e o comando equivalente. O Histórico, a Biblioteca, a Lista e o Download de Baixar lista (as etapas 01 Lista, 02 Ajustes e 03 Download têm o mesmo nome e número nos dois modos), Configurações → Aplicativo e os botões da stack no Início (um só Ligar/Desligar e Reiniciar) são iguais nos dois modos: os textos mais claros do DJ passaram a valer para os dois, e as colunas e ações são as do Dev.
- Os textos do Modo DJ ficam em `shared/mensagens-dj.ts`, à parte do catálogo `mensagens.ts`, para os dois vocabulários não se misturarem. Os mapas que precisam cobrir as mesmas chaves (os status das faixas, os fins do lote) são amarrados aos do Modo Dev por `satisfies`, para o compilador avisar quando um lado ficar para trás.
- As regras de apresentação do Modo DJ são funções puras e testadas: `shared/painel-dj.ts` (a situação do Início, os passos de "Ligando…", os cartões de Serviços), `renderer/lib/ajustes-dj.ts` (os interruptores sem "não" nem "sem" no nome, que invertem os flags `-SemBeets`, `-SemCatalogo` e `-SemBuscaArtista`, e o resumo em palavras) e as de `renderer/lib/historico.ts`.
- A troca não abre aviso nem oferece "Desfazer": a tela muda na hora e o próprio alternador desfaz (o protótipo previa um aviso de 6 s, retirado por ser ruído). O modo se troca só pela barra lateral (e Ctrl+Shift+D): a escolha que o protótipo também punha em Configurações → Aplicativo saiu, para haver um lugar só.
- Uma seção de Configurações que só existe num modo, pedida pelo endereço, cai na equivalente (Rede ↔ Compartilhamento) ou na seção inicial (`secaoNoModo`).

## Alternativas consideradas

- **Dois apps, ou duas árvores de rotas.** Duplicaria a navegação, o estado do lote e os testes, e trocar de modo perderia a tela atual. O protótipo pede que "a tela atual fique onde está".
- **Esconder elementos com CSS por modo** (`data-modo` no `<html>`). Barato, mas não dá conta do que o Modo DJ troca de verdade (textos, layout do Início e de Serviços, interruptores invertidos) e deixaria conteúdo técnico no DOM, lido pelo leitor de tela.
- **Modo DJ como padrão para todos.** Mais simples, mas quebraria a premissa de compatibilidade: quem já usa o app veria outra interface sem ter pedido.
- **Guardar o modo no `localStorage` do renderer.** Ficaria de fora do pacote de suporte e do lugar onde as outras preferências estão, e o main não teria como normalizá-lo.

## Consequências

- Fica fácil trocar de modo sem efeito colateral: a troca é uma gravação de preferência, e as telas reagem.
- Toda mudança de tela passa a ter duas perguntas: "muda no Modo DJ?" e "algum termo técnico vazou?". Os testes de cada tela no Modo DJ (`app/tests/renderer/modo-telas.test.tsx`, `lote-telas.test.tsx`, `assistente.test.tsx`) e o axe nas telas do Modo DJ (`app/tests/e2e/modos.spec.ts`) cobrem o caminho principal.
- A bandeja, o menu e as notificações do Windows continuam com o vocabulário do Modo Dev: o main não conhece o modo. Se isso incomodar, a decisão a tomar é se o main passa a ler a preferência (hoje ele só a normaliza).
- Os diálogos de manutenção da Biblioteca, de reprocessar e de limpeza do Histórico ainda explicam com termos do beets nos dois modos.
