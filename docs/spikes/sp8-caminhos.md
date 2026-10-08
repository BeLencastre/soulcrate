# SP8: caminhos de pasta no `.env`

**Pergunta.** Caminhos com espaço, acento, no OneDrive ou em disco externo funcionam como pastas da stack no Docker Desktop? Quais o app deve bloquear ou avisar?

## O que foi testado

- **Espaço e acento:** uma pasta `…\pasta com espaço e acentuação` com o arquivo `música ção.txt`, montada com `docker run -v "<caminho>:/x"` na imagem do Navidrome: listada corretamente dentro do contêiner, com o nome do arquivo intacto. O [SP3](sp3-processo-destacado.md) também rodou numa pasta com espaço.
- **Barras:** o compose aceita `D:/DJ/Music` (o que o README pede). Barra invertida não foi exercitada com o compose; virou aviso do validador.
- **Pasta inexistente:** com a sintaxe longa de bind (`type: bind`, usada no compose do Soulcrate), o Docker não cria a pasta de origem. Virou erro do validador.

Não testado aqui (sem disco externo nem OneDrive sincronizando na máquina de teste): disco externo desconectado durante o uso, e o OneDrive com "Arquivos sob demanda".

## Conclusões

Viraram regras do [`validar-config.ps1`](../../validar-config.ps1) ([regras](../validacao-configuracao.md)):

| Situação | Decisão |
| --- | --- |
| Espaço, acento | Permitido |
| Pasta inexistente | **Erro** (`PASTA_INEXISTENTE`); o assistente do app deve oferecer criar |
| Barra invertida | Aviso (`PASTA_BARRA_INVERTIDA`); o assistente grava sempre com `/` |
| Dentro do OneDrive | Aviso (`PASTA_ONEDRIVE`): a sincronização pode travar arquivos no meio do download, e arquivos "sob demanda" não estão no disco |
| `DOWNLOADS_DIR` e `MUSIC_DIR` em discos diferentes | Aviso (`PASTAS_DISCOS_DIFERENTES`) |

## A acompanhar na Fase 2

- Disco externo: avisar no assistente que a stack não deve subir com o disco desconectado (o Docker criaria um bind para uma pasta vazia ou falharia).
- Medir se o "mover" do beets entre `/downloads` e `/music` é de fato instantâneo no Docker Desktop. São dois binds diferentes, mesmo no mesmo disco, e o README afirma que é instantâneo.
