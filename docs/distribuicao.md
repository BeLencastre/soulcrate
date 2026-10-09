# Distribuição do app: instalar, atualizar, desinstalar e publicar

> Referência da Fase 7 de [`interface-electron.md`](interface-electron.md). Para quem **instala** o app (seções 1 a 5) e para quem **publica** uma versão (seções 6 a 8).

## Sumário

1. [Instalar e o aviso do SmartScreen](#1-instalar-e-o-aviso-do-smartscreen)
2. [Onde ficam as coisas](#2-onde-ficam-as-coisas)
3. [Atualização do app](#3-atualização-do-app)
4. [Atualização dos arquivos da stack](#4-atualização-dos-arquivos-da-stack)
5. [Desinstalar](#5-desinstalar)
6. [Migrar de um clone do Git](#6-migrar-de-um-clone-do-git)
7. [Publicar uma versão](#7-publicar-uma-versão)
8. [Assinatura de código](#8-assinatura-de-código)

---

## 1. Instalar e o aviso do SmartScreen

1. Baixe `Soulcrate-Setup-<versão>.exe` na página de [Releases](https://github.com/BeLencastre/soulcrate/releases).
2. (Opcional, recomendado) Confira o arquivo contra o `SHA256SUMS.txt` da mesma release:

   ```powershell
   (Get-FileHash .\Soulcrate-Setup-1.0.0.exe -Algorithm SHA256).Hash.ToLower()
   ```

   O resultado tem que ser igual ao da linha do arquivo em `SHA256SUMS.txt`.

3. Dê dois cliques no instalador. A instalação é **por usuário** (não pede senha de administrador), cria um atalho no menu Iniciar e abre o app no fim.

O instalador **ainda não é assinado** (decisão [D3](interface-electron.md#10-decisões-em-aberto): sem certificado no beta). Por isso o Windows mostra o SmartScreen na primeira vez:

> **O Windows protegeu seu computador** · O Microsoft Defender SmartScreen impediu a inicialização de um aplicativo não reconhecido.

Isso é o esperado para um instalador sem assinatura (e com poucos downloads). Para continuar:

1. Clique em **Mais informações**.
2. Clique em **Executar assim mesmo**.

Só faça isso com um instalador baixado da página de Releases deste repositório, depois de conferir o SHA-256. Se baixou de outro lugar, não execute.

O app precisa do [Docker Desktop](https://www.docker.com/products/docker-desktop/) (com WSL 2) para a stack. Ele **não** instala o Docker por você: se faltar, o Início explica e leva ao download.

## 2. Onde ficam as coisas

| O quê | Onde | Quem mexe |
| --- | --- | --- |
| O app (programa) | `%LOCALAPPDATA%\Programs\Soulcrate` | instalador e atualizações |
| Preferências e logs do app | `%APPDATA%\Soulcrate` (`settings.json`, `logs\main.log`) | o app |
| A **pasta do Soulcrate** | a que você escolheu no assistente (padrão `%USERPROFILE%\Soulcrate`) | você e o app |

A pasta do Soulcrate tem a mesma estrutura de sempre (`.env`, `slskd/slskd.yml`, `lista*.txt`, `lotes/`, `music/`, `downloads/`…), então os `.bat` continuam funcionando nela. **Nem o instalador, nem uma atualização, nem o desinstalador apagam nada do que é seu** nela.

## 3. Atualização do app

- O app procura atualização **alguns segundos depois de abrir** e **a cada 24 horas**, nos GitHub Releases deste repositório. É a única conversa do app com a internet (sem telemetria).
- A atualização é baixada em segundo plano e **aplicada quando o app reinicia**: no Início aparece "A versão X está pronta" com **Reiniciar e atualizar**, e em Configurações → Sobre dá para **Procurar atualização** na hora.
- **Nunca durante um lote.** Com um lote rodando, o botão fica desligado ("a atualização espera ele terminar"), e ao sair do app o instalador só entra se nenhum lote estiver rodando. Fechar a janela não mexe no lote, e a atualização também não.
- Só vale **release publicada** (rascunhos e pré-lançamentos são ignorados).
- A atualização refaz a instalação por cima (o mesmo caminho de rodar o instalador novo): preferências, `.env`, listas, `lotes/` e biblioteca ficam como estavam.

Em desenvolvimento (`npm run dev`) e num app aberto sem o instalador não há atualização automática, e a tela diz isso.

## 4. Atualização dos arquivos da stack

Uma versão nova do app pode trazer versões novas do `docker-compose.yml`, dos scripts, do `Dockerfile` do Soulbeet e da configuração do beets. Na primeira vez que o app novo abre, ele os atualiza na pasta do Soulcrate, seguindo a §3.3 da especificação:

| Situação do arquivo na sua pasta | O que o app faz |
| --- | --- |
| Igual ao que o app instalou antes (você não o editou) | **Substitui** pelo novo |
| Você o **editou** (ou o app não sabe de onde veio) | **Mantém o seu** e grava o novo ao lado, como `<arquivo>.novo` (por exemplo `config.yaml.novo`). Avisa uma vez. |
| Não existe | Copia |
| Já é igual ao novo | Nada |

- O app guarda o que instalou em `.soulcrate/manifesto.json` (hashes SHA-256). Sem esse arquivo (uma pasta que o app só adotou) ele **não atualiza nada**.
- Nunca toca em `.env`, `slskd/slskd.yml`, listas, `lotes/`, `music/`, `downloads/`, `navidrome/`, `soulbeet/data/`.
- Espera: não atualiza com um lote rodando nem no meio de ligar, desligar ou reconstruir a stack. Quando um lote termina, tenta de novo. Também há **Atualizar agora** em Configurações → Sobre.
- Se o compose ou a imagem do Soulbeet mudaram, o aviso no Início oferece **Reconstruir a stack**: a mudança só vale depois disso.
- Para juntar suas edições com a versão nova, compare o arquivo com o `.novo` e apague o `.novo` quando terminar.

## 5. Desinstalar

Configurações do Windows → Aplicativos → Soulcrate → Desinstalar.

- **A pasta do Soulcrate nunca é apagada** (decisão [D17](interface-electron.md#10-decisões-em-aberto)): ela tem o `.env`, as listas, os relatórios e a biblioteca, pode estar em outro disco, e o desinstalador não tem como saber o que mais mora ali.
- O desinstalador pergunta se **também** remove as preferências e os logs do app (`%APPDATA%\Soulcrate`). O padrão é **Não** (manter).
- Desinstalação silenciosa (`/S`) não pergunta nem apaga nada; `--delete-app-data` pede para remover a pasta de dados do app.
- A stack (contêineres e imagens do Docker) **não** é desligada nem removida: use **Desligar** no app (ou `parar.bat`) antes de desinstalar, e `docker compose down --rmi all` se quiser remover as imagens.

## 6. Migrar de um clone do Git

Quem já usa o Soulcrate por um clone escolhe, no assistente, **"usar uma pasta do Soulcrate que já existe"**:

- O app **não copia nada** para ela e **não a atualiza** (quem atualiza é o `git pull`).
- Se a pasta é um clone e os arquivos da stack têm **alterações locais** (`git diff` contra o `HEAD`), o assistente avisa quais são, porque um `git pull` pode esbarrar nelas. Sem o git instalado, o aviso compara com os arquivos que o app traz (pode ser só uma versão diferente).
- `.env` e `slskd.yml` existentes são lidos e conferidos como sempre; nada é sobrescrito.
- Dá para voltar a usar só os `.bat` a qualquer momento: o estado (`lotes/estado-*.tsv`, `.env`) é o mesmo.

## 7. Publicar uma versão

O fluxo está em [`.github/workflows/release.yml`](../.github/workflows/release.yml).

1. Ajuste `"version"` em `app/package.json` (SemVer) e atualize o [`CHANGELOG.md`](../CHANGELOG.md). Faça o commit na `main`.
2. Crie e envie a tag **com o mesmo número**, precedido de `v`:

   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

3. O workflow roda `npm run check`, os testes ponta a ponta, gera o instalador e cria um **rascunho** de release com `Soulcrate-Setup-<versão>.exe`, o `.blockmap`, o `latest.yml` (que o `electron-updater` lê) e o `SHA256SUMS.txt`.
4. Instale o rascunho num Windows de teste, confira as notas (em português, voltadas ao usuário) e **publique** a release. Só então os apps instalados enxergam a atualização.

Antes de cada release, rode também o roteiro manual: [`roteiro-manual.md`](roteiro-manual.md) (a matriz da [§7](interface-electron.md#7-estratégia-de-testes) da especificação, em forma de checklist).

**Checklist da primeira release (1.0.0):**

1. O pull request com a versão (`app/package.json` em `1.0.0`, `VERSION` em `1.1.0`, `CHANGELOG.md`) passou no CI e entrou na `main`.
2. O CI da `main` está verde (jobs de scripts, do app e do instalador).
3. `git tag v1.0.0 && git push origin v1.0.0`. O workflow gera o **rascunho** da release.
4. Baixe o `.exe` do rascunho, confira o SHA-256 e rode o [roteiro manual](roteiro-manual.md) numa máquina de teste. Anote o resultado no registro do roteiro.
5. Revise as notas da release (cole a seção "App 1.0.0" do `CHANGELOG.md`) e **publique**.
6. Depois de publicada, no `README.md`: troque o aviso "Ainda não há release publicada" por um link direto para a release, tire a frase "ainda não foi publicada" do bloco **Status** e confira o link de [Releases](https://github.com/BeLencastre/soulcrate/releases).
7. Para testar a atualização de verdade (cenário G do roteiro), publique uma segunda versão (`1.0.1`) com uma mudança mínima.

**Testar o ciclo instalar → atualizar → desinstalar** (critério de aceite da Fase 7), o que o CI faz a cada push:

```powershell
cd app
npm run dist
npx electron-builder --win nsis --publish never '-c.extraMetadata.version=0.0.1' '-c.directories.output=dist-anterior' '-c.nsis.runAfterFinish=false'
npx electron-builder --win nsis --publish never '-c.directories.output=dist-teste' '-c.nsis.runAfterFinish=false'
./scripts/testar-instalador.ps1 -Anterior dist-anterior/Soulcrate-Setup-0.0.1.exe -Atual dist-teste/Soulcrate-Setup-<versão>.exe -VersaoAnterior 0.0.1 -VersaoAtual <versão>
```

O script **instala e desinstala o Soulcrate no seu usuário** (e recusa se achar uma instalação anterior): use numa máquina de teste. `-TestarApagarDados` também testa o `--delete-app-data` e apaga `%APPDATA%\Soulcrate`: só em máquina descartável (o CI).

Canal beta (`allowPrerelease`) e a política de versões do Electron estão na [§8](interface-electron.md#8-depois-lançamento-e-manutenção).

## 8. Assinatura de código

Sem certificado (decisão D3), o instalador sai sem assinatura e o SmartScreen avisa (seção 1). Para assinar quando houver certificado:

1. Cadastre `CSC_LINK` (o `.pfx` em base64 ou uma URL) e `CSC_KEY_PASSWORD` como *secrets* do repositório. O `release.yml` já os repassa ao `electron-builder`.
2. Em `app/electron-builder.yml`, tire `signExecutable: false` e acrescente `publisherName` com o nome exato do certificado: o `electron-updater` passa a conferir a assinatura de cada atualização.
3. Um certificado EV (ou o Azure Trusted Signing) elimina o aviso do SmartScreen desde o primeiro download; um OV comum só o elimina depois que o instalador ganha reputação.
