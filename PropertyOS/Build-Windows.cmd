@echo off
cd /d "%~dp0"
where cargo >nul 2>nul
if %errorlevel% neq 0 (
  echo Install Rust, Node.js and Visual Studio C++ Build Tools first. See docs\BUILD_AND_INSTALL.md.
  goto end
)
call npm ci
if errorlevel 1 goto end
call npm test
if errorlevel 1 goto end
call npm run desktop:build
if errorlevel 1 goto end
start "" src-tauri\target\release\bundle
:end
pause
