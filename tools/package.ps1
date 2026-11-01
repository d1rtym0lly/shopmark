$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$vpkFile = Join-Path $projectRoot 'dist\shopmark.vpk'
$manifestFile = Join-Path $projectRoot 'dist\build-manifest.json'
$manifest = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
if ($manifest.diagnostic) { throw 'Diagnostic builds must not be packaged. Build without --probe first.' }
$checksum = (Get-FileHash -LiteralPath $vpkFile -Algorithm SHA256).Hash.ToLowerInvariant()
if ($checksum -ne $manifest.sha256) { throw 'VPK checksum differs from manifest; rebuild.' }
$suffix = if ($manifest.runtimeTested) { '' } else { '-untested' }
$archivePath = Join-Path $projectRoot "dist\shopmark-$($manifest.version)$suffix.zip"
Compress-Archive -LiteralPath $vpkFile -DestinationPath $archivePath -Force
Write-Output $archivePath
