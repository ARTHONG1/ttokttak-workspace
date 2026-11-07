# Installs 똑딱작업실 (HangulAIWorkbench) on Windows from the latest GitHub release.
# Written to be run by an AI agent on the user's behalf (see INSTALL.md), and safe to
# run again: the installer upgrades in place and keeps the user's documents and settings.
#
#   irm https://raw.githubusercontent.com/ARTHONG1/ttokttak-workspace/main/scripts/install/install-windows.ps1 | iex
#
# Options (environment): TTOKTTAK_VERSION=v0.14.0, TTOKTTAK_NO_AGENTS=1, TTOKTTAK_NO_DESKTOP=1
# The last line printed is one JSON object after "TTOKTTAK_INSTALL_RESULT ", for the agent.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Repo = 'ARTHONG1/ttokttak-workspace'
$AppName = 'HangulAIWorkbench'
$ShortcutName = '똑딱작업실'
$State = [ordered]@{ ok = $false; step = 'start'; version = ''; app = ''; desktop = ''; agents = 'skipped'; message = '' }

function Say($text) { Write-Host "[똑딱작업실] $text" }
function Result {
  Write-Output ('TTOKTTAK_INSTALL_RESULT ' + ($State | ConvertTo-Json -Compress))
}
function Fail($text) {
  Say "실패: $text"
  $State.message = $text
  Result
  throw $text
}

try {
  if (-not [Environment]::Is64BitOperatingSystem) { Fail '64비트 Windows만 지원합니다.' }
  if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { Say '참고: ARM64 PC에서는 x64 앱이 에뮬레이션으로 실행됩니다.' }

  $State.step = 'pick'
  $api = if ($env:TTOKTTAK_VERSION) { "https://api.github.com/repos/$Repo/releases/tags/$($env:TTOKTTAK_VERSION)" } else { "https://api.github.com/repos/$Repo/releases/latest" }
  Say '릴리스 정보를 확인합니다'
  try { $release = Invoke-RestMethod -Uri $api -Headers @{ Accept = 'application/vnd.github+json' } }
  catch { Fail "릴리스를 찾지 못했습니다($api). 아직 공개된 설치 파일이 없을 수 있습니다." }
  $State.version = $release.tag_name
  $exe = $release.assets | Where-Object { $_.name -match "^$AppName-Setup-[0-9][^/]*\.exe$" -and $_.name -notmatch 'arm64' } | Select-Object -First 1
  if (-not $exe -and -not $env:TTOKTTAK_VERSION) {
    # A release may ship only some platforms (v0.16.2: Apple Silicon Mac only).
    # Fall back to the newest stable release that has a Windows installer.
    Say "$($release.tag_name) 릴리스에 Windows 설치 파일이 없어, 가장 최근 Windows 버전을 찾습니다"
    $list = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases?per_page=30" -Headers @{ Accept = 'application/vnd.github+json' }
    $release = $list | Where-Object { -not $_.draft -and -not $_.prerelease -and ($_.assets | Where-Object { $_.name -match "^$AppName-Setup-[0-9][^/]*\.exe$" -and $_.name -notmatch 'arm64' }) } | Select-Object -First 1
    if ($release) {
      $State.version = $release.tag_name
      $exe = $release.assets | Where-Object { $_.name -match "^$AppName-Setup-[0-9][^/]*\.exe$" -and $_.name -notmatch 'arm64' } | Select-Object -First 1
    }
  }
  $feed = $release.assets | Where-Object { $_.name -eq 'latest.yml' } | Select-Object -First 1
  if (-not $exe) { Fail "공개된 릴리스에 Windows 설치 파일이 없습니다." }

  $work = Join-Path ([IO.Path]::GetTempPath()) ('ttokttak-' + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $work | Out-Null
  $installer = Join-Path $work $exe.name

  $State.step = 'download'
  Say "$($exe.name) 내려받는 중"
  Invoke-WebRequest -Uri $exe.browser_download_url -OutFile $installer -UseBasicParsing

  $State.step = 'verify'
  if ($feed) {
    $yml = (Invoke-WebRequest -Uri $feed.browser_download_url -UseBasicParsing).Content
    if ($yml -is [byte[]]) { $yml = [Text.Encoding]::UTF8.GetString($yml) }
    $m = [regex]::Match($yml, "url:\s*$([regex]::Escape($exe.name))\s*\r?\n\s*sha512:\s*(\S+)")
    if (-not $m.Success) { Fail "latest.yml에 $($exe.name)의 sha512가 없습니다." }
    $sha = [Security.Cryptography.SHA512]::Create()
    $stream = [IO.File]::OpenRead($installer)
    try { $got = [Convert]::ToBase64String($sha.ComputeHash($stream)) } finally { $stream.Dispose() }
    if ($got -ne $m.Groups[1].Value) { Fail '내려받은 파일의 sha512가 릴리스와 다릅니다. 설치하지 않습니다.' }
    Say '파일 확인 완료(sha512)'
  } else { Say '경고: latest.yml이 없어 sha512를 확인하지 못했습니다' }

  $State.step = 'install'
  Get-Process -Name $AppName -ErrorAction SilentlyContinue | ForEach-Object { $_.CloseMainWindow() | Out-Null }
  Start-Sleep -Seconds 2
  Get-Process -Name $AppName -ErrorAction SilentlyContinue | Stop-Process -Force
  Say '설치하는 중(조용한 설치)'
  $p = Start-Process -FilePath $installer -ArgumentList '/S' -PassThru -Wait
  if ($p.ExitCode -ne 0) { Fail "설치 프로그램이 오류로 끝났습니다(코드 $($p.ExitCode))." }
  $dir = Join-Path $env:LOCALAPPDATA "Programs\$AppName"
  $app = Join-Path $dir "$AppName.exe"
  if (-not (Test-Path $app)) {
    $alt = Join-Path $env:ProgramFiles "$AppName\$AppName.exe"
    if (Test-Path $alt) { $app = $alt; $dir = Split-Path $alt } else { Fail "설치된 앱을 찾지 못했습니다: $app" }
  }
  $State.app = $app
  Say "설치 완료: $app"

  $State.step = 'desktop'
  if (-not $env:TTOKTTAK_NO_DESKTOP) {
    $desk = [Environment]::GetFolderPath('Desktop')
    $lnk = Join-Path $desk "$ShortcutName.lnk"
    $shell = New-Object -ComObject WScript.Shell
    $s = $shell.CreateShortcut($lnk)
    $s.TargetPath = $app
    $s.WorkingDirectory = $dir
    $s.IconLocation = "$app,0"
    $s.Description = '똑딱작업실 — AI 문서 작업실'
    $s.Save()
    $State.desktop = $lnk
    Say "바탕화면 바로 가기: $lnk"
  }

  $State.step = 'cli'
  $cli = Join-Path $dir 'resources\cli\ttokttak.cmd'
  if (-not (Test-Path $cli)) { Fail "앱 안의 명령어를 찾지 못했습니다: $cli" }
  & $cli install-cli
  if ($LASTEXITCODE -ne 0) { Say '경고: ttokttak을 PATH에 연결하지 못했습니다. 앱 안의 경로로 계속합니다' }

  $State.step = 'agents'
  if (-not $env:TTOKTTAK_NO_AGENTS) {
    & $cli mcp install all; $a = $LASTEXITCODE
    & $cli skill install all; $b = $LASTEXITCODE
    $State.agents = if ($a -eq 0 -and $b -eq 0) { 'registered' } else { 'partial' }
    if ($State.agents -ne 'registered') { Say '경고: 일부 에이전트에 등록하지 못했습니다. ttokttak mcp list으로 확인하세요' }
  }

  $State.step = 'done'
  $State.ok = $true
  $State.message = 'installed'
  Say "끝났습니다. 바탕화면의 '$ShortcutName'로 여세요. 등록한 AI 에이전트는 다시 시작해야 새 도구가 보입니다."
  Result
} finally {
  if ($work -and (Test-Path $work)) { Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue }
}
