# Registros de decisão de arquitetura (ADR)

Um ADR guarda uma decisão de arquitetura: o contexto, o que foi decidido e as consequências. Ele existe para que a próxima pessoa (ou o próximo agente) entenda **por que** o sistema é como é antes de mudar. O formato segue o [MADR](https://adr.github.io/madr/), resumido.

**Quando escrever:** tecnologia ou dependência estrutural nova, mudança de camada ou de fronteira entre processos, mudança de protocolo ou de formato persistido, ou qualquer trade-off difícil de desfazer. Investigações que embasam uma decisão entram no próprio ADR (ou, se viram contrato com um serviço de terceiros, num documento de referência, como [`../apis-da-stack.md`](../apis-da-stack.md)).

**Como:** copie o modelo abaixo para `NNNN-titulo-em-kebab-case.md`, com o próximo número. Um ADR aceito não é reescrito. Se a decisão mudar, escreva um novo ADR que o substitui e marque o antigo como "Substituído por NNNN".

| Nº | Decisão | Status |
| --- | --- | --- |
| [0001](0001-memoria-do-repositorio-e-mapa-de-dependencias.md) | Memória do repositório e mapa de dependências com hooks | Aceito |
| [0002](0002-modo-dj-e-modo-dev.md) | Modo DJ e Modo Dev: uma preferência que muda só o que aparece | Aceito |
| [0003](0003-app-desktop-decisoes-da-primeira-versao.md) | App desktop: decisões da primeira versão | Aceito |

## Modelo

```markdown
# NNNN. Título da decisão

- Status: Proposto | Aceito | Substituído por NNNN
- Data: AAAA-MM-DD

## Contexto

O problema, as forças em jogo e as restrições.

## Decisão

O que foi decidido, na voz ativa ("Usamos X para Y").

## Alternativas consideradas

- Opção A: por que não.
- Opção B: por que não.

## Consequências

O que fica mais fácil, o que fica mais difícil e o que precisa ser acompanhado.
```
