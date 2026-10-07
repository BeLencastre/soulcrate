# Changelog

Mudanças visíveis para quem usa o Soulcrate. Formato baseado no [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); versões da stack em [`VERSION`](VERSION).

## Não lançado

### Adicionado

- App desktop (Electron), Fases 0 e 1: janela com navegação lateral, tela Início com as cinco etapas do ambiente (Docker, Docker Desktop, configuração, stack e serviços), Ligar, Desligar e Reconstruir com log ao vivo, tela Serviços com as verificações do `status.bat` e os logs de cada contêiner, Web UIs do Soulbeet, slskd e Navidrome dentro do app, ícone na bandeja com o estado da stack e instalador do Windows (NSIS, sem assinatura). Veja [`app/README.md`](app/README.md).
- Download em lote: parâmetros para programas que controlam o lote, como o futuro app (`-Eventos`, `-ArquivoParada`, `-IdExecucao`, `-SoAnalisar`). Sem eles, nada muda. Veja [`docs/eventos-lote.md`](docs/eventos-lote.md).
- Download em lote: códigos de saída distintos (`0` concluído, `2` parado, `3` slskd fora, `4` configuração, `5` lista já rodando).
- Download em lote: a mesma lista não roda duas vezes ao mesmo tempo (trava em `lotes/estado-<lista>.lock`).
- `validar-config.ps1`: confere o `.env` e o `slskd.yml` antes de subir. Agora também acusa campos vazios, pasta inexistente e API key diferente nos dois arquivos, e avisa sobre OneDrive, discos diferentes e chaves curtas.
- Healthcheck nos três serviços (`docker compose ps` mostra `healthy`).
- Arquivo `VERSION` com a versão da stack.
- Testes automatizados (Pester e Vitest) e CI no GitHub Actions.

### Mudado

- **As interfaces web (Soulbeet, slskd e Navidrome) passam a abrir só neste PC** (`127.0.0.1`). Para usar de outro aparelho da rede, por exemplo um app Subsonic no celular com o Navidrome, ponha `BIND_ADDR=0.0.0.0` no `.env` e rode o `subir.bat`. A porta `2234` do Soulseek não muda.
- `subir.bat` usa o `validar-config.ps1` no lugar das checagens com `findstr`.

## 1.0.0

Primeira versão numerada da stack: slskd 0.26.0, Navidrome 0.64.2, Soulbeet (digest de 15/08/2026) com beets 2.11.0, keyfinder e autobpm, e o download em lote.
