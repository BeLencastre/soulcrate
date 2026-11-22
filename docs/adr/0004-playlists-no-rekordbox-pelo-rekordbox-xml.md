# 0004. Playlists no Rekordbox pelo rekordbox XML, sem tocar no banco do Rekordbox

- Status: Proposto (vira Aceito depois do teste no Rekordbox 7.2.19 descrito em [`../plano-rekordbox-xml.md`](../plano-rekordbox-xml.md#fase-0-teste-no-rekordbox-7219))
- Data: 2026-11-16

## Contexto

O Soulcrate organiza `music/` em `Gênero/Artista/Título`, mas o Rekordbox não vê essa organização. Ele não tem pasta monitorada: o manual do 7.2.3 não traz a opção, e a Pioneer confirmou no fórum que ela não existe. Importar uma pasta só joga as faixas na Coleção. Arrastar a pasta para Playlists cria **uma** playlist e perde as subpastas. Para tocar no Rekordbox ou exportar para o pendrive, a pessoa montava à mão as playlists que o disco já tinha.

O Rekordbox tem dois caminhos de escrita de fora:

- **O banco (`master.db`).** É SQLite cifrado com SQLCipher e não tem documentação oficial. O que existe vem de engenharia reversa: a [pyrekordbox](https://github.com/dylanljones/pyrekordbox) e o [rekordbox-mcp](https://github.com/davehenke/rekordbox-mcp), feito em cima dela.
- **O rekordbox XML.** É o [formato de troca oficial](https://rekordbox.com/en/support/developer/): o Rekordbox lê um arquivo XML com a coleção e as playlists (com pastas aninhadas) e mostra a árvore em *rekordbox xml*. Dali, a pessoa importa as playlists que quiser.

## Decisão

- O app grava um rekordbox XML em `<pasta do Soulcrate>/rekordbox/soulcrate.xml`, com a árvore `Soulcrate › Gêneros › <gênero>` e `Soulcrate › Listas › <lista>`. Com a escolha do Rekordbox por gênero e artista ([ADR 0005](0005-organizacao-das-pastas-escolhida-no-app.md)), cada gênero vira uma pasta com a playlist `Todas` e uma playlist por artista, tirado do caminho no disco. A pessoa aponta o Rekordbox para ele uma vez (Preferências › Avançado › Banco de dados › rekordbox xml › Imported Library) e, a cada atualização, importa a pasta `Soulcrate`. **O app nunca lê nem escreve o banco do Rekordbox.**
- **A playlist de gênero sai do caminho do arquivo**, não da tag: é o primeiro nível de `music/`, o mesmo nome que o `pastas.py` deu à pasta. As regras de grafia e de primeiro gênero valem sem serem copiadas para TypeScript, e o Rekordbox mostra o que está no disco.
- **A playlist de lista sai da análise do próprio script.** Com `-SoAnalisar -AnalisarBiblioteca`, o `baixar-lista.ps1` passa a dizer em cada linha qual faixa do beets casou (`libraryId`, pela mesma regra do "ja na biblioteca"). Vale também para as linhas "ja feita". A playlist segue a ordem da lista e entra só para as listas que já rodaram (têm `lotes/estado-<lista>.tsv`). O casamento de artista e título continua num lugar só, o script.
- **Cada faixa leva o mínimo:** `TrackID` (o `$id` do beets, estável entre gerações), `Name`, `Artist` e `Location` (`file://localhost/C:/...`, com cada parte do caminho codificada em UTF-8 percentual). BPM, tom, gênero e cues ficam com as tags e com a análise do próprio Rekordbox, para o XML nunca contradizer o arquivo.
- **A primeira geração é sempre pedida** (botão no cartão Rekordbox da Biblioteca). Depois, o arquivo existe e o app o refaz sozinho quando a biblioteca muda: fim de um lote, Cuidar da biblioteca (menos calcular tom e BPM) e remover uma faixa. Quem não usa Rekordbox nunca ganha o arquivo.
- As regras são puras (`shared/rekordbox.ts`). O `RekordboxService` lê o beets e as listas e grava o arquivo de forma atômica, e o cartão acompanha pelo evento `rekordbox.state`. Sem dependência nova: o XML é gerado com poucas linhas, com escape próprio.

## Alternativas consideradas

- **Escrever no `master.db`** (pyrekordbox, rekordbox-mcp). Seria totalmente automático, mas o Rekordbox precisa estar fechado na hora de gravar, e a chave e o esquema mudam entre versões (a pyrekordbox foi testada até o 7.0.9; a instalada é a 7.2.19). Um erro estraga a biblioteca da pessoa (cues, análises, históricos). A faixa nova entra sem título até a pessoa usar "Reload Tag". Exigiria Python no Windows, e o da stack está num contêiner distroless.
- **Intelligent Playlists.** Filtram pela tag, e o Soulcrate de propósito não regrava o gênero (o Rekordbox lê as tags originais): `Psytrance` e `Psy-Trance` virariam listas separadas. Ainda seriam criadas à mão, uma por gênero.
- **Gravar o pendrive sem o Rekordbox** (Device Library, OneLibrary). Sem a análise do Rekordbox (beatgrid, waveform) e com formato não oficial: risco na hora da gig.
- **Casar as linhas da lista com a biblioteca em TypeScript.** Duplicaria a normalização e as regras de artista, mix e versões proibidas que o script já tem. A análise do script já faz isso.
- **Marcar as faixas na importação** (`beet import --set soulcrate_lista=...`). Pegaria só o que a lista baixou depois da mudança, não o que já estava na biblioteca, e um campo só não guarda várias listas.

## Consequências

- O app não corre risco de estragar a biblioteca do Rekordbox, e o arquivo pode ser gerado com o Rekordbox aberto.
- Sobra um passo manual a cada atualização: atualizar o *rekordbox xml* e importar a pasta `Soulcrate`. O que acontece ao reimportar (duplica, substitui ou atualiza; se a análise e os cues ficam) **não está documentado** e só o teste no Rekordbox responde. Se reimportar apagar a análise, o XML terá de levar só as faixas novas.
- A análise de cada lista roda o PowerShell e um `beet ls`: com muitas listas, gerar leva alguns segundos por lista. Listas que falham ficam de fora e são avisadas no cartão.
- Um script anterior à stack 1.4.0 não diz qual faixa casou: as listas ficam de fora até os arquivos da stack serem atualizados.
- O `Location` de um caminho de rede (`\\servidor\pasta`) não foi conferido no Rekordbox.
