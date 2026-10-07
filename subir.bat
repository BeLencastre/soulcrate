@echo off
REM Sobe a stack slskd + Soulbeet + Navidrome (Docker Desktop precisa estar aberto)
cd /d "%~dp0"
if not exist .env (
  copy /Y .env.example .env >nul
  echo [ok] .env criado a partir de .env.example
)
if not exist slskd\slskd.yml (
  copy /Y slskd\slskd.example.yml slskd\slskd.yml >nul
  echo [ok] slskd\slskd.yml criado a partir de slskd\slskd.example.yml
)
REM Recusa subir com os valores de exemplo (senhas e chaves conhecidas)
findstr /R /C:"PREENCHA_" /C:"=seu_usuario_soulseek" /C:"=sua_senha_soulseek" /C:"=troque-" .env >nul && (
  echo [!] O .env ainda tem valores de exemplo. Preencha a conta Soulseek, a senha da Web UI e as chaves.
  notepad .env
  pause
  exit /b 1
)
findstr /C:"TROQUE_POR_UMA_CHAVE_ALEATORIA" slskd\slskd.yml >nul && (
  echo [!] Troque a API key de exemplo em slskd\slskd.yml pela mesma chave de SLSKD_API_KEY_SOULBEET do .env.
  notepad slskd\slskd.yml
  pause
  exit /b 1
)
docker info >nul 2>&1 || (
  echo [!] Docker Desktop nao esta rodando. Abra o Docker Desktop e tente de novo.
  pause
  exit /b 1
)
echo Construindo imagem do Soulbeet (1a vez leva alguns minutos)...
set BUILDKIT_PROGRESS=plain
docker compose up -d --build || (pause & exit /b 1)
docker compose ps
echo.
echo Abrindo as interfaces...
start "" http://localhost:4533
start "" http://localhost:5030
start "" http://localhost:9765
pause
