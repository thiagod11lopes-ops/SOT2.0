@echo off
title SOT - servidor local
cd /d "%~dp0"
where npm >nul 2>nul || (echo Node.js/npm nao encontrado. Instale Node.js LTS de https://nodejs.org & pause & exit /b 1)
echo.
echo A abrir o Vite... Depois abra: http://localhost:3000/ ou http://127.0.0.1:3000/ (porta = linha Local: no terminal)
echo.
npm run dev
pause
