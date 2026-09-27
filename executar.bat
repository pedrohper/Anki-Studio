@echo off
chcp 65001 >nul
title Anki Studio
cd /d "%~dp0"

rem Uso:
rem   executar.bat                 abre no PC e mostra o QR code para o celular (mesmo Wi-Fi)
rem   executar.bat --rebuild       gera a versao otimizada de novo antes de abrir
rem   Fora de casa: ligue em Configuracoes > Abrir no celular (precisa de um PIN)

set REBUILD=0
for %%A in (%*) do (
    if /i "%%~A"=="--rebuild" set REBUILD=1
)

where node >nul 2>nul || (echo [ERRO] Instale o Node.js 22 ou mais novo: https://nodejs.org & pause & exit /b 1)
where pnpm >nul 2>nul || (echo Instalando o pnpm... & call npm install -g pnpm)

if not exist node_modules (
    echo Instalando dependencias...
    call pnpm install || (pause & exit /b 1)
)

if "%REBUILD%"=="1" if exist .next rmdir /s /q .next

if not exist .next\BUILD_ID (
    echo Gerando a versao otimizada...
    call pnpm build || (pause & exit /b 1)
)

rem Endereco e QR code para abrir no celular
node scripts\mostrar-endereco.mjs 3000

rem Abre o navegador alguns segundos depois de o servidor subir
start "" cmd /c "timeout /t 4 >nul & start http://localhost:3000"
call pnpm start

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRO] O Anki Studio parou. Veja a mensagem acima.
    pause
)
