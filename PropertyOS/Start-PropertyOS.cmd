@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel% equ 0 (
  py -3 scripts\launch-local.py
  goto end
)
where node >nul 2>nul
if %errorlevel% equ 0 (
  start "" http://127.0.0.1:4173
  node scripts\serve.mjs
  goto end
)
echo Install Python 3 or Node.js for this browser launcher, or build the native Windows installer. See README.md.
:end
pause
