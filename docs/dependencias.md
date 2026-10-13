# Mapa de dependências

<!-- Gerado por `node scripts/dependencias.mjs`. Não edite à mão: mude o manifesto ou o motivo em dependencias.justificativas.json e rode o script de novo. -->

Tudo de que o Soulcrate depende e **por que** depende. O mapa é refeito a partir dos manifestos pelo `scripts/dependencias.mjs` (os hooks do Claude Code rodam o script quando um manifesto muda, e o CI confere que ele está em dia). O motivo de cada item mora em [`dependencias.justificativas.json`](dependencias.justificativas.json); a política para adicionar uma dependência está no [`CLAUDE.md`](../CLAUDE.md#dependências).

**50 dependências:** npm (app desktop) 35 · imagens docker 5 · fontes compiladas no build 2 · pacotes python 3 · github actions 3 · módulos do powershell 1 · ambiente 1.

## npm (app desktop)

O que o `npm ci` instala em `app/`. **runtime** vai dentro do instalador; **dev** só no desenvolvimento, no build e nos testes.

| Pacote | Versão | Escopo | Licença | Por que existe |
| --- | --- | --- | --- | --- |
| `@axe-core/playwright` | ^4.13.0 → 4.13.0 | dev | MPL-2.0 | Auditoria de acessibilidade (WCAG) das telas nos testes ponta a ponta. |
| `@eslint/js` | ^10.0.1 → 10.0.1 | dev | MIT | Regras recomendadas do ESLint para JavaScript, base do eslint.config.js. |
| `@fontsource-variable/archivo` | ^5.3.0 → 5.3.0 | dev | OFL-1.1 | Fonte da interface empacotada no app, que funciona offline e não chama a CDN do Google Fonts. |
| `@fontsource-variable/jetbrains-mono` | ^5.3.0 → 5.3.0 | dev | OFL-1.1 | Fonte monoespaçada (logs, comandos, caminhos) empacotada no app, que funciona offline. |
| `@playwright/test` | ^1.64.0 → 1.64.0 | dev | Apache-2.0 | Testes ponta a ponta que abrem o Electron de verdade (com o dublê do docker) e geram as capturas do README. |
| `@radix-ui/react-collapsible` | ^1.1.21 → 1.1.21 | dev | MIT | Seções recolhíveis acessíveis (teclado, ARIA) sem escrever esse comportamento à mão. |
| `@radix-ui/react-dialog` | ^1.2.0 → 1.2.0 | dev | MIT | Diálogos modais acessíveis (foco preso, Esc, ARIA) da biblioteca e das configurações. |
| `@radix-ui/react-tabs` | ^1.1.22 → 1.1.22 | dev | MIT | Abas acessíveis (navegação por setas, ARIA) nas telas com várias seções. |
| `@tailwindcss/vite` | ^4.3.3 → 4.3.3 | dev | MIT | Integra o Tailwind v4 ao build do Vite do renderer. |
| `@tanstack/react-query` | ^5.104.1 → 5.104.1 | dev | MIT | Cache, polling e estado assíncrono das chamadas IPC no renderer (estado da stack, histórico, biblioteca). |
| `@testing-library/react` | ^16.3.3 → 16.3.3 | dev | MIT | Testes de componentes React pelo comportamento visível (o que o usuário vê e clica). |
| `@types/node` | ^24.19.1 → 24.19.1 | dev | MIT | Tipos do Node.js para o processo principal, o preload e os scripts. |
| `@types/react` | ^19.3.0 → 19.3.0 | dev | MIT | Tipos do React para o TypeScript estrito do renderer. |
| `@types/react-dom` | ^19.3.0 → 19.3.0 | dev | MIT | Tipos do React DOM para o TypeScript estrito do renderer. |
| `@vitejs/plugin-react` | ^5.2.0 → 5.2.0 | dev | MIT | Suporte a JSX e Fast Refresh no build e no modo dev do renderer. |
| `electron` | ^44.7.0 → 44.7.0 | dev | MIT | Plataforma do app desktop (Chromium + Node.js). Fica em devDependencies porque o electron-builder embute o runtime. |
| `electron-builder` | ^26.15.3 → 26.15.3 | dev | MIT | Gera o instalador NSIS do Windows e o latest.yml que o atualizador automático lê. |
| `electron-log` | ^5.4.4 → 5.4.4 | runtime | MIT | Log em arquivo do processo principal (rotação, pasta padrão do app). O pacote de suporte anexa esse log depois de passar pelo filtro de segredos. |
| `electron-updater` | ^6.8.9 → 6.8.9 | runtime | MIT | Atualização automática do app pelas releases do GitHub (baixa, confere e instala). |
| `electron-vite` | ^5.0.0 → 5.0.0 | dev | MIT | Build e dev server dos três alvos do Electron (main, preload e renderer) com uma configuração só. |
| `eslint` | ^10.12.0 → 10.12.0 | dev | MIT | Lint do código TypeScript e React, que roda no npm run check e no CI. |
| `eslint-plugin-react-hooks` | ^7.1.1 → 7.1.1 | dev | MIT | Confere as regras dos hooks do React (dependências de efeitos, ordem de chamada). |
| `globals` | ^17.13.0 → 17.13.0 | dev | MIT | Lista de globais por ambiente (node, browser) para a configuração do ESLint. |
| `jsdom` | ^30.1.2 → 30.1.2 | dev | MIT | DOM simulado para os testes de componentes no Vitest. |
| `prettier` | ^3.9.9 → 3.9.9 | dev | MIT | Formatação automática e única do código. O CI confere com format:check. |
| `react` | ^19.3.0 → 19.3.0 | dev | MIT | Biblioteca de interface do renderer. Fica em devDependencies porque o Vite a embute no bundle. |
| `react-dom` | ^19.3.0 → 19.3.0 | dev | MIT | Renderização do React no DOM do renderer. |
| `react-router` | ^8.4.0 → 8.4.0 | dev | MIT | Navegação entre as telas do renderer (assistente, lote, histórico, biblioteca, configurações). |
| `tailwindcss` | ^4.3.3 → 4.3.3 | dev | MIT | CSS utilitário com tokens de tema (claro e escuro) do renderer. |
| `typescript` | ^6.0.3 → 6.0.3 | dev | Apache-2.0 | Tipagem estática estrita do app inteiro (main, preload, renderer, shared e testes). |
| `typescript-eslint` | ^8.71.1 → 8.71.1 | dev | MIT | Regras do ESLint que entendem os tipos do TypeScript. |
| `vite` | ^7.3.7 → 7.3.7 | dev | MIT | Bundler usado pelo electron-vite e pelo Vitest. |
| `vitest` | ^5.0.3 → 5.0.3 | dev | MIT | Testes unitários e de integração do app, que reaproveitam a configuração do Vite. |
| `yaml` | ^2.9.1 → 2.9.1 | runtime | ISC | Lê e grava o slskd.yml e a configuração do beets preservando comentários e a formatação que o usuário editou (config-arquivos.ts). |
| `zustand` | ^5.0.15 → 5.0.15 | dev | MIT | Estado do renderer que continua valendo quando o usuário troca de tela (lote em andamento, biblioteca, estado da stack). É mais leve que Redux. |

## Imagens Docker

Imagens que a stack roda (`docker-compose.yml`, escopo runtime) ou usa para construir a imagem do Soulbeet (`Dockerfile`, escopo build).

| Nome | Versão | Escopo | Onde | Por que existe |
| --- | --- | --- | --- | --- |
| `debian` | bookworm-slim | build | `soulbeet/Dockerfile` | Estágio de build do Dockerfile do Soulbeet que compila libkeyfinder e keyfinder-cli. bookworm-slim tem a mesma glibc (2.36) da imagem final distroless. |
| `deluan/navidrome` | 0.64.2 | runtime | `docker-compose.yml` | Servidor de streaming da biblioteca (interface web e API Subsonic para ouvir no celular). Serviço da stack, com tag fixa. |
| `docccccc/soulbeet` | full@sha256:c419f11ee147 | build | `soulbeet/Dockerfile` | Base da imagem do Soulbeet (beets 2.11 com fetchart, embedart, lastgenre, chroma). A tag full não tem versão, por isso fica travada pelo digest. |
| `python` | 3.11-slim-bookworm | build | `soulbeet/Dockerfile` | Estágio de build do Dockerfile do Soulbeet. Instala os plugins Python no venv da imagem base, que é distroless e não tem pip usável. |
| `slskd/slskd` | 0.26.0 | runtime | `docker-compose.yml` | Cliente do Soulseek com API REST. É o que busca e baixa as faixas, e o baixar-lista.ps1 fala com ele. Serviço da stack, com tag fixa. |

## Fontes compiladas no build

Repositórios clonados e compilados dentro do `Dockerfile`, fixados por tag ou commit.

| Nome | Versão | Escopo | Onde | Por que existe |
| --- | --- | --- | --- | --- |
| `keyfinder-cli` | c8a0c6f188f2 | build | `soulbeet/Dockerfile` | CLI que o plugin keyfinder do beets chama para detectar o tom harmônico (mixagem harmônica para DJ). Compilado do fonte, travado por commit. |
| `libkeyfinder` | v2.2.6 | build | `soulbeet/Dockerfile` | Biblioteca de detecção de tom usada pelo keyfinder-cli. Não tem pacote no Debian, então é compilada do fonte com tag fixa. |

## Pacotes Python

Instalados por cima da imagem do Soulbeet (plugins do beets).

| Nome | Versão | Escopo | Onde | Por que existe |
| --- | --- | --- | --- | --- |
| `beetcamp` | 0.25.0 | build | `soulbeet/Dockerfile` | Plugin do beets que busca metadados no Bandcamp, onde está boa parte da música eletrônica independente. |
| `librosa` | 0.11.0 | build | `soulbeet/Dockerfile` | Análise de áudio usada pelo plugin autobpm do beets para calcular o BPM. |
| `resampy` | 0.4.3 | build | `soulbeet/Dockerfile` | Reamostragem de áudio exigida pelo librosa na análise de BPM. |

## GitHub Actions

Ações de terceiros usadas pelos workflows do CI e da release.

| Nome | Versão | Escopo | Onde | Por que existe |
| --- | --- | --- | --- | --- |
| `actions/checkout` | v4 | ci | `.github/workflows/ci.yml`, `.github/workflows/release.yml` | Baixa o repositório nos jobs do CI e da release. Ação oficial do GitHub. |
| `actions/setup-node` | v4 | ci | `.github/workflows/ci.yml`, `.github/workflows/release.yml` | Instala o Node.js da versão do app/.nvmrc e guarda o cache do npm no CI e na release. Ação oficial do GitHub. |
| `actions/upload-artifact` | v4 | ci | `.github/workflows/ci.yml`, `.github/workflows/release.yml` | Guarda resultados do Pester, capturas do Playwright e o instalador gerado como artefatos do CI. Ação oficial do GitHub. |

## Módulos do PowerShell

Instalados da PowerShell Gallery para os testes.

| Nome | Versão | Escopo | Onde | Por que existe |
| --- | --- | --- | --- | --- |
| `Pester` | >= 5.5.0 | ci, teste | `.github/workflows/ci.yml`, `tests/Repositorio.Tests.ps1`, `tests/baixar-lista.Integracao.Tests.ps1`, `tests/baixar-lista.lib.Tests.ps1`, `tests/validar-config.Tests.ps1` | Framework de testes do PowerShell (5.5 ou mais novo) para baixar-lista, validar-config e as regras do repositório. |

## Ambiente

Ferramentas que precisam estar na máquina de quem desenvolve.

| Nome | Versão | Escopo | Onde | Por que existe |
| --- | --- | --- | --- | --- |
| `Node.js` | 24 | dev | `app/.nvmrc` | Versão do Node.js para desenvolver e rodar o CI. Também roda os dublês dos testes do PowerShell e os scripts de scripts/. |
