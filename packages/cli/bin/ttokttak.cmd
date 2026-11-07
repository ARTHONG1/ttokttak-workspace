@echo off
rem ttokttak launcher for the packaged Windows app: <install>\resources\cli\ttokttak.cmd
setlocal
set ELECTRON_RUN_AS_NODE=1
"%~dp0..\..\HangulAIWorkbench.exe" "%~dp0genoffice.cjs" %*
endlocal
