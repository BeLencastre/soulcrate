# Plano: pastas e playlists no Rekordbox pelo rekordbox XML

Status: **implementado, falta o teste no Rekordbox** (fase 0, abaixo). A decisão está no [ADR 0004](adr/0004-playlists-no-rekordbox-pelo-rekordbox-xml.md), ainda como "Proposto". Depois do teste: ajuste o que ele pedir, marque o ADR como "Aceito", passe as perguntas que sobrarem para o [roteiro manual](roteiro-manual.md#e3-playlists-no-rekordbox) e apague este arquivo, como foi feito com a especificação antiga.

## O problema

O Soulcrate organiza `music/` em `Gênero/Artista/Título`, mas o Rekordbox não enxerga essa organização. Ele não tem pasta monitorada (o manual do 7.2.3 não tem a opção, e a Pioneer confirma no fórum). Importar uma pasta só joga as faixas na Coleção, e arrastar a pasta para Playlists cria **uma** playlist e perde as subpastas. Hoje a pessoa monta à mão, no Rekordbox, as playlists que já existem no disco, para tocar no próprio Rekordbox e para exportar ao pendrive.

## O que foi decidido

O app grava um arquivo **rekordbox XML**, o formato de troca oficial da Pioneer ([rekordbox for Developers](https://rekordbox.com/en/support/developer/)), com esta árvore:

```text
Soulcrate                    (pasta)
├── Gêneros                  (pasta)
│   ├── Acid Techno          (playlist: as faixas de music/Acid Techno/, por artista e título)
│   └── Hard Techno          (playlist)
└── Listas                   (pasta; só aparece se houver lista)
    └── techno-pesado        (playlist: as faixas da lista que estão na biblioteca, na ordem da lista)
```

As respostas às perguntas de produto (16/11):

1. A organização é **só por gênero**: uma playlist por gênero, sem playlists por artista. *Revisto em 22/11:* a pessoa escolhe em Suas músicas, independente da organização do disco, e no modo gênero e artista cada gênero vira uma pasta com `Todas` e uma playlist por artista (ADR 0005 (arquivado)).
2. **Gerar sozinho** entra junto: depois da primeira vez, o arquivo se refaz ao fim de cada lote, de Cuidar da biblioteca (menos calcular tom e BPM) e de remover uma faixa.
3. A **playlist por lista baixada** entra. Ela sai da análise do próprio script (`-SoAnalisar -AnalisarBiblioteca`), que agora diz em cada linha qual faixa do beets casou (`libraryId`). Vale também para as faixas que já estavam na biblioteca antes de a lista rodar. Entram só as listas que já rodaram (têm `lotes/estado-<lista>.tsv`).

O porquê de não escrever no `master.db` (pyrekordbox, [rekordbox-mcp](https://github.com/davehenke/rekordbox-mcp)), de não usar Intelligent Playlists e de não gravar o pendrive direto está no ADR.

## O que foi implementado

| Peça | Onde |
| --- | --- |
| Regras puras: árvore, `Location`, XML, escape | `app/src/shared/rekordbox.ts` (testes em `app/tests/shared/rekordbox.test.ts`) |
| Ler o beets e as listas, gravar de forma atômica, refazer sozinho | `app/src/main/services/rekordbox-service.ts` (testes em `app/tests/main/rekordbox-service.test.ts`) |
| Gatilhos: fim de lote, Cuidar da biblioteca, remover | `app/src/main/index.ts` (`aoMudarBiblioteca`) e `app/src/main/ipc.ts` (`library:remove`) |
| IPC e evento | `rekordbox:state`, `rekordbox:generate` e o evento `rekordbox.state` (`app/src/shared/ipc.ts`, preload) |
| Erro do catálogo | `rekordbox.nao-gravou` (`erros.ts`, `mensagens.ts`) |
| Cartão na Biblioteca, igual nos dois modos | `app/src/renderer/components/biblioteca/CartaoRekordbox.tsx` (testes em `biblioteca-telas.test.tsx`) |
| Análise da lista com o `libraryId` (stack 1.4.0) | `baixar-lista.ps1`, `Find-InLibrary` em `baixar-lista.lib.ps1`, [`eventos-lote.md`](eventos-lote.md#análise-da-lista--soanalisar) |
| Ponta a ponta com o script de verdade e o dublê do docker | `app/tests/e2e/fase-5.spec.ts` (`dockerDoDubleNosScripts`) |

O arquivo fica em `<pasta do Soulcrate>\rekordbox\soulcrate.xml`. Cada faixa leva só `TrackID` (o `$id` do beets), `Name`, `Artist` e `Location`.

**Ficou de fora:** a linha "Playlists do Rekordbox atualizadas" no aviso de lote concluído. O cartão já mostra quando o arquivo foi atualizado; se fizer falta, entra depois.

## Fase 0: teste no Rekordbox 7.2.19

O manual não responde a tudo. O teste começa com **cópias** de 7 faixas, em `C:\DJ\soulcrate-teste\musicas\`, para não tocar nas faixas que já estão na Coleção. Os nomes cobrem `Ø`, cirílico, `&`, `[ ]`, `( )` e `+`. Os XML do teste têm a mesma estrutura e os mesmos atributos que o app grava.

Arquivos do teste em `C:\DJ\soulcrate-teste\`:

- `soulcrate-teste.xml`: o arquivo que o Rekordbox lê (começa igual à v1);
- `soulcrate-teste.v1.xml`: 6 faixas, `Soulcrate (teste) › Gêneros` com 3 gêneros e `Listas › lista-teste` com 3 faixas;
- `soulcrate-teste.v2.xml`: mais uma faixa (`Stan Christ`, em Acid Techno e no fim da lista), e `Exploited` com o nome `Exploited [v2]` (para ver se reimportar sobrescreve o título de uma faixa que já está na Coleção).

**Parte 1, sem pendrive** (com as cópias):

1. Faça um backup da biblioteca: **Arquivo › Biblioteca › Fazer backup da biblioteca**.
2. Em **Preferências › Avançado › Banco de dados › rekordbox xml › Imported Library**, escolha `C:\DJ\soulcrate-teste\soulcrate-teste.xml`. Se a árvore não mostrar *rekordbox xml*, ligue em **Preferências › Exibição › Layout › Media Browser**.
3. Na árvore, abra *rekordbox xml › Playlists*. Confira se aparecem `Soulcrate (teste)`, `Gêneros`, `Listas` e as playlists.
4. Clique com o botão direito em `Soulcrate (teste)` e escolha **Importar playlist**. Se não houver a opção para pasta, arraste a pasta para *Playlists*.
5. Analise uma das faixas importadas e marque um cue nela.
6. Troque o arquivo pela v2: copie `soulcrate-teste.v2.xml` por cima de `soulcrate-teste.xml`. Clique em atualizar na árvore *rekordbox xml* e importe `Soulcrate (teste)` de novo.
7. No fim, apague `Soulcrate (teste)` de *Playlists* e as 7 faixas de teste da Coleção. Depois apague `C:\DJ\soulcrate-teste\`.

**Parte 2, com o app** (só se a parte 1 não mostrou nada que estrague a análise):

8. No app, em **Biblioteca → Rekordbox**, clique em **Criar as playlists**. Aponte o *Imported Library* para o arquivo que o cartão mostra e importe a pasta `Soulcrate`.
9. Rode um lote pequeno. Confira se o cartão diz que as playlists foram atualizadas, e importe `Soulcrate` de novo.

**Parte 3, com pendrive:**

10. Exporte `Soulcrate` para o pendrive e confira a árvore no dispositivo (ou no CDJ/XDJ).

**O que anotar:**

| # | Pergunta | Resultado |
| --- | --- | --- |
| T1 | A árvore inteira (`Soulcrate (teste) › Gêneros/Listas › playlists`) aparece em *rekordbox xml*? | |
| T2 | Importar a pasta raiz traz a árvore inteira de uma vez, ou é preciso importar playlist por playlist? | |
| T3 | As 6 faixas entram na Coleção e tocam (`Ø`, cirílico, `&`, `[ ]`, `( )`, `+` no caminho)? | |
| T4 | O título que aparece é o da tag ou o `Name` do XML? (Em `Luke Noize - I Told You [FREE DL + SPOTIFY]`, o `Name` é o nome do arquivo.) | |
| T5 | Reimportar (v2) cria uma segunda `Soulcrate (teste)`, pergunta se substitui, ou atualiza a existente? | |
| T6 | `Stan Christ` aparece em Acid Techno e no fim de `lista-teste` depois da reimportação? `Exploited` vira `Exploited [v2]`? | |
| T7 | A faixa analisada no passo 5 perde a análise ou o cue ao reimportar? | |
| T8 | A exportação para o pendrive mantém as pastas e as subpastas? | |
| T9 | Com o Rekordbox aberto o tempo todo, algo falhou ou travou? | |
| T10 | Com o app: o arquivo do cartão importa igual, e a atualização depois de um lote aparece? | |

**Como o resultado muda o código:**

- **T4 e T6 (o XML vence a tag):** tirar `Name` e `Artist` do `TRACK` em `gerarXml` e deixar só `TrackID` e `Location`, ou passar a mandar o título e o artista exatamente como estão na tag (hoje, faixa sem título usa o nome do arquivo).
- **T5 (reimportar duplica):** a instrução do cartão e do README passa a ser "apague a pasta Soulcrate antes de importar de novo". Outra saída é uma pasta só com o que entrou desde a última vez.
- **T7 (reimportar apaga a análise ou os cues):** o XML não pode trazer faixas que já estão na Coleção. Seria preciso guardar o que já foi entregue e gerar só as novas, o que muda o desenho do serviço.
- **T2 (sem importação da pasta inteira):** a instrução passa a ser importar `Gêneros` e `Listas` (ou cada playlist).
- **T3 (algum caminho não abre):** ajustar `codificarParte` em `shared/rekordbox.ts` (hoje codifica tudo menos letras, números, `- _ . ~`) e o teste do `Location`.
