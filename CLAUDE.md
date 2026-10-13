# CLAUDE.md: Soulcrate

Estas são as premissas de engenharia do projeto. Elas valem para toda mudança, feita por uma pessoa ou por um agente. As regras próprias deste repositório (testes, codificação dos arquivos, commits, versões) estão no [`CONTRIBUTING.md`](CONTRIBUTING.md). O que já se aprendeu desenvolvendo está em [`.claude/memoria/aprendizados.md`](.claude/memoria/aprendizados.md). Os dois são carregados no fim deste arquivo.

Em caso de conflito, a ordem é: segurança e correção, depois este arquivo, depois o CONTRIBUTING, depois a preferência de quem está mexendo.

## O projeto

O Soulcrate é um app desktop para Windows (Electron, React e TypeScript, em `app/`). Ele instala e opera uma stack Docker com slskd, Soulbeet (beets) e Navidrome para baixar, organizar e ouvir música. Na raiz ficam os scripts PowerShell (`baixar-lista.ps1`, `validar-config.ps1`) e os arquivos da stack. Tudo no projeto é em português: nomes do domínio, mensagens, documentação e commits.

| Onde | O quê |
| --- | --- |
| `app/src/shared/` | Contratos e modelos que main e renderer compartilham: IPC, estados, catálogo de erros e mensagens, protocolo do lote. Não depende de Node nem de DOM. |
| `app/src/main/services/` | Regras de negócio, um serviço por assunto |
| `app/src/main/infra/` | Adaptadores sem regra de negócio: processos, parsers do Docker, segurança e filtro de segredos, log, .zip |
| `app/src/preload/` | `window.soulcrate`, a única API que o renderer enxerga |
| `app/src/renderer/` | Interface: `paginas/`, `components/`, `lib/` |
| `tests/`, `app/tests/` | Pester, Vitest, Playwright, dublês e fixtures. A pasta de teste espelha `src/`. |
| `docs/` | Especificação (`interface-electron.md`), distribuição, protocolo de eventos, spikes, ADRs, [mapa de dependências](docs/dependencias.md) |

## Comandos

```bash
cd app && npm ci && npm run check                       # lint, formatação, tipos e testes unitários (o mesmo que o CI)
cd app && npm run test:e2e                              # ponta a ponta com o app de verdade e o dublê do docker
powershell -File tests\Invoke-Testes.ps1                # scripts PowerShell (Pester)
node scripts/dependencias.mjs                           # refaz o mapa de dependências (--check só confere)
node --test "scripts/*.test.mjs" ".claude/hooks/*.test.mjs"   # testes do mapa e dos hooks de memória
```

## Princípios

1. **Correção, depois clareza, depois simplicidade, depois desempenho.** Otimização só com medição.
2. **KISS e YAGNI.** Faça a menor mudança que resolve o problema inteiro, sem abstração especulativa. Código duplicado só vira abstração na terceira repetição (regra de três).
3. **Coesão e SOLID.** Cada módulo tem um motivo para mudar. Prefira composição a herança. Dependa de contratos (os tipos de `shared/`), não de detalhes.
4. **Falhe cedo e de forma explícita.** Valide na fronteira e nunca engula exceção. Todo erro que chega ao usuário diz o que aconteceu e o que fazer, usando o catálogo (`shared/mensagens.ts`, `motivos.ts`).
5. **Núcleo puro, efeitos nas bordas.** Processo, disco, rede e Docker ficam atrás de interfaces que aceitam dublês. A regra de negócio é função pura e testável.
6. **Compatibilidade é requisito.** Dados, comandos e rascunhos antigos continuam funcionando. Opção que sai vira obsoleta em vez de quebrar.
7. **Escoteiro, dentro do escopo.** Melhore o que está tocando. Problema fora do escopo vira tarefa separada, não entra no mesmo diff.

## Arquitetura

- **Portas e adaptadores.** As dependências apontam para dentro: `shared/` ← `services/` ← `infra/`. A camada `infra/` não conhece regra de negócio. O renderer só fala com o main por `window.soulcrate`, tipado no preload.
- **Electron seguro** (checklist oficial de segurança do Electron): `contextIsolation` e `sandbox` ligados, `nodeIntegration` desligado, nenhum `ipcRenderer` cru e CSP restritiva no `index.html`. Navegação e janelas novas ficam bloqueadas, e `shell.openExternal` só abre URL aprovada por `infra/seguranca.ts`. Toda entrada de IPC é validada no main (`ipc-entradas.ts`).
- **Configuração no ambiente** (12-factor). Segredos ficam só no `.env` e no `slskd.yml`, fora do git, e nunca vão para o código, os logs, os testes ou o pacote de suporte. O `.env.example` documenta cada variável.
- **Contratos são APIs públicas.** Isso vale para os eventos JSONL do lote, os parâmetros dos scripts e o formato dos arquivos que o app grava. Quem muda um contrato versiona, documenta (`docs/eventos-lote.md`) e atualiza tipos e fixtures no mesmo PR.
- **Decisões viram ADR.** Tecnologia nova, mudança de camada, de protocolo ou de formato persistido, e trade-off difícil de desfazer, vão para [`docs/adr/`](docs/adr/README.md) antes do código ou junto com ele.
- **Build reproduzível.** `npm ci` com lockfile, imagens Docker com tag fixa ou digest, fontes fixadas por tag ou commit e Actions com versão.

## Código

- TypeScript estrito. Não use `any` nem `as` para calar o compilador. Asserção não nula (`!`) só com comentário explicando. Estados são uniões discriminadas, tratadas com `switch` exaustivo (`never`).
- Os nomes revelam intenção e seguem o domínio em português, como o resto do código. Funções curtas, cada uma em um nível de abstração.
- O comentário explica o **porquê** (restrição, armadilha, decisão). O quê, o código já diz.
- Sem código morto. TODO sem dono vira issue.
- Siga o padrão do arquivo vizinho antes de inventar outro.
- Lint, formatação e tipos não se desligam para passar. Corrija a causa. `eslint-disable` só pontual e com justificativa.
- PowerShell precisa rodar no Windows PowerShell 5.1 e no PowerShell 7 (o CI roda os dois). Lógica sem rede fica em `baixar-lista.lib.ps1`, testável no Pester.

## Testes

- Todo comportamento novo ou bug corrigido vem com teste. Num bug, escreva primeiro o teste que reproduz e falha, depois corrija.
- Pirâmide de testes:
  - na base, muitos unitários (Vitest, Pester);
  - no meio, integração com dublês (`docker-falso`, `slskd-falso`);
  - no topo, poucos ponta a ponta (Playwright) nos fluxos críticos, com axe para acessibilidade.
- Os testes são determinísticos: sem rede real, sem Docker real, com datas e durações fixas e sem depender da ordem. Teste instável é bug.
- Teste o comportamento observável, não a implementação. Os caminhos de erro valem tanto quanto o caminho feliz. A cobertura é consequência, não meta.

## Segurança

- Use o OWASP Top 10 e o ASVS como referência e dê o menor privilégio possível. Toda entrada externa é não confiável até ser validada: IPC, arquivos do usuário, respostas do slskd e do Navidrome, links de playlist.
- Nunca logue nem commite senha, chave de API ou token, e não os coloque no pacote de suporte. Para isso existe o filtro de segredos em `infra/seguranca.ts`: use-o.
- Processo externo recebe os argumentos em lista, nunca em string de shell concatenada.
- O CI exige `npm audit --omit=dev --audit-level=high` limpo.

## Dependências

Toda dependência é código de terceiros que passa a ser problema nosso. Antes de adicionar uma, responda:

1. **Precisa mesmo?** A biblioteca padrão do Node ou do PowerShell, ou um código que já existe aqui, resolve em poucas linhas?
2. **O projeto é saudável?** Veja se tem release recente, adoção, mais de um mantenedor, histórico de segurança e se não tem `postinstall` estranho.
3. **A licença é compatível?** O que vai no instalador precisa de licença compatível com MIT. O script aceita uma lista de licenças permissivas. Fora dela, registre a análise em `licencaRevisada`.
4. **Quanto custa?** Considere o tamanho no instalador ou no bundle e as dependências transitivas.
5. **Está no escopo certo?** O renderer é empacotado pelo Vite, então o que ele usa vai em `devDependencies`. Em `dependencies` só entra o que o processo principal carrega em tempo de execução.
6. **A versão está fixa?** Lockfile commitado, imagem com tag ou digest, Action com versão.

**Toda dependência é mapeada.** O [`docs/dependencias.md`](docs/dependencias.md) é gerado por `scripts/dependencias.mjs` a partir dos manifestos: npm, Docker, Dockerfile (ARG fixados e pip), GitHub Actions, módulos do PowerShell e Node. O motivo de cada dependência fica em [`docs/dependencias.justificativas.json`](docs/dependencias.justificativas.json).

- **Ao adicionar uma dependência,** o hook cria a entrada com motivo `PENDENTE` e avisa. Preencha `motivo` (e `alternativas`, se houve), rode `node scripts/dependencias.mjs` e commite o manifesto, o mapa e os motivos juntos.
- **Ao remover uma,** o script apaga a entrada sozinho.
- **Barreiras:** o Claude não encerra a tarefa com motivo `PENDENTE` (hook Stop), e o pre-commit e o CI recusam mapa desatualizado, motivo `PENDENTE` e licença não revisada.

## Fluxo de trabalho

- Trabalhe numa branch curta a partir da `main` (`feat/`, `fix/`, `refactor/`, `chore/`, `docs/`). Nada é commitado direto na `main`.
- PR pequeno, explicando o porquê e como foi testado. O merge só acontece com o CI verde.
- Commits seguem Conventional Commits em português (o hook `commit-msg` confere). As versões seguem SemVer: a do app em `app/package.json`, a da stack em `VERSION`. O changelog segue o Keep a Changelog, na seção "Não lançado".
- Não pule hooks (`--no-verify`) nem desligue checagens para fazer passar.
- Ative os git hooks uma vez por clone (o `npm ci` do app já faz isso): `git config core.hooksPath .githooks`.

## Definição de pronto

- [ ] Faz o que foi pedido, inclusive nos caminhos de erro, com mensagem acionável para o usuário.
- [ ] Testes novos ou ajustados. `npm run check` e Pester verdes, e e2e também se um fluxo de tela mudou.
- [ ] A documentação acompanha a mudança: README, CONTRIBUTING, `docs/`, CHANGELOG ("Não lançado") e capturas, se a tela mudou.
- [ ] Dependências mapeadas e com motivo. Nenhum segredo no diff.
- [ ] Acessível: teclado, foco visível, contraste (WCAG 2.2 AA) e textos em português claro.
- [ ] Aprendizado não óbvio registrado na memória. Decisão estrutural registrada em ADR.

## Como o Claude trabalha aqui

- **Entenda antes de mudar.** Leia o código e os testes vizinhos, a especificação (`docs/interface-electron.md`) e os aprendizados. Mudança grande ou ambígua começa com um plano.
- **Verifique de verdade.** Rode os testes relevantes e diga quais rodou. Não declare pronto sem evidência.
- **Pergunte só o que é do usuário:** produto, UX, quebra de compatibilidade e release. No resto, escolha o padrão sensato e diga qual escolheu.
- **No Windows,** o Git Bash e o Windows PowerShell 5.1 convivem. `.ps1` com acento precisa de BOM, e `.bat` aceita só ASCII.

## Memória do repositório

Os hooks do Claude Code (`.claude/settings.json` → `.claude/hooks/memoria.mjs`) fazem o repositório guardar memória e aprender:

| Evento | O que faz |
| --- | --- |
| `SessionStart` | Injeta no contexto a branch, os últimos commits, o resumo das últimas sessões e as pendências de dependência |
| `PostToolUse` | Anota os arquivos e commits da sessão. Se um manifesto mudou ou rodou um `npm install`, refaz o mapa de dependências e avisa sobre dependência nova |
| `Stop` | Não deixa encerrar com motivo `PENDENTE`. Depois de 3 arquivos alterados, ou de um commit, pede a revisão dos aprendizados (uma vez por etapa) |
| `PreCompact`, `SessionEnd` | Gravam o resumo da sessão em `.claude/memoria/sessoes/`, local e fora do git |

**O que vai para [`aprendizados.md`](.claude/memoria/aprendizados.md)** (versionado e curado): decisão e o porquê, armadilha, comando que funciona, convenção que não está escrita em outro lugar, engano corrigido. Uma linha por item, com data, na seção certa. Quando um item ficar errado, corrija ou apague; não acumule contradição. Se o arquivo passar de ~150 linhas, consolide.

**O que não vai:** o que o código, o `git log`, o README ou o CONTRIBUTING já dizem, coisa da tarefa do momento e qualquer segredo.

**Variáveis:** `SOULCRATE_MEMORIA=desligada` desliga tudo. `SOULCRATE_MEMORIA_REVISAO=desligada` desliga só a revisão. `SOULCRATE_MEMORIA_LIMIAR=5` muda o número de arquivos que dispara a revisão.

## Referências carregadas

@CONTRIBUTING.md
@.claude/memoria/aprendizados.md
