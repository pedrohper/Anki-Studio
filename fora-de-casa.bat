@echo off
rem Abre o Anki Studio e cria um link https (com senha) para usar no celular fora de casa.
cd /d "%~dp0"
call executar.bat --fora-de-casa %*
