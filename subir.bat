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
REM Confere o .env e o slskd.yml: valores de exemplo, campos vazios, pastas, chaves iguais
REM (regras em docs\validacao-configuracao.md). Avisos aparecem, mas nao impedem de subir.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0validar-config.ps1"
if errorlevel 2 (
  echo.
  echo [!] Corrija o slskd\slskd.yml: a API key precisa ser a mesma de SLSKD_API_KEY_SOULBEET do .env.
  notepad slskd\slskd.yml
  pause
  exit /b 1
)
if errorlevel 1 (
  echo.
  echo [!] Corrija o .env e rode o subir.bat de novo.
  notepad .env
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
