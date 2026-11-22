# 0006. Versão da faixa (com a duração) e formato como regras obrigatórias, com o motivo da recusa separado por regra

- Status: Aceito
- Data: 2026-11-22

## Contexto

O DJ precisa da versão certa da faixa, não de qualquer arquivo com o mesmo título. Uma Extended Mix serve para a pista; uma Radio Edit, quase nunca.

Hoje o `baixar-lista.ps1` trata a versão assim (`Get-Request` e `Test-File`, em `baixar-lista.lib.ps1`):

- **Linha com mix** (`Título (Azyr Remix)`): o arquivo precisa trazer aquele mix; senão, a recusa é `mix diferente`.
- **Linha sem mix ou com `(Original Mix)`**: aceita Original, Extended e Club e recusa as palavras de `$VersionWords` (remix, edit, radio, dub, VIP…) que não estejam na linha (`outra versao ('radio')`).
- **Entre Original, Extended e Club não existe ordem.** Os três ganham o mesmo bônus, e a ordenação dos candidatos põe o formato (`Tier`) antes dele: um Original em FLAC ganha de um Extended em MP3 320.
- **Cada arquivo recebe um motivo só.** O `Test-File` para no primeiro teste que falha, e o formato é conferido por último. Um Radio Edit em MP3 128 aparece só como `outra versao ('radio')`, e ninguém fica sabendo que o formato também não servia.
- **A duração é quase ignorada.** O slskd informa a duração de cada arquivo (`length`, em segundos), mas o script só a usa para recusar prévias (menos de 90 s) e para estimar o bitrate. Uma duração escrita no fim da linha (`Título 6:58`, comum em listas copiadas de lojas) é apagada pelo `Clean-Line`. Um arquivo com o nome errado, como uma Radio Edit chamada "Original Mix", passa sem ninguém notar.

O formato já é uma regra obrigatória: o card **Qualidade** define o que entra (FLAC e WAV sempre; AIFF/AAC, MP3 320 e MP3 256/VBR por opção). A versão precisa virar uma regra do mesmo tipo, escolhida pelo usuário e conferida também pela duração, e o relatório precisa dizer qual das regras impediu o download.

## Decisão

### Duas regras obrigatórias

Um arquivo só pode ser baixado se, além de ser a faixa certa (título, artista e as demais conferências que já existem), ele cumprir **as duas regras ao mesmo tempo**:

1. **Regra do formato**: o formato está entre os aceitos no card Qualidade (sem mudança no que é aceito).
2. **Regra da versão**: a versão do arquivo está entre as aceitas no card novo **Versão da faixa** (ou é o mix que a própria linha pede) **e** a duração do arquivo é compatível com a versão (ver [Duração](#a-duração-parte-da-regra-da-versão)).

Nenhuma das duas é preferência. Se nenhum arquivo cumpre as duas, a faixa não é baixada, mesmo que exista um arquivo perfeito em uma delas.

### A regra da versão: o nome

- **Card Versão da faixa**, na aba Ajustes, entre Qualidade e Títulos. É uma lista ordenada em duas zonas: *Baixar, nesta ordem* (aceitas, da mais preferida para a menos) e *Não baixar*. A pessoa arrasta as versões entre posições e zonas. Cada linha também tem ↑ ↓ e um botão para trocar de zona, e o teclado funciona sem mouse (WCAG 2.2, critério 2.5.7): com o foco na alça, Espaço pega a linha, as setas a movem e Espaço a solta, e o leitor de tela anuncia a posição ("Club Mix, 2 de 4, aceita").
- **Versões do card:** Extended Mix, Club Mix, Original Mix, *Sem versão no nome* (`Artista - Título.flac`, sem parênteses) e Radio Edit.
- **Atalhos de um clique** reorganizam a lista, como as receitas que já existem: *Pista* (Extended → Club → Original e Sem versão no nome; Radio Edit recusada), *Tanto faz a versão* (todas aceitas) e *Só Extended*.
- **Padrão:** Extended → Club → Original e Sem versão no nome na mesma posição; Radio Edit em *Não baixar*. Original e Sem versão no nome dividem a posição porque o arquivo sem nome quase sempre é o original; separados, um FLAC sem parênteses perderia para um `(Original Mix)` em MP3.
- **A linha manda.** Quando a linha pede um mix (`(Azyr Remix)`, `(Extended Mix)`), a lista do card não vale para ela: o arquivo precisa ser aquele mix, como hoje. A duração continua valendo. `(Original Mix)` escrito na linha pede o original: com `-Versoes`, aceita só Original Mix e Sem versão no nome (na mesma posição), qualquer que seja o card.
- **O que não está no card continua como hoje.** Remix, dub, VIP, bootleg, live etc. (`$VersionWords`) só entram se estiverem na linha. Eles são de outra pessoa ou de outro momento, e não "a mesma faixa em outro tamanho".
- **Classificação pelo nome do arquivo** (texto entre parênteses ou colchetes, ou depois de `" - "`): `extended`, `extended mix` e `extended version` → Extended Mix; `club mix` → Club Mix; `original` e `original mix` → Original Mix; `radio edit`, `radio mix` e `radio version` → Radio Edit; nenhuma dessas → Sem versão no nome.

### A duração: parte da regra da versão

A duração confere se o arquivo é mesmo a versão que diz ser. Ela entra de duas formas, e uma falha em qualquer uma é uma falha **da regra da versão**.

**1. Duração de referência da linha.** A lista aceita uma duração por faixa, no fim da linha, solta ou entre parênteses ou colchetes:

```text
Creeds - Push Up (Extended Mix) 6:58
Azyr - No Escape [5:12]
```

- O `Clean-Line` deixa de apagar a duração: ela vira `Duration` (em segundos) no pedido.
- No `.csv`, a coluna de duração em milissegundos (a do Exportify; o nome exato é conferido com um arquivo real na implementação) vira a duração de referência. A faixa do Spotify já traz a versão no título ("Título - Extended Mix"), então a duração dela é a daquela versão.
- O arquivo passa se a duração dele estiver a até **5 s ou 2% da referência**, o que for maior (uma faixa de 7 min aceita ±8 s). A folga cobre silêncio no começo e no fim e codificações diferentes.
- Fora disso, a recusa é `duracao diferente (3:10, a linha pede 6:58)`.

**2. Duração mínima.** No pé do card, *Duração mínima*: desligada (padrão), 3, 4, 5 ou 6 min. Ela pega a Radio Edit com o nome errado. Vale para as linhas **sem** duração de referência (a referência é mais precisa e manda) e **sem mix pedido** (ou com `(Original Mix)`): quem pede `(Radio Edit)` na linha quer a versão curta. Abaixo do mínimo, a recusa é `curta para a versao (3:10, minimo 5:00)`. O card avisa que em alguns gêneros (hard techno, por exemplo) o Original tem de 4 a 5 min.

**Arquivo sem duração informada.** Muitos clientes do Soulseek mandam `length` zerado. Esse arquivo **não é recusado pela duração**, porque não há como saber. Na ordem dos candidatos, dentro da mesma posição de versão, o arquivo com a duração conferida vem antes do sem duração.

**A prévia de 90 s continua como está**: `curto demais (previa)` é um problema de identidade (não é a faixa), não da regra da versão.

**Na tela Lista**, a pré-visualização mostra a duração de referência ao lado de cada linha que tem uma, para a pessoa ver o que vai ser conferido. O `-SoAnalisar` ganha o campo `duration` (segundos) em cada linha.

### Parâmetros novos no script

- `-Versoes`: a lista do card, em ordem, com `+` juntando versões na mesma posição: `-Versoes "extended,club,original+semnome"`. Versão fora da lista é recusada. Com `-Versoes`, o script também lê a duração de referência da linha e do CSV.
- `-DuracaoMinima`: em segundos; `0` (padrão) desliga; de 0 a 3600. Funciona com ou sem `-Versoes`.
- Valor inválido (versão desconhecida ou repetida, duração fora do intervalo) sai com o código `4` (configuração), como os outros parâmetros.
- O `baixar-lista.bat` passa a repassar **todas** as opções depois da lista (antes, só até a oitava), e o valor com vírgula vai entre aspas (`-Versoes "extended,club,original+semnome"`), porque o `cmd` separa os argumentos também na vírgula. O comando equivalente da tela já sai assim.

### Avaliar as duas regras sem parar na primeira

O `Test-File` continua parando no primeiro problema de identidade (título diferente, outro artista, palavra a mais, prévia curta, bloqueado). Esses arquivos não são a faixa pedida e mantêm os motivos de hoje.

Para um arquivo que **é a faixa certa**, ele confere a versão (nome e duração) **e** o formato, sem parar no primeiro que falha, e devolve um destes motivos:

| Regra | Resultado do arquivo | Motivo no `reasons` (texto do script) |
| --- | --- | --- |
| Versão | Versão fora do card (linha sem mix) | `versao nao aceita ('radio edit')` |
| Versão | Palavra de versão fora do card, ausente da linha | `outra versao ('remix')` (como hoje) |
| Versão | Mix pedido na linha ausente | `mix diferente` (como hoje) |
| Versão | Fora da duração de referência | `duracao diferente (3:10, a linha pede 6:58)` |
| Versão | Abaixo da duração mínima | `curta para a versao (3:10, minimo 5:00)` |
| Formato | Formato não aceito | os textos de hoje: `mp3 320 kbps (use -AceitarMp3320)`, `formato aiff (use -AceitarAacAiff)`… |
| Ambas | Versão e formato falham | `versao e formato: <motivo da versão> + <motivo do formato>` |

Se o nome e a duração falham juntos, o motivo da versão é o do nome (é o que a pessoa muda primeiro).

### O veredito da faixa

Quando a faixa termina como `nao encontrada`, o script olha só os arquivos que eram a faixa certa e decide, nesta ordem:

1. Nenhum arquivo era a faixa certa → **outro motivo**: os que já existem (`titulo diferente`, `0 respostas`, `artista nao aparece`…). Nada muda.
2. Todos falharam só na versão (nome ou duração) → **versão**.
3. Todos falharam só no formato → **formato**.
4. Qualquer outra combinação → **versão e formato**: arquivos que falham nas duas, ou alguns só na versão e outros só no formato (por exemplo, um Extended em MP3 320 e um Radio Edit em FLAC).

Quando a faixa tinha candidato e falhou depois (fila, tempo, erro do usuário, não enfileirou), o motivo continua sendo o de hoje: as duas regras foram cumpridas.

O veredito vai num campo novo e opcional do `item.diagnostic`, `rejectedBy`, com um destes valores: `versao`, `formato`, `versao-e-formato`. Ele não aparece quando o motivo é outro. O `item.diagnostic` também ganha `duration` (a referência da linha, em segundos), quando houver. São campos a mais, então `v` continua `1`: o app de hoje lê o evento sem eles, e o app novo lê lotes antigos sem eles (cai no motivo de sempre). O `docs/eventos-lote.md`, os tipos em `app/src/shared/` e as fixtures mudam juntos.

### Como o app mostra

O `motivos.ts` ganha os tipos `versaoNaoAceita`, `duracaoDiferente`, `duracaoCurta` e `versaoEFormato`, e o veredito vira a primeira linha do motivo da faixa, com a ação que resolve:

- **Versão (nome):** "Só achei Radio Edit. Para aceitar, leve Radio Edit para *Baixar* no card Versão da faixa."
- **Versão (duração de referência):** "Achei a faixa, mas com 3:10, e a linha pede 6:58. Confira a duração na lista ou apague-a para aceitar qualquer duração."
- **Versão (duração mínima):** "Só achei versões com menos de 5 min. Diminua a duração mínima no card Versão da faixa."
- **Formato:** o texto de hoje do formato ("Só achei MP3 320. Marque Aceitar MP3 320 em Qualidade.").
- **Versão e formato:** "Achei Extended em MP3 320 e Radio Edit em FLAC. Nenhum cumpre as duas regras: aceite MP3 320 em Qualidade ou Radio Edit em Versão da faixa." O botão de sugestão só liga a opção quando uma troca resolve; se forem precisas as duas, a tela diz isso e não muda nada sozinha.

O card é o mesmo nos dois modos (os textos dele, em `msg.lote.versoes`, não citam parâmetros); o Modo Dev mostra também `-Versoes` e `-DuracaoMinima` no card e no "Equivale a rodar". No Modo DJ, o resumo da aba Ajustes ganha a linha `Versão: Extended → Club → Original e sem nome · mínimo 5 min` (texto em `mensagens-dj.ts`).

**Tentar de novo.** As opções sugeridas pelos motivos se somam às da execução, como hoje: `versao nao aceita ('radio edit')` junta a Radio Edit ao fim do card (uma troca resolve); `curta para a versao` desliga a duração mínima; `versao e formato` não liga nada sozinho. Um lote antigo, que rodou sem o card, é tentado de novo com o card padrão.

### A ordem entre os arquivos que cumprem as duas regras

A versão vem antes do formato. A ordem completa fica:

1. título exato antes do aproximado;
2. usuário que travou 2 vezes ou mais por último;
3. **posição da versão no card**;
4. **duração conferida antes de duração não informada**;
5. formato (`Tier`);
6. falhas do usuário; slot livre; fila; velocidade (como hoje).

Com isso, as descrições do card Qualidade mudam ("Só quando a faixa não existe nos formatos acima" deixa de ser verdade) para algo como "Formatos que você aceita. Entre duas versões iguais, o melhor formato ganha."

### Compatibilidade

- **Sem `-Versoes` e sem `-DuracaoMinima`, o script se comporta como hoje:** versão pelas palavras de `$VersionWords`, sem ordem entre Original, Extended e Club, formato antes do bônus, e a duração no fim da linha ignorada. Comandos, rascunhos e o `.bat` antigos não mudam.
- O veredito e o motivo `versao e formato` valem com ou sem os parâmetros, porque só descrevem melhor o que já acontece. O texto dos motivos que já existiam não muda, para os lotes antigos continuarem legíveis no histórico.
- O app sempre passa `-Versoes` com o que está no card (rascunhos antigos, sem o card, ganham o padrão). Para quem nunca abriu o card, há três mudanças no que é baixado: Extended passa a ganhar de Original, `(Original Mix)` na linha deixa de aceitar a Extended, e **listas que já tinham duração no fim da linha passam a ser conferidas por ela**. A pré-visualização da Lista mostra essas durações ao lado da versão antes de começar, e o CHANGELOG avisa.
- A duração sai da linha como antes (`Clean-Line`): a chave da faixa no estado e nos relatórios não muda, e as execuções anteriores da mesma lista continuam reconhecidas.

## Alternativas consideradas

- **A versão como preferência, não como regra.** Baixaria um Radio Edit quando não houvesse Extended. Foi recusada: o DJ precisa saber que a faixa não veio na versão certa, não descobrir na pista.
- **O formato antes da versão na ordem.** É o comportamento de hoje. Os formatos aceitos já são todos aceitáveis para quem marcou a opção, e a versão é o que o DJ não consegue consertar depois.
- **Manter um motivo por arquivo, parando no primeiro teste.** Exigiria menos mudança, mas não diferencia "só tinha a versão errada" de "tinha a versão errada e o formato errado", e a pessoa trocaria uma opção sem resolver nada.
- **Um veredito por maioria** (a regra que mais recusou). Esconde o caso em que trocar uma opção não basta.
- **A duração como terceira regra, com veredito próprio.** Deixaria o relatório com sete combinações (versão, duração, formato e os pares). A duração só existe para confirmar a versão, então ela fica dentro da regra da versão, e o motivo detalhado diz se foi o nome ou a duração.
- **Recusar o arquivo sem duração informada** quando a linha tem referência. Recusaria boa parte dos arquivos do Soulseek; ele passa, mas fica atrás dos conferidos.
- **Inferir a versão pela duração** (um arquivo sem nome de 7 min conta como Extended). A duração de cada versão muda muito de um gênero para outro. Fica para depois, se o relatório dos lotes mostrar que acertaria.
- **A duração do MusicBrainz como referência**, pela conferência do catálogo. A gravação do MusicBrainz quase nunca diz de qual versão é a duração.
- **Remix, dub e VIP no card.** São versões de outras pessoas e mudam a faixa; continuam pedidas pela linha.
- **Tolerância da duração ajustável no card.** Mais uma opção para quase ninguém mexer. Começa fixa (5 s ou 2%); vira opção se aparecer caso real.

## Consequências

- O relatório de cada faixa não encontrada diz qual regra impediu o download, e a sugestão do app resolve de verdade.
- Arquivos com o nome de uma versão e a duração de outra deixam de passar quando há referência ou mínimo.
- Quem aceita só Extended, ou põe duração na lista, vai ver mais faixas `nao encontrada`. É a escolha feita, e o motivo diz o que existia.
- A classificação da versão pelo nome do arquivo é heurística. Os casos ficam nos testes de Pester com nomes reais do Soulseek, e um nome que não se encaixa em nenhuma versão do card conta como *Sem versão no nome*.
- Mudam juntos:
  - **Script:** `baixar-lista.lib.ps1` (`Clean-Line` lendo a duração, leitura da duração do CSV, classificação da versão, `Test-File` avaliando as duas regras, ordenação, veredito) e `baixar-lista.ps1` (`-Versoes`, `-DuracaoMinima`, `rejectedBy` e `duration` nos eventos e no `-SoAnalisar`).
  - **Contratos:** `docs/eventos-lote.md`, os tipos em `app/src/shared/` e as fixtures (`Gerar-Fixtures.ps1`).
  - **App:** `opcoes-lote.ts` (as opções, o padrão e os atalhos), `motivos.ts`, `mensagens.ts` e `mensagens-dj.ts`, o card na aba Ajustes, a duração na pré-visualização da Lista e o resumo.
  - **Documentação:** o formato da lista (a duração opcional), a tabela "Decida pelo motivo" e a seção de opções do README, e as capturas da aba Ajustes e da Lista.
  - **Testes:** Pester (unitários de versão, duração e veredito; integração com o slskd falso), Vitest (`motivos.test.ts`, `opcoes-lote.test.ts`, o card) e um e2e do card com axe.
- O script ganha parâmetros, então a stack muda de versão (minor). A mudança entra na stack 1.3.0, que ainda não foi lançada; o CHANGELOG registra em "Não lançado", com o aviso sobre listas que já tinham duração.
