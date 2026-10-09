# Roteiro de teste manual (antes de cada release)

> Complementa os testes automáticos ([§7 da especificação](interface-electron.md#7-estratégia-de-testes)). Os testes automáticos usam dublês do Docker e um slskd falso; este roteiro confere o que só se vê com **a stack de verdade, a rede Soulseek e um Windows de verdade**. Rode antes de publicar a release (passo 4 de [`distribuicao.md`](distribuicao.md#7-publicar-uma-versão)) e anote o resultado no [registro](#registro-de-execuções).

**Quanto tempo leva:** de 2 a 3 horas na primeira vez (a primeira subida da stack leva de 5 a 10 minutos, e o lote real de 10 a 30 faixas depende da rede).

**Regra:** qualquer falha em **A** a **H** bloqueia a release. As demais viram issue, e a release sai se não forem graves.

## Preparação

- Um Windows 11 e, se possível, um Windows 10, **sem** o Soulcrate instalado e sem a pasta `%USERPROFILE%\Soulcrate` (use uma máquina virtual ou um usuário novo). `testar-instalador.ps1` recusa-se a rodar se achar uma instalação anterior.
- O instalador do **rascunho** da release (ou `npm run dist` em `app/`) e o `SHA256SUMS.txt`
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) com WSL 2 (instalado, mas você vai fechá-lo em alguns passos).
- Uma conta no Soulseek e uma lista de 10 a 30 faixas de house/techno, **incluindo**: uma com mix no nome (`(Extended Mix)`), uma com remix (`(Fulano Remix)`), uma com título errado de propósito e uma que já está na biblioteca de teste.
- Um segundo disco ou pendrive (para o caso de discos diferentes).

## Cenários

### A. Instalar

- [ ] O SHA-256 do `.exe` confere com o `SHA256SUMS.txt`.
- [ ] O SmartScreen aparece, e **Mais informações → Executar assim mesmo** instala sem pedir senha de administrador.
- [ ] O atalho "Soulcrate" está no menu Iniciar (e não na área de trabalho), e o app abre no fim.
- [ ] O app aparece em Configurações do Windows → Aplicativos.

### B. Docker

- [ ] **Sem Docker Desktop instalado** (se der para testar numa VM): o Início explica e leva ao download. Nada trava.
- [ ] **Docker Desktop fechado:** o Início diz que está fechado, e o botão o abre. A etapa muda sozinha quando a engine fica pronta.
- [ ] **Docker no ar:** o Início segue para "Configurar".

### C. Assistente e primeira subida

- [ ] O assistente aceita uma pasta do Soulcrate **com espaço e acento** (ex.: `C:\DJ Soulcrate\Músicas do Zé`).
- [ ] Com biblioteca e downloads em **discos diferentes**, o assistente **avisa**.
- [ ] Com a biblioteca num **disco externo** ou pendrive, a conferência de espaço e gravação passa.
- [ ] Ao final, o `.env` e o `slskd/slskd.yml` existem, com **a mesma API key**, e os backups (`.env.bak-<data>`) só aparecem se já havia arquivos.
- [ ] A **primeira subida** (build do Soulbeet, 5 a 10 minutos) mostra o log ao vivo e termina com **3/3 saudáveis**.
- [ ] O administrador do Navidrome foi criado, o Soulbeet entra com o mesmo usuário e a pasta `/music` já está lá, **sem abrir nenhuma interface web**.
- [ ] A porta 2234 aparece como conferida (ou com o aviso do redirecionamento no roteador).
- [ ] **Fechar o app durante o build** não derruba a stack: ao reabrir, o Início mostra o estado real.
- [ ] **Fechar o app durante a gravação da configuração** (Configurações → Aplicar e reiniciar) não deixa o `.env` pela metade (se deixasse, a conferência avisaria).

### D. Download em lote real

- [ ] Em **Baixar lista**, colar a lista mostra a pré-visualização (repetidas, "já na biblioteca", linhas com problema).
- [ ] Importar um `.csv` do Spotify (botão e arrastar para a janela) funciona.
- [ ] O lote roda até o fim. O painel mostra progresso, contadores e a tabela por faixa; a notificação do Windows aparece ao terminar.
- [ ] As faixas aparecem em `music/<Gênero>/<Artista>/`, com **BPM, tom e capa**, e o "(Extended Mix)" **não se perdeu**.
- [ ] O Rekordbox, com a pasta `music` monitorada, enxerga as faixas novas, e o tom e o BPM aparecem.
- [ ] A faixa com título errado cai no **Histórico → diagnóstico** com o motivo certo; o "talvez seja" corrige a linha com um clique, e **Tentar de novo** baixa a faixa.
- [ ] **Parar** no meio gera o `resultado-*.txt` e o `nao-baixadas-*.txt`, e rodar de novo continua de onde parou.
- [ ] **Fechar o app no meio de um lote:** o lote continua (confira em Serviços → slskd), e o painel volta de onde estava ao reabrir.
- [ ] **Suspender o PC** durante um lote e retomar: o lote segue (ou termina com a explicação no resultado), sem travar o app.
- [ ] Rodar a **mesma lista** pelo `baixar-lista.bat` enquanto o app a executa é **recusado** com a mensagem clara (código de saída 5).
- [ ] Uma lista rodada pelo `.bat` aparece no Histórico do app.

### E. Biblioteca e manutenção

- [ ] A tela Biblioteca lista as faixas do lote com BPM, tom, gênero e formato; os indicadores (sem BPM, sem tom, `_Sem Genero`, parados) batem com a realidade.
- [ ] **Remover** mostra tudo o que o filtro pega, pede confirmação e **só então** apaga (conferir que o arquivo sumiu do disco).
- [ ] Com um lote rodando, as operações que escrevem na biblioteca ficam bloqueadas ("Há um lote rodando").
- [ ] Sincronizar com o disco e Reorganizar pastas mostram a pré-visualização antes de rodar.
- [ ] Recalcular tom e BPM e Importar o que sobrou em `downloads/` rodam com a saída ao vivo.

### F. Migração de um clone do Git

- [ ] Num clone com `.env` e `slskd.yml` já configurados, escolher **"usar uma pasta que já existe"** não copia nada, não altera o `.env` e mostra a configuração conferida.
- [ ] Com um arquivo da stack editado no clone (ex.: `soulbeet/config/config.yaml`), o assistente **avisa qual** antes de seguir.
- [ ] Depois, o `subir.bat` e o `baixar-lista.bat` continuam funcionando na mesma pasta.

### G. Atualização

- [ ] Com a release **1.0.0 já publicada**, publique uma segunda (por exemplo `1.0.1`, só com uma mudança mínima), instale a 1.0.0 e confira que o app **acha, baixa e aplica** a atualização ao reiniciar. Este é o único teste que precisa do GitHub Releases de verdade.
- [ ] Com um **lote em andamento**, o botão "Reiniciar e atualizar" fica desligado ("a atualização espera ele terminar"), e sair do app não instala nada.
- [ ] Se a nova versão traz arquivos da stack diferentes: o que você **não** editou é trocado, o que você **editou** fica como está e ganha um `.novo` ao lado, com um aviso só uma vez; o Início oferece **Reconstruir a stack** quando o compose ou o Soulbeet mudaram.
- [ ] `.env`, listas, `lotes/` e biblioteca ficam **idênticos** (compare antes e depois).

### H. Desinstalar

- [ ] A pergunta do desinstalador é sobre os **dados do app** (padrão: manter), e **não** oferece apagar a pasta do Soulcrate.
- [ ] Depois de desinstalar, a pasta do Soulcrate e a biblioteca estão intactas, e os `.bat` ainda funcionam.
- [ ] A stack (contêineres) continua no ar; **Desligar** antes de desinstalar a derruba (ou `parar.bat`).

### I. Demais verificações

- [ ] **Pacote de suporte:** abra o `.zip` e procure (Ctrl+F no texto) a senha do Soulseek, a senha da Web UI do slskd e a API key. **Não pode haver nenhuma.** O `.env` e o `slskd.yml` não estão no pacote.
- [ ] **Bandeja:** o ícone muda de cor conforme o estado; fechar a janela minimiza para a bandeja (se a preferência estiver ligada); **Sair** encerra o app sem derrubar a stack nem o lote.
- [ ] **Iniciar com o Windows** abre minimizado na bandeja depois de reiniciar o PC.
- [ ] **Tema** escuro, claro e "igual ao Windows" valem para o app e para as Web UIs integradas.
- [ ] **Teclado:** do primeiro Tab ("Pular para o conteúdo") até o fim de cada tela, sem armadilha de foco.
- [ ] **Web UIs:** Soulbeet, slskd e Navidrome abrem dentro do app, o login persiste ao reabrir, e o botão ao lado abre no navegador.
- [ ] Com `BIND_ADDR=0.0.0.0`, o Navidrome abre de outro aparelho da rede; sem a variável, **só neste PC**.

## O que os testes automáticos já cobrem

Para não repetir à mão o que o CI faz a cada push (`.github/workflows/ci.yml`):

| Item | Onde |
| --- | --- |
| Instalar → atualizar por cima → desinstalar, com os instaladores de verdade, sem perder a pasta do Soulcrate nem os dados do app | Job `instalador`: `app/scripts/testar-instalador.ps1` |
| O app instalado abre, o preload e o IPC respondem (`--smoke-test`) | Job `instalador` |
| Assistente, ligar/desligar/reconstruir, lote de 30 faixas com o PowerShell e o `baixar-lista.ps1` de verdade contra um slskd falso, histórico, diagnóstico, biblioteca com um "beets" falso | `app/tests/e2e/` |
| Acessibilidade (axe-core, WCAG 2.1 AA) em todas as telas, nos dois temas, e navegação por teclado | `app/tests/e2e/acessibilidade.spec.ts` |
| Atualização do app e dos arquivos da stack (contra um `electron-updater` de mentira) | `app/tests/main/` e `app/tests/e2e/fase-6-7.spec.ts` |
| Segredos fora do pacote de suporte, do renderer e dos logs | `app/tests/main/` |
| O script do lote: leitura da lista, filtros, relatórios, parada segura, trava e códigos de saída | `tests/` (Pester, no PowerShell 5.1 e no 7) |

## Registro de execuções

Preencha uma linha por rodada. Em falha, abra uma issue e ponha o número aqui.

| Data | Versão (app / stack) | Windows | Quem rodou | Resultado | Issues |
| --- | --- | --- | --- | --- | --- |
| | | | | | |
