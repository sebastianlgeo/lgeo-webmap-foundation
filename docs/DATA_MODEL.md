# Data Model

The new model has two levels: projects and geographies.

## Projects

Source:

- `data/source/projects.csv`
- `data/source/project_links.csv`

Generated:

- `data/processed/projects.json`

Each generated project includes:

- `projectNumber`
- `projectYear`
- `projectName`
- `projectType`
- `projectLevel`
- `description`
- `projectUrl`
- `thumbnailUrl`
- `featured`
- `interactive`
- `primaryGeography`
- `geographies`
- `polygonKeys`

Suppressed rows are skipped. A row is treated as suppressed when `Suppress` starts with `Yes`, or is `Y`, `True`, `1`, or `X`.

The source table separates display names from polygon keys:

- `Geography National`
- `Geography Provincial`
- `Geography Regional`
- `Geography Municipal`
- `Polygon National`
- `Polygon Provincial`
- `Polygon Regional`
- `Polygon Municipal`

Use `Display National`, `Display Provincial`, `Display Regional`, and `Display Municipal` to explicitly control where the project counts. This prevents duplicate counters from near-equivalent labels such as `Toronto` and `City Of Toronto`.

## Geographies

Generated:

- `data/processed/geography-index.json`

The index is keyed by each geography name or polygon key used by the map. Each entry includes:

- `geographyName`
- `scales`
- `keyKinds`
- `projectCount`
- `linkedProjectCount`
- `projectTypes`
- `projectLevels`
- `topProjectType`
- `topProjectLevel`
- `projects`

The app uses this file for popups, sidebar lists, search results, and click-through project cards.

## GeoJSON

Raw input:

- `data/geojson/raw/*.geojson`

Generated output:

- `data/processed/geojson/*.geojson`

The generator preserves the geometry and enriches feature properties:

- `ProjectCount`
- `LinkedProjectCount`
- `Interactive`
- `TopProjectType`
- `ProjectTypes`
- updated `FREQUENCY`
- `NameKey`
- `HasLowerScaleReplacement`

This makes map styling data-driven without hand-editing layer files.
