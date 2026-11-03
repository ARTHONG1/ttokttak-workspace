@echo off
rem Chrome native messaging host for the 똑딱 에듀파인 연결 extension (Windows install):
rem <install>\resources\cli\edufine-host.cmd, registered under
rem HKCU\Software\Google\Chrome\NativeMessagingHosts\kr.ttokttak.edufine by the installer.
setlocal
set ELECTRON_RUN_AS_NODE=1
"%~dp0..\..\HangulAIWorkbench.exe" "%~dp0genoffice.cjs" edufine-host %*
endlocal
