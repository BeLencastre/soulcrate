# 0001. Memória do repositório e mapa de dependências com hooks

- Status: Aceito
- Data: 2026-10-13

## Contexto

Boa parte do desenvolvimento do Soulcrate é feita com o Claude Code. Cada sessão começa sem lembrar das anteriores, e por isso armadilhas já resolvidas voltam: a busca recusada pelo slskd, a imagem distroless do Soulbeet, o BOM dos `.ps1`. Também queremos saber, a qualquer momento, de que o projeto depende e por quê. Hoje isso fica espalhado por `package.json`, `docker-compose.yml`, `Dockerfile`, workflows e testes do PowerShell, e o motivo de cada dependência não está escrito em lugar nenhum.

## Decisão

1. **[`CLAUDE.md`](../../CLAUDE.md) na raiz** com as premissas de engenharia. Ele importa o `CONTRIBUTING.md` e a memória curada.
2. **Memória em duas camadas:**
   - `.claude/memoria/aprendizados.md` é versionado e curado (uma linha por aprendizado, com data e porquê) e é carregado em toda sessão;
   - `.claude/memoria/sessoes/` guarda resumos automáticos de cada sessão; é local, fica fora do git e é podado após 30 sessões.
3. **Hooks do Claude Code** (`.claude/settings.json` → `.claude/hooks/memoria.mjs`, Node puro):
   - no `SessionStart`, injetam o contexto (branch, commits, sessões recentes, pendências);
   - no `PostToolUse`, anotam o que mudou e refazem o mapa de dependências quando um manifesto muda;
   - no `Stop`, cobram o motivo de dependência nova e pedem a revisão dos aprendizados quando a etapa mexeu em código;
   - no `PreCompact` e no `SessionEnd`, gravam o resumo da sessão.
4. **Mapa de dependências gerado** (`scripts/dependencias.mjs` → [`docs/dependencias.md`](../dependencias.md)):
   - cobre npm, imagens Docker, fontes fixadas no Dockerfile, pip, GitHub Actions, módulos do PowerShell e Node;
   - o motivo de cada dependência é escrito à mão em `docs/dependencias.justificativas.json`;
   - dependência nova entra como `PENDENTE`;
   - o hook `pre-commit` (`.githooks/`) e o job `repositorio` do CI recusam mapa desatualizado, motivo `PENDENTE` e licença de runtime fora da lista permissiva sem revisão.

## Alternativas consideradas

- **Só a memória automática do Claude Code (por usuário, fora do repositório):** não é compartilhada nem revisada em PR e se perde ao trocar de máquina.
- **Versionar o diário automático de sessões:** gera ruído em todo diff e mistura fato durável com o andamento de uma tarefa.
- **Ferramentas prontas de SBOM ou licenças (CycloneDX, license-checker):** cobrem só o npm e não registram o porquê. Ficam como complemento futuro para gerar um SBOM na release.
- **Hooks em PowerShell ou Bash:** o Node já é requisito do projeto e roda igual no Git Bash, no PowerShell e no CI. Tudo foi escrito sem dependências, para rodar antes do `npm ci`.

## Consequências

- Adicionar uma dependência exige escrever o motivo junto. Esse custo é pequeno e intencional.
- Etapas que mexem em código podem terminar com um passo a mais (a revisão de aprendizados). O passo pode ser ajustado ou desligado por variável de ambiente (`SOULCRATE_MEMORIA_*`).
- O `aprendizados.md` precisa de curadoria. Se crescer além de ~150 linhas, deve ser consolidado, e o que virou regra estável deve subir para o `CLAUDE.md` ou o `CONTRIBUTING.md`.
- Os hooks de projeto só rodam depois que o workspace é marcado como confiável no Claude Code. Quem não usa o Claude Code continua protegido pelo `pre-commit` e pelo CI.
