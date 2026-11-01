@echo off
rem ieumoffice launcher for the packaged Windows app: <install>\resources\cli\ieumoffice.cmd
setlocal
chcp 65001 >nul
set ELECTRON_RUN_AS_NODE=1
if exist "%~dp0..\..\똑딱작업실.exe" (
  "%~dp0..\..\똑딱작업실.exe" "%~dp0genoffice.cjs" %*
) else (
  "%~dp0..\..\HangulAIWorkbench.exe" "%~dp0genoffice.cjs" %*
)
endlocal
