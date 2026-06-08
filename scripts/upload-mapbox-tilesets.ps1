param(
  [string]$EnvPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'secrets/mapbox.env'),
  [string]$TilesetsExe = 'C:\Users\sebas\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\Scripts\tilesets.exe',
  [string[]]$LayerIds = @()
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'load-mapbox-env.ps1') -EnvPath $EnvPath

if (-not (Test-Path -LiteralPath $TilesetsExe)) {
  throw "Missing Tilesets CLI: $TilesetsExe"
}

$username = if ($env:MAPBOX_USERNAME) { $env:MAPBOX_USERNAME } else { 'lickergeospatial' }
$layers = @(
  @{ id = 'NationalLevelPoints'; handle = 'lgeo-national-points'; minzoom = 0; maxzoom = 6 },
  @{ id = 'ProvincialLevelPoints'; handle = 'lgeo-provincial-points'; minzoom = 0; maxzoom = 8 },
  @{ id = 'RegionalLevelPoints'; handle = 'lgeo-regional-points'; minzoom = 0; maxzoom = 10 },
  @{ id = 'MunicipalLevelPoints'; handle = 'lgeo-municipal-points'; minzoom = 0; maxzoom = 14 },
  @{ id = 'ProvincialLevelPolygons'; handle = 'lgeo-provincial-polygons'; minzoom = 0; maxzoom = 8 },
  @{ id = 'RegionalLevelPolygons'; handle = 'lgeo-regional-polygons'; minzoom = 0; maxzoom = 10 },
  @{ id = 'MunicipalLevelPolygons'; handle = 'lgeo-municipal-polygons'; minzoom = 0; maxzoom = 14 }
)

if ($LayerIds.Count) {
  $requested = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($layerId in $LayerIds) {
    [void]$requested.Add($layerId)
  }
  $layers = @($layers | Where-Object { $requested.Contains($_.id) -or $requested.Contains($_.handle) })
}

$recipeDir = Join-Path $root 'data/processed/mapbox-recipes'
New-Item -ItemType Directory -Force -Path $recipeDir | Out-Null

function Publish-TilesetWithRetry {
  param(
    [string]$TilesetId,
    [int]$Attempts = 4
  )

  for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
    if ($attempt -gt 1) {
      $delaySeconds = 30 * $attempt
      Write-Host "Retrying publish for $TilesetId in $delaySeconds seconds"
      Start-Sleep -Seconds $delaySeconds
    }

    & $TilesetsExe publish $TilesetId
    if ($LASTEXITCODE -eq 0) {
      return
    }
  }

  throw "publish failed for $TilesetId"
}

foreach ($layer in $layers) {
  $geojsonPath = Join-Path $root "data/processed/geojson/$($layer.id).geojson"
  if (-not (Test-Path -LiteralPath $geojsonPath)) {
    throw "Missing GeoJSON: $geojsonPath"
  }

  $sourceId = "$($layer.handle)-src"
  $tilesetId = "$username.$($layer.handle)"
  $sourceUrl = "mapbox://tileset-source/$username/$sourceId"
  $recipePath = Join-Path $recipeDir "$($layer.handle).recipe.json"

  $recipe = [ordered]@{
    version = 1
    layers = [ordered]@{
      $($layer.id) = [ordered]@{
        source = $sourceUrl
        minzoom = $layer.minzoom
        maxzoom = $layer.maxzoom
      }
    }
  }

  $recipeJson = $recipe | ConvertTo-Json -Depth 8
  [System.IO.File]::WriteAllText($recipePath, $recipeJson, [System.Text.UTF8Encoding]::new($false))

  Write-Host "Uploading source $sourceId from $($layer.id).geojson"
  & $TilesetsExe upload-source $username $sourceId $geojsonPath --replace --no-validation
  if ($LASTEXITCODE -ne 0) {
    throw "upload-source failed for $sourceId"
  }

  Write-Host "Creating or updating tileset $tilesetId"
  & $TilesetsExe create $tilesetId --recipe $recipePath --name $layer.id --privacy public
  if ($LASTEXITCODE -ne 0) {
    & $TilesetsExe update-recipe $tilesetId $recipePath
    if ($LASTEXITCODE -ne 0) {
      throw "create/update-recipe failed for $tilesetId"
    }
  }

  Write-Host "Publishing $tilesetId"
  Publish-TilesetWithRetry -TilesetId $tilesetId
  Start-Sleep -Seconds 12
}

Write-Host "All Mapbox tileset publishes have been queued."
