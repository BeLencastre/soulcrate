# 0005. Organização do disco e do Rekordbox escolhidas no app, de forma independente

- Status: Aceito
- Data: 2026-11-22

## Contexto

A biblioteca sempre foi `Gênero/Artista/Título`. Há DJs que preferem só uma pasta por gênero, com as faixas direto nela. E o que serve no disco nem sempre serve no Rekordbox (as playlists do [ADR 0004](0004-playlists-no-rekordbox-pelo-rekordbox-xml.md)): dá para querer o disco só por gênero e, no Rekordbox, uma playlist por artista, ou o contrário.

Quem monta o caminho no disco é o beets, dentro do contêiner do Soulbeet. Ele roda pelo app (`beet move`, `update`) e também pelo próprio Soulbeet, que importa os downloads sem passar pelo app. Então a escolha do disco precisa chegar ao beets sem depender de um argumento que o app passe na linha de comando.

O `config.yaml` é um arquivo da stack: o app o atualiza e, se a pessoa o editou, deixa a versão nova ao lado como `config.yaml.novo`. Gravar a escolha nele faria o app brigar com a atualização da stack e com as edições da pessoa.

## Decisão

- São **duas escolhas independentes**, cada uma entre só gênero (`genero`) e gênero e artista (`genero-artista`): uma para o disco e outra para o Rekordbox. Na tela, a aba **Organizar** de Suas músicas tem os dois grupos.
- As duas ficam em `soulbeet/data/pastas.json` (`{"disco": "...", "rekordbox": "..."}`), que o contêiner vê como `/data/pastas.json`. É dado do usuário, como o resto de `soulbeet/data/`: a atualização da stack não toca nele.
- **Disco.** O plugin `pastas.py` lê só `disco`, uma vez por comando, e entrega `$organizar_por_artista` (`1` ou `0`). O `paths:` do `config.yaml` usa `%if{$organizar_por_artista,...}`:
  - gênero e artista: `Hard Techno/Azyr/No Escape`;
  - só gênero: `Hard Techno/Azyr - No Escape` (o artista vai no nome do arquivo para faixas de artistas diferentes não colidirem).
  Escolher não move arquivos. A tela oferece **Reorganizar as pastas** (`beet move`, com prévia e confirmação), a mesma tarefa de Cuidar da biblioteca.
- **Rekordbox.** Só o app lê `rekordbox`. Só gênero dá uma playlist por gênero; gênero e artista dá uma pasta por gênero com a playlist `Todas` e uma playlist por artista. Trocar refaz o rekordbox XML, se ele já existe.
- **O Rekordbox tira gênero e artista do caminho no disco**, seja qual for a organização do disco, para não copiar para TypeScript as regras do `pastas.py`: o gênero é a primeira pasta; o artista é a segunda pasta ou, com o disco só por gênero, o começo do nome do arquivo, até o primeiro `" - "`.
- Sem o arquivo, ou com uma escolha ilegível, aquela escolha vale gênero e artista: quem já usava não vê nada mudar.
- O formato do arquivo é contrato entre `app/src/shared/organizacao.ts` e `pastas.py`; o teste `organizacao.test.ts` confere os dois lados e o `config.yaml`.

## Alternativas consideradas

- **Uma escolha só para o disco e o Rekordbox.** Foi a primeira versão. Amarrava duas coisas que a pessoa quer decidir separadas: a organização dos arquivos e a das playlists.
- **Ler o artista do beets** (um campo do `pastas.py` no `ls -f`) para a árvore do Rekordbox. Seria exato, mas muda o formato da leitura da biblioteca, os dublês e as fixtures, e falha com um plugin antigo. O nome do arquivo já traz o mesmo artista.
- **Escrever no `config.yaml`.** Briga com a atualização da stack (`.novo`) e com as edições da pessoa.
- **`include:` do beets** apontando para um arquivo do app. O beets escreve um erro no stderr a cada comando quando o arquivo não existe, e o `paths:` incluído esconderia o do `config.yaml`.
- **Guardar nas preferências do app.** O Soulbeet importa sem o app e não enxergaria a escolha do disco.

## Consequências

- A escolha do disco vale para todas as importações, do app ou do Soulbeet, sem reiniciar nada.
- Com o disco só por gênero, um artista que tenha `" - "` no próprio nome fica cortado ali na playlist do Rekordbox. Arquivos sem artista no caminho vão para a playlist `_Outras`.
- Um `config.yaml` editado antes desta versão continua com o `paths:` antigo, e a escolha do disco não tem efeito. O cartão avisa quando o `config.yaml` não usa o campo; o Rekordbox continua coerente, porque sai do caminho no disco.
- Reorganizar muda o lugar dos arquivos: as faixas que já estão na Coleção do Rekordbox aparecem como não encontradas até a pessoa apontar o lugar novo no Rekordbox. O cartão avisa antes.
