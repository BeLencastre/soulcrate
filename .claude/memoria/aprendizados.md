# Aprendizados do projeto

Memória durável do repositório: o que não é óbvio e vale para as próximas sessões. O CLAUDE.md carrega este arquivo, e o hook Stop pede para revisá-lo quando uma etapa mexe em código.

Formato: `- AAAA-MM-DD · o aprendizado. **Por quê:** o motivo ou a consequência.` Corrija ou apague o que ficar errado e consolide quando o arquivo passar de ~150 linhas. Não entra aqui o que o código, o git log ou o CONTRIBUTING já dizem, nem segredos.

## Decisões

- 2026-10-13 · A memória do repositório tem duas camadas: este arquivo (versionado e curado) e os resumos de sessão em `.claude/memoria/sessoes/` (locais, fora do git). **Por quê:** o que é compartilhado precisa de curadoria; o diário automático gera ruído e muda a cada sessão. Veja o [ADR 0001](../../docs/adr/0001-memoria-do-repositorio-e-mapa-de-dependencias.md).
- 2026-10-13 · O mapa de dependências é gerado, mas o motivo de cada uma é escrito à mão (`docs/dependencias.justificativas.json`). **Por quê:** a versão sai do manifesto, o porquê não; o CI recusa motivo `PENDENTE`.

## Armadilhas

- 2026-10-13 · O slskd responde HTTP 400 a uma busca sem nenhum termo com mais de 1 caractere (por exemplo, o artista `t e s t p r e s s`). Isso não é o slskd fora do ar. **Por quê:** tratar como queda fazia o lote repetir a busca 20 vezes e abortar (corrigido na stack 1.2.1).
- 2026-10-07 · A imagem final do Soulbeet é distroless: não tem shell, nem apt, nem pip usável no venv. **Por quê:** tudo precisa ser compilado em estágios Debian bookworm (mesma glibc 2.36) e instalado com `pip --prefix` enxergando o venv via `PYTHONPATH`.
- 2026-10-07 · A base do Soulbeet traz `httpx2`/`httpcore2` sem metadados de pacote, e o `lastgenre` não carrega sem eles. **Por quê:** o `soulbeet/fix-metadata.py` cria um dist-info mínimo; não remova sem testar o `lastgenre`.
- 2026-10-07 · No Git Bash, `docker exec <container> ls /music` vira um caminho do Windows (conversão do MSYS). **Por quê:** use `MSYS_NO_PATHCONV=1` antes dos comandos que passam caminhos Linux para o Docker.
- 2026-10-07 · `wsl.exe -l -v` sai em UTF-16LE. **Por quê:** sem converter (`iconv -f utf-16le -t utf-8`, ou ler como Unicode no app), a saída parece vazia ou com caracteres nulos.

## Comandos

- 2026-10-13 · Para regenerar e conferir o mapa de dependências: `node scripts/dependencias.mjs`, depois `--check`. Os testes dos scripts e dos hooks rodam com `node --test "scripts/*.test.mjs" ".claude/hooks/*.test.mjs"`.
- 2026-10-13 · Para simular um hook à mão: `printf '%s' '{"session_id":"x","tool_name":"Write","tool_input":{"file_path":"C:/caminho/arquivo"}}' | node .claude/hooks/memoria.mjs post-tool-use`. **Por quê:** no Git Bash, a barra invertida de caminho do Windows dentro do JSON chega estragada ao stdin, e o hook recebe um JSON inválido. Use barras normais.
- 2026-10-13 · Os hooks de `.claude/settings.json` passaram a valer na própria sessão em que foram criados, e o estado local mostra o que eles registraram (`.claude/memoria/.estado/<sessão>.json`). **Por quê:** ao mexer em `memoria.mjs`, um erro aparece já na sessão atual; confira o estado e rode os testes antes de commitar.

## Produto

- 2026-10-13 · Importação de playlist: pelo link público, o Spotify entrega no máximo 100 faixas, e a Amazon Music ficou de fora por não ter caminho gratuito. **Por quê:** essas limitações são do serviço, não bug do app.
