param(
  [ValidateSet('None', 'Points', 'Polygons', 'All')]
  [string]$Upload = 'None',
  [switch]$WaitForCompletion,
  [string]$PythonExe = 'C:\Users\sebas\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$generator = Join-Path $PSScriptRoot 'generate-webmap-data.py'
$uploader = Join-Path $PSScriptRoot 'upload-mapbox-tilesets.ps1'
$report = Join-Path $root 'data/processed/update-report.md'

if (-not (Test-Path -LiteralPath $PythonExe)) {
  throw "Missing Python runtime: $PythonExe"
}

Write-Host "Generating public webmap data..."
& $PythonExe $generator
if ($LASTEXITCODE -ne 0) {
  throw "generate-webmap-data.py failed"
}

Write-Host ""
Write-Host "Update report: $report"

if ($Upload -eq 'None') {
  Write-Host "Skipping Mapbox upload. Use -Upload Points, -Upload Polygons, or -Upload All when geometry/count layers need publishing."
  return
}

$layerIds = switch ($Upload) {
  'Points' {
    @('NationalLevelPoints', 'ProvincialLevelPoints', 'RegionalLevelPoints', 'MunicipalLevelPoints')
  }
  'Polygons' {
    @('ProvincialLevelPolygons', 'RegionalLevelPolygons', 'MunicipalLevelPolygons')
  }
  'All' {
    @()
  }
}

Write-Host ""
Write-Host "Publishing Mapbox $Upload layers..."
if ($layerIds.Count) {
  & $uploader -LayerIds $layerIds -WaitForCompletion:$WaitForCompletion
} else {
  & $uploader -WaitForCompletion:$WaitForCompletion
}

if ($LASTEXITCODE -ne 0) {
  throw "upload-mapbox-tilesets.ps1 failed"
}
