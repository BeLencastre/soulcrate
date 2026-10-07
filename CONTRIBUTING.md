# Contribuindo com o Soulcrate

## Testes

Rode antes de abrir um pull request. O CI roda os mesmos testes no Windows PowerShell 5.1, no PowerShell 7 e no Node.js.

```bash
powershell -File tests\Invoke-Testes.ps1                 # scripts (Pester 5+; a integração precisa do Node.js)
powershell -File tests\Invoke-Testes.ps1 -SemIntegracao  # só os rápidos
cd app && npm ci && npm run check                        # app: lint, formatação, tipos e testes
```

| Arquivo | O que cobre |
| --- | --- |
| `tests/baixar-lista.lib.Tests.ps1` | Limpeza e leitura da lista, comparação de arquivos, formato, grafia e catálogo, com os exemplos do README |
| `tests/baixar-lista.Integracao.Tests.ps1` | O lote inteiro contra um slskd falso: relatórios, eventos, parada segura, trava, códigos de saída, análise |
| `tests/validar-config.Tests.ps1` | Regras do `.env` e do `slskd.yml` (casos em `app/tests/fixtures/config/casos.json`) |
| `tests/Repositorio.Tests.ps1` | Codificação: `.ps1` com acento precisa de BOM; `.bat` só com ASCII |

**Mudou o `baixar-lista.ps1`?** Sem os parâmetros novos (`-Eventos`, `-ArquivoParada`, `-IdExecucao`, `-SoAnalisar`), a tela e os arquivos de `lotes/` precisam continuar iguais. Se o protocolo de eventos mudar, atualize [`docs/eventos-lote.md`](docs/eventos-lote.md), os tipos em `app/src/shared/` e regenere as fixtures:

```bash
powershell -File tests\Gerar-Fixtures.ps1
```

## Codificação dos arquivos

- `.ps1` com acentos: **UTF-8 com BOM**. O Windows PowerShell 5.1 lê arquivo sem BOM como ANSI e quebra em silêncio (o teste `Repositorio.Tests.ps1` pega isso).
- `.bat`: só ASCII, com CRLF (`.gitattributes`).
- O resto: UTF-8 sem BOM.

## Commits

O histórico segue o [Conventional Commits](https://www.conventionalcommits.org/pt-br/v1.0.0/), em português:

```text
<tipo>(<escopo opcional>): <resumo no imperativo ou descritivo, minúsculo>

<corpo opcional: o quê e por quê>
```

| Tipo | Quando |
| --- | --- |
| `feat` | Funcionalidade nova para o usuário |
| `fix` | Correção de bug |
| `docs` | Só documentação |
| `test` | Só testes |
| `refactor` | Mudança de código sem mudar o comportamento |
| `chore` | Manutenção (dependências, configuração, CI) |

Escopos usados: `lote` (download em lote), `stack` (compose, Dockerfile, configuração), `app`.

Mudanças que quebram compatibilidade (parâmetro removido, formato de evento alterado, variável nova obrigatória no `.env`) levam `!` depois do tipo (`feat(lote)!: ...`) e uma linha `BREAKING CHANGE:` no corpo.

## Versões e changelog

- A **stack** tem a versão no arquivo [`VERSION`](VERSION) (SemVer). Mude-a quando mudar algo em `docker-compose.yml`, `soulbeet/`, `slskd/slskd.example.yml`, `.env.example` ou nos scripts.
- O **app** terá a versão própria em `app/package.json`.
- Registre as mudanças visíveis em [`CHANGELOG.md`](CHANGELOG.md), na seção "Não lançado".
