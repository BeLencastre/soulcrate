@echo off
REM Verifica saude da stack e dos plugins de analise
cd /d "%~dp0"
docker compose ps
echo.
echo --- Binarios e plugins dentro do Soulbeet ---
docker compose exec soulbeet /usr/local/bin/keyfinder-cli --help
docker compose exec soulbeet /usr/bin/python3 -c "import librosa, resampy, beetsplug.bandcamp, beets; print('beets', beets.__version__, '- librosa/resampy/beetcamp OK')"
echo.
echo --- Pastas compartilhadas (devem listar o mesmo conteudo) ---
docker compose exec slskd ls -la /downloads
docker compose exec soulbeet /usr/bin/python3 -c "import os; print(os.listdir('/downloads'))"
echo.
echo --- Ultimas linhas do log do beets ---
powershell -NoProfile -Command "if (Test-Path soulbeet\data\beets-import.log) { Get-Content soulbeet\data\beets-import.log -Tail 20 } else { 'sem importacoes ainda' }"
pause
