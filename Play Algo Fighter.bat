@echo off
setlocal
cd /d "%~dp0"
title Algo Fighter

rem ---- find Python 3 (py launcher first, then python on PATH) ----
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY (
  where python >nul 2>nul && set "PY=python"
)
if not defined PY (
  where python3 >nul 2>nul && set "PY=python3"
)

if not defined PY (
  echo.
  echo   Python 3 is needed to serve the game.
  echo   Install it from https://www.python.org/downloads/ and tick
  echo   "Add python.exe to PATH", then double-click this file again.
  echo.
  pause
  exit /b 1
)

%PY% -u "%~dp0play.py"
if errorlevel 1 pause
