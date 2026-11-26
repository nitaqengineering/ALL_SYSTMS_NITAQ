# NITAQ Showcase — install the Revit button on this PC (run once per engineer).
# Right-click > "Run with PowerShell", or:  powershell -ExecutionPolicy Bypass -File install.ps1
$ErrorActionPreference = 'Stop'
$endpoint = '__ENDPOINT__'

Write-Host ''
Write-Host 'NITAQ Showcase - تثبيت زرار "تحديث العرض"' -ForegroundColor Yellow

# 1) pyRevit must be there
$pyrevit = Join-Path $env:APPDATA 'pyRevit'
if (-not (Test-Path $pyrevit)) {
  Write-Host 'pyRevit مش متثبّت على الجهاز. ثبّته الأول من https://github.com/pyrevitlabs/pyRevit/releases ثم شغّل الملف ده تاني.' -ForegroundColor Red
  Read-Host 'اضغط Enter للخروج'; exit 1
}

# 2) Node.js (the button uses it to prepare and upload the model)
$node = 'C:\Program Files\nodejs\node.exe'
if (-not (Test-Path $node) -and -not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'جاري تثبيت Node.js ...'
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
}

# 3) the extension
$dst = Join-Path $pyrevit 'Extensions\NITAQ.extension'
if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
Copy-Item (Join-Path $PSScriptRoot 'NITAQ.extension') $dst -Recurse
Write-Host "تم نسخ الإضافة إلى $dst"

# 4) this engineer's key
$cfgDir = Join-Path $env:APPDATA 'NITAQ'
New-Item -ItemType Directory -Force $cfgDir | Out-Null
$cfgPath = Join-Path $cfgDir 'showcase.json'
$cfg = $null
if (Test-Path $cfgPath) { try { $cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json } catch { $cfg = $null } }
if (-not $endpoint) { $endpoint = if ($cfg) { $cfg.endpoint } else { Read-Host 'عنوان السحابة (https://....supabase.co/functions/v1/showcase-publish)' } }
$key = if ($cfg -and $cfg.key) { $cfg.key } else { '' }
$preset = '__KEY__' # an engineer's own package carries their key: nothing to type
if ($preset -match '^nsk_[a-z0-9]{24,64}$') { $key = $preset; $answer = '' } else {
$answer = Read-Host ('مفتاح المهندس (يبدأ بـ nsk_)' + $(if ($key) { ' - اضغط Enter للإبقاء على المفتاح الحالي' } else { '' }))
if ($answer) { $key = $answer.Trim() }
}
if ($key -notmatch '^nsk_[a-z0-9]{24,64}$') { Write-Host 'المفتاح غير صحيح. اطلبه من المسؤول.' -ForegroundColor Red; Read-Host 'Enter'; exit 1 }
[System.IO.File]::WriteAllText($cfgPath, (@{ endpoint = $endpoint; key = $key } | ConvertTo-Json), (New-Object System.Text.UTF8Encoding $false))

Write-Host ''
Write-Host 'تم التثبيت. افتح Revit (أو اضغط Reload في تبويب pyRevit)، وهتلاقي تبويب NITAQ > زرار "تحديث العرض".' -ForegroundColor Green
Read-Host 'اضغط Enter للإغلاق'
