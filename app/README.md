# App do Soulcrate (Electron)

> **Esqueleto.** Esta pasta ainda não tem o Electron: tem as ferramentas (TypeScript, ESLint, Prettier, Vitest), os tipos do protocolo do download em lote e as fixtures. O app em si começa na Fase 0 da [especificação](../docs/interface-electron.md#fase-0-esqueleto).

## Requisitos

- Node.js 24 (`.nvmrc`). Com o nvm-windows: `nvm install 24 && nvm use 24`.
- Para os testes do PowerShell (na raiz do repositório): Pester 5 ou mais novo (`Install-Module Pester -Scope CurrentUser`).

## Comandos

```bash
npm ci              # instala as dependências (exatamente as do package-lock.json)
npm run check       # lint + formatação + tipos + testes (o mesmo que o CI roda)
npm test            # só os testes
npm run test:watch  # testes em modo contínuo
npm run format      # formata o código
```

## O que já existe

| Caminho                            | Conteúdo                                                                                                                          |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/eventos-lote.ts`       | Tipos e leitura dos eventos do `baixar-lista.ps1 -Eventos` ([protocolo](../docs/eventos-lote.md))                                 |
| `src/shared/analise-lista.ts`      | Tipos e leitura da saída do `baixar-lista.ps1 -SoAnalisar`                                                                        |
| `tests/fixtures/lote/`             | Eventos, relatórios e análise gravados de execuções reais contra o slskd falso                                                    |
| `tests/fixtures/config/casos.json` | Casos da validação do `.env`/`slskd.yml` ([regras](../docs/validacao-configuracao.md)), compartilhados com o `validar-config.ps1` |

## Fixtures

As fixtures do lote são geradas rodando o script de verdade. Regenere sempre que o protocolo mudar:

```bash
powershell -File ..\tests\Gerar-Fixtures.ps1
```

Elas ficam com os bytes exatos que o PowerShell grava (BOM e CRLF nos `.txt`, `.gitattributes` com `-text`). O código do app precisa lidar com isso. Não formate nem edite as fixtures à mão.

O slskd falso (`../tests/dubles/slskd-falso.mjs`) também serve para os testes de integração do app.

## Convenções

- TypeScript estrito; todo o app em TypeScript.
- Commits no padrão [Conventional Commits](../CONTRIBUTING.md#commits).
- Textos da interface em português do Brasil, com o vocabulário do README ("lista", "lote", "biblioteca", "faixa").
