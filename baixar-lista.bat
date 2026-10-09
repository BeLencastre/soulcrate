@echo off
REM Download em lote. Uso:
REM   baixar-lista.bat                      -> usa lista.txt
REM   baixar-lista.bat minhas.txt           -> outra lista (.txt ou .csv do Spotify/Exportify)
REM   arraste um .txt/.csv em cima deste arquivo
REM   baixar-lista.bat lista.txt -Paralelo 6 -Retentar -AceitarAacAiff
cd /d "%~dp0"
title Download em lote - Soulcrate
set "LISTA=%~1"
if "%LISTA%"=="" set "LISTA=lista.txt"
if /I "%LISTA%"=="lista.txt" if not exist lista.txt (
  copy /Y lista.exemplo.txt lista.txt >nul
  echo [!] lista.txt criada a partir do modelo. Coloque suas faixas, salve e rode de novo.
  notepad lista.txt
  pause
  exit /b 1
)
if not exist "%LISTA%" (
  echo [!] Arquivo "%LISTA%" nao encontrado. Crie um lista.txt com uma faixa por linha.
  pause
  exit /b 1
)
docker info >nul 2>&1 || (
  echo [!] Docker Desktop nao esta rodando. Abra o Docker Desktop, rode subir.bat e tente de novo.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0baixar-lista.ps1" -Lista "%LISTA%" %2 %3 %4 %5 %6 %7 %8 %9
echo.
pause
