<#
.SYNOPSIS
    Сборка и установка KumaFlow на этой машине.

.DESCRIPTION
    Шаги:
      1. Проверка окружения (Node, свободное место, запущен ли плеер).
      2. Сборка main + renderer (electron:build).
      3. Сборка установщика .exe (electron-builder, x64).
      4. Установка — МОЛЧАЛИВАЯ (ключ /S у NSIS).

    Тихая только установка. Сборка идёт с обычным выводом, чтобы было видно,
    где всё встало. Пользовательские данные (плейлисты, лайки, профиль) не
    трогаются: они лежат в %APPDATA%\KumaFlow и установщик их не удаляет.

.PARAMETER SkipBuild
    Не пересобирать исходники — взять уже готовый out/.

.PARAMETER SkipPackage
    Не собирать установщик (пункт 3). Полезно, чтобы проверить только сборку.

.PARAMETER SkipInstall
    Собрать установщик, но не ставить. Установка делается вручную.

.EXAMPLE
    .\setup.ps1
    Полный цикл: сборка -> установщик -> тихая установка.

.EXAMPLE
    .\setup.ps1 -SkipBuild -SkipPackage
    Только установить уже собранный установщик из kumaflow-dist.
#>

[CmdletBinding()]
param(
    [switch]$SkipBuild,
    [switch]$SkipPackage,
    [switch]$SkipInstall,
    # Каталог установки. Если не задан — берётся из реестра, где KumaFlow
    # реально стоит (у нас это A:\kumaflow, а не %LOCALAPPDATA%).
    [string]$InstallDir
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ProjectDir = $PSScriptRoot
$DistDir    = Join-Path (Split-Path $ProjectDir -Parent) 'kumaflow-dist'

function Write-Step  ($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Write-Info  ($m) { Write-Host "    $m" -ForegroundColor Gray }
function Write-Good  ($m) { Write-Host "    $m" -ForegroundColor Green }
function Write-Warn2 ($m) { Write-Host "    $m" -ForegroundColor Yellow }
function Die         ($m) { Write-Host "`nОШИБКА: $m" -ForegroundColor Red; exit 1 }

# ── 0. Подготовка окружения ───────────────────────────────────────────────
Set-Location $ProjectDir
$env:FORCE_COLOR = '1'

Write-Step 'Окружение'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Die 'node не найден в PATH'
}
$nodeVersion = (node -v).Trim()
Write-Info "node $nodeVersion"

if (-not (Test-Path (Join-Path $ProjectDir 'node_modules'))) {
    Die 'node_modules отсутствует — сначала npm install'
}
Write-Info 'node_modules на месте'

if (Test-Path $DistDir) {
    $freeGB = [math]::Round((Get-PSDrive -Name (Get-Item $DistDir).PSDrive.Name).Free / 1GB, 1)
    Write-Info "каталог установщиков: $DistDir (свободно $freeGB ГБ)"
} else {
    Write-Info "каталог установщиков: $DistDir (будет создан)"
}

# ── 1. Закрыть работающий плеер ───────────────────────────────────────────
# Пока KumaFlow запущен, файлы в каталоге установки залочены, и установщик
# либо упадёт, либо поставит поверх старой копии.
Write-Step 'Проверка плеера'

$running = @(Get-Process -Name 'KumaFlow' -ErrorAction SilentlyContinue)
if ($running.Count -gt 0) {
    Write-Warn2 "найдено процессов KumaFlow: $($running.Count) — закрываю"
    $running | Stop-Process -Force
    Start-Sleep -Seconds 3
    $still = @(Get-Process -Name 'KumaFlow' -ErrorAction SilentlyContinue)
    if ($still.Count -gt 0) { Die 'не удалось закрыть KumaFlow' }
    Write-Good 'плеер закрыт'
} else {
    Write-Good 'плеер не запущен'
}

# ── 2. Сборка исходников ──────────────────────────────────────────────────
# На этой машине C: забит (0 ГБ), и electron-builder/npm падают с ENOSPC,
# потому что пишут служебные файлы в %TEMP% — а он на C:. Поэтому на время
# сборки уводим TEMP/TMP на B:, рядом с проектом. Ничего не удаляем.
$BuildTmp = Join-Path $ProjectDir '.build-tmp'
if (-not (Test-Path $BuildTmp)) {
    New-Item -ItemType Directory -Path $BuildTmp -Force | Out-Null
}
$env:TEMP = $BuildTmp
$env:TMP  = $BuildTmp
Write-Info "TEMP/TMP сборки перенаправлены в $BuildTmp"
if ($SkipBuild) {
    Write-Step 'Сборка исходников — ПРОПУЩЕНА (-SkipBuild)'
} else {
    Write-Step 'Сборка исходников (main + renderer)'
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    & npm run electron:build
    if ($LASTEXITCODE -ne 0) { Die "electron:build упал с кодом $LASTEXITCODE" }
    $sw.Stop()
    Write-Good ("собрано за {0:N1} мин" -f $sw.Elapsed.TotalMinutes)

    $main = Join-Path $ProjectDir 'out\main\index.js'
    $html = Join-Path $ProjectDir 'out\renderer\index.html'
    if (-not (Test-Path $main)) { Die 'out/main/index.js не появился' }
    if (-not (Test-Path $html)) { Die 'out/renderer/index.html не появился' }
    Write-Good 'out/ на месте'
}

# ── 3. Сборка установщика ─────────────────────────────────────────────────
# Версию читаем ДО поиска установщика: раньше это стояло после, и поиск шёл
# по '*Setup*.exe' — а свежие файлы называются KumaFlow-v1.8.0-win-x64.exe,
# без слова Setup. Фильтр цеплял старые «KumaFlow Setup 1.7.2.exe» от 05.10
# и скрипт предлагал поставить пятидневный установщик.
$pkg = Get-Content (Join-Path $ProjectDir 'package.json') -Raw | ConvertFrom-Json
$pkgVersion = $pkg.version

# Ожидаемое имя — ровно то, что даёт artifactName
# '${productName}-v${version}-${os}-${arch}.${ext}' для nsis x64 на windows.
$expectedName = "$($pkg.productName)-v$pkgVersion-win-x64.exe"
$expectedPath = Join-Path $DistDir $expectedName

function Find-Installer {
    if (Test-Path $expectedPath) { return Get-Item $expectedPath }
    return $null
}

$installer = $null

if ($SkipPackage) {
    Write-Step 'Сборка установщика — ПРОПУЩЕНА (-SkipPackage)'
    $installer = Find-Installer
} else {
    Write-Step "Сборка установщика .exe (x64, версия $pkgVersion)"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    # ОДИН конфиг. electron-builder не объединяет несколько -c: побеждает
    # последний, и при `-c electron-builder.yml -c electron-builder.local.yml`
    # молча уходили в дефолты (иконка, files, extraResources, oneClick).
    # electron-builder.local.yml — полная копия основного + локальные правки.
    & npx electron-builder --win --x64 -c electron-builder.local.yml
    if ($LASTEXITCODE -ne 0) { Die "electron-builder упал с кодом $LASTEXITCODE" }
    $sw.Stop()
    Write-Good ("собрано за {0:N1} мин" -f $sw.Elapsed.TotalMinutes)

    $installer = Find-Installer
}

if (-not $installer) {
    Write-Warn2 "не нашёл $expectedName — покажи, что там есть:"
    if (Test-Path $DistDir) {
        Get-ChildItem $DistDir -Filter '*.exe' |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 10 |
            ForEach-Object { Write-Info ("  {0}  ({1})" -f $_.Name, $_.LastWriteTime) }
    }
    Die "установщик версии $pkgVersion не собран. Ставить что попало не буду."
}

Write-Good "установщик: $($installer.Name)"
Write-Info  "размер: $([math]::Round($installer.Length / 1MB, 1)) МБ"
Write-Info  "собран: $($installer.LastWriteTime)"
Write-Info  "версия в package.json: $pkgVersion"

# ── 4. Тихая установка ────────────────────────────────────────────────────
# Единственный шаг, который идёт без вопросов: NSIS с oneClick:false
# понимает ключ /S и ставит молча.
if ($SkipInstall) {
    Write-Step 'Установка — ПРОПУЩЕНА (-SkipInstall)'
    Write-Info "поставить вручную: `"$($installer.FullName)`""
    exit 0
}

Write-Step 'Куда ставим'

# Каталог НЕ хардкодим. Раньше здесь стояло %LOCALAPPDATA%\Programs\kumaflow,
# и это было неверно: KumaFlow у нас стоит на A:\kumaflow (диск A:, 125 ГБ).
# На C: при этом 0 ГБ свободных — проверка места смотрела не туда.
#
# Берём путь из реестра: у записи, чей UninstallString указывает на реально
# существующий «Uninstall KumaFlow.exe». Таких записей может быть две —
# старая осиротевшая с версией в имени («KumaFlow 1.7.2») и текущая.
if (-not $InstallDir) {
    $entries = Get-ItemProperty `
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' `
        -ErrorAction SilentlyContinue |
        Where-Object { $_.UninstallString -like '*Uninstall KumaFlow.exe*' }

    $candidates = foreach ($e in $entries) {
        $un = $e.UninstallString
        if ($un -match '^"([^"]+)"') {
            # "A:\kumaflow\Uninstall KumaFlow.exe" /currentuser -> каталог установки.
            # Один Split-Path: два уводили бы на уровень выше (A:\ вместо A:\kumaflow).
            $dir = Split-Path $Matches[1] -Parent
            if (Test-Path $dir) { [pscustomobject]@{ Dir = $dir; Name = $e.DisplayName } }
        }
    }

    # Точное имя «KumaFlow» — актуальная запись; «KumaFlow <версия>» — старые.
    $active = $candidates | Where-Object { $_.Name -eq 'KumaFlow' } | Select-Object -First 1
    if (-not $active) { $active = $candidates | Select-Object -First 1 }

    if ($active) {
        $InstallDir = $active.Dir
        Write-Good "найден действующий каталог: $InstallDir"
    } else {
        $InstallDir = Join-Path $env:LOCALAPPDATA 'Programs\kumaflow'
        Write-Warn2 'в реестре не нашлось — ставлю по умолчанию'
    }
}

$driveLetter = (Get-Item $InstallDir).PSDrive.Name
$freeGB = [math]::Round((Get-PSDrive -Name $driveLetter).Free / 1GB, 2)
Write-Info "диск ${driveLetter}:, свободно $freeGB ГБ"
if ($freeGB -lt 1) {
    Die "на ${driveLetter}: свободно $freeGB ГБ — установка не поместится"
}

Write-Step 'Тихая установка (/S)'

$proc = Start-Process -FilePath $installer.FullName `
                      -ArgumentList '/S' `
                      -PassThru
Write-Info "запущен $($installer.Name) /S, ждём завершения..."

$deadline = (Get-Date).AddMinutes(10)
while (-not $proc.HasExited -and (Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 5
    Write-Host -NoNewline '.'
}
Write-Host ''

if (-not $proc.HasExited) {
    Die 'установщик не завершился за 10 минут'
}
if ($proc.ExitCode -ne 0) {
    Die "установщик вернул код $($proc.ExitCode)"
}
Write-Good "установщик завершился, код $($proc.ExitCode)"

# Проверяем, что приложение действительно появилось
$appExe = Join-Path $InstallDir 'KumaFlow.exe'
if (Test-Path $appExe) {
    Write-Good "установлено: $appExe"
    $ver = (Get-Item $appExe).VersionInfo.ProductVersion
    Write-Info  "версия файла: $ver"

    # Windows отдаёт ProductVersion четырьмя компонентами («1.8.0.0»), а в
    # package.json их три («1.8.0»). Сравнивать строкой — ложная тревога,
    # поэтому приводим обе к major.minor.patch.
    function Get-NormalizedVersion($v) {
        if (-not $v) { return '' }
        $p = $v.Trim() -split '\.'
        while ($p.Count -lt 3) { $p += '0' }
        ($p[0..2] -join '.')
    }
    $fileV = Get-NormalizedVersion $ver
    $wantV = Get-NormalizedVersion $pkgVersion
    if ($fileV -eq $wantV) {
        Write-Good "версия совпала: $fileV"
    } else {
        Write-Warn2 "ожидали $wantV, в файле $fileV"
    }
} else {
    Die "не найден $appExe — установка не удалась"
}

Write-Host "`nГотово." -ForegroundColor Green
Write-Info "Запуск: `"$appExe`""