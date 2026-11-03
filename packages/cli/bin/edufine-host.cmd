@echo off
rem Chrome native messaging host for the TtokTtak EduFine Link extension (Windows install):
rem <install>\resources\cli\edufine-host.cmd, registered under
rem HKCU\Software\Google\Chrome\NativeMessagingHosts\kr.ttokttak.edufine by the installer.
rem ASCII only: cmd.exe reads this file in the PC's code page (CP949 on Korean Windows).
setlocal
set ELECTRON_RUN_AS_NODE=1
"%~dp0..\..\HangulAIWorkbench.exe" "%~dp0genoffice.cjs" edufine-host %*
endlocal
