param(
  [string]$EnvPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'secrets/mapbox.env'),
  [string]$TilesetsExe = 'C:\Users\sebas\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\Scripts\tilesets.exe',
  [string[]]$LayerIds = @(),
  [switch]$WaitForCompletion,
  [int]$WaitTimeoutSeconds = 600
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
    foreach ($item in ($layerId -split ',')) {
      $trimmed = $item.Trim()
      if ($trimmed) {
        [void]$requested.Add($trimmed)
      }
    }
  }
  $layers = @($layers | Where-Object { $requested.Contains($_.id) -or $requested.Contains($_.handle) })
  if (-not $layers.Count) {
    throw "No Mapbox layers matched -LayerIds: $($requested -join ', ')"
  }
}

Write-Host "Selected Mapbox layers: $($layers.id -join ', ')"

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

    $publishOutput = & $TilesetsExe publish $TilesetId 2>&1
    $publishOutput | Write-Host
    if ($LASTEXITCODE -eq 0) {
      $jobId = Extract-JobId -Output $publishOutput
      return $jobId
    }
  }

  throw "publish failed for $TilesetId"
}

function Extract-JobId {
  param([object[]]$Output)

  foreach ($line in $Output) {
    try {
      $payload = $line | ConvertFrom-Json -ErrorAction Stop
      if ($payload.jobId) {
        return [string]$payload.jobId
      }
    } catch {
      continue
    }
  }

  return ""
}

function Wait-TilesetJob {
  param(
    [string]$TilesetId,
    [string]$JobId,
    [int]$TimeoutSeconds
  )

  if (-not $JobId) {
    Write-Warning "Could not read a job id for $TilesetId; skipping wait."
    return
  }

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    Start-Sleep -Seconds 12
    $jobOutput = & $TilesetsExe job $TilesetId $JobId
    $job = $jobOutput | ConvertFrom-Json
    Write-Host "Job $JobId for $TilesetId is $($job.stage)"

    if ($job.stage -eq "success") {
      return
    }

    if ($job.stage -eq "failed") {
      throw "Mapbox job $JobId for $TilesetId failed: $jobOutput"
    }
  } while ((Get-Date) -lt $deadline)

  throw "Timed out waiting for Mapbox job $JobId for $TilesetId"
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
  } else {
    & $TilesetsExe update-recipe $tilesetId $recipePath
    if ($LASTEXITCODE -ne 0) {
      throw "update-recipe failed for $tilesetId"
    }
  }

  Write-Host "Publishing $tilesetId"
  $jobId = Publish-TilesetWithRetry -TilesetId $tilesetId
  if ($jobId) {
    Write-Host "Queued job $jobId for $tilesetId"
  }
  if ($WaitForCompletion) {
    Wait-TilesetJob -TilesetId $tilesetId -JobId $jobId -TimeoutSeconds $WaitTimeoutSeconds
  }
  Start-Sleep -Seconds 12
}

if ($WaitForCompletion) {
  Write-Host "All Mapbox tileset publishes completed successfully."
} else {
  Write-Host "All Mapbox tileset publishes have been queued."
}
