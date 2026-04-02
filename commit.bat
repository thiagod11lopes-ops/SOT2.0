@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

where git >nul 2>&1
if errorlevel 1 (
  echo Git nao encontrado no PATH.
  exit /b 1
)

if "%~1"=="" (
  set /p "COMMIT_MSG=Mensagem do commit: "
) else (
  set "COMMIT_MSG=%*"
)

if not defined COMMIT_MSG (
  echo Mensagem vazia. Operacao cancelada.
  exit /b 1
)

git add -A
if errorlevel 1 exit /b 1

git commit -m "!COMMIT_MSG!"
if errorlevel 1 exit /b 1

echo Commit concluido.
endlocal
exit /b 0
