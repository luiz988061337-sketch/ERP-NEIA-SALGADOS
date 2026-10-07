@echo off
REM ===================================================================
REM Agente de impressao - Neia Salgados / Tanca TP-550 (USB)
REM Roda o node DIRETO (sem "start"), assim a tarefa agendada consegue
REM acompanhar o processo e reiniciar se ele morrer.
REM Nao depende de janela do CMD aberta a mao.
REM ===================================================================
setlocal
set "PASTA=%~dp0"
REM dotenv le o .env do diretorio ATUAL: sem este cd o agente nao acha a config.
cd /d "%PASTA%"
set "NODE=C:\Program Files\nodejs\node.exe"
set "TSX=%PASTA%node_modules\tsx\dist\cli.mjs"
set "AGENTE=%PASTA%agent.ts"
set "LOG=%TEMP%\neia-agent.log"

if not exist "%NODE%" (
  >>"%LOG%" echo [%DATE% %TIME%] ERRO node.exe nao encontrado: "%NODE%"
  exit /b 1
)
if not exist "%TSX%" (
  >>"%LOG%" echo [%DATE% %TIME%] ERRO tsx nao encontrado: "%TSX%"
  exit /b 1
)
if not exist "%AGENTE%" (
  >>"%LOG%" echo [%DATE% %TIME%] ERRO agent.ts nao encontrado: "%AGENTE%"
  exit /b 1
)
if not exist "%PASTA%.env" (
  >>"%LOG%" echo [%DATE% %TIME%] ERRO .env nao encontrado em "%PASTA%"
  exit /b 1
)

>>"%LOG%" echo [%DATE% %TIME%] iniciando agente em "%AGENTE%"
"%NODE%" "%TSX%" "%AGENTE%" >>"%LOG%" 2>&1
set "CODIGO=%ERRORLEVEL%"
>>"%LOG%" echo [%DATE% %TIME%] agente encerrado com codigo %CODIGO%
exit /b %CODIGO%
