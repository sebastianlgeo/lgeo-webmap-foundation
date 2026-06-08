# Update Workflow

Before publishing to GitHub, read `docs/PUBLIC_DEPLOYMENT_WORKFLOW.md`. The editable source CSVs can include suppressed/private projects and should stay local.

## Source Of Truth

Use `data/source/projects.csv` as the master project table.

Use `data/source/project_links.csv` only for project example links and lightweight overrides. Rows in `project_links.csv` override matching URL/link fields in `projects.csv`, so you can add a Wix link without touching the larger table.

The generated public outputs live in `data/processed/`.

## Add Or Edit A Project

Open `data/source/projects.csv`.

Required project fields:

- `Project Number`
- `Project Year`
- `Project Name`
- `Project Type`
- `Suppress`

Display fields:

- `Display National`
- `Display Provincial`
- `Display Regional`
- `Display Municipal`

Geography label fields:

- `Geography National`
- `Geography Provincial`
- `Geography Regional`
- `Geography Municipal`

Polygon matching fields:

- `Polygon National`
- `Polygon Provincial`
- `Polygon Regional`
- `Polygon Municipal`

Link and helper fields:

- `Primary Geography`
- `Project URL`
- `Project Page Slug`
- `Thumbnail URL`
- `Featured`
- `Interactive`
- `Map Notes`
- `Source Notes`

## How Display Levels Work

Set a display field to `Yes` only where the project should count and appear.

Examples:

- A BC government project can use `Display National = Yes` and `Display Provincial = Yes`, with `Geography Provincial = British Columbia`.
- A Metro Vancouver project can use `Display National = Yes`, `Display Provincial = Yes`, and `Display Regional = Yes`.
- A City of Victoria project can use all four levels, ending with `Geography Municipal = Victoria`.
- A private/sensitive project should use `Suppress = Yes`; it will be skipped by the generator.

Leave lower levels blank when they do not apply. This avoids accidental overlap, such as separate `Toronto` and `City Of Toronto` counters for the same work.

## Geography Versus Polygon

`Geography ...` controls the visible orange count point, hover label, popup title, and search result.

`Polygon ...` controls which polygon receives that project count.

Usually these are the same visible place, but not always. For example:

- `Geography Regional = Capital Regional District - British Columbia`
- `Polygon Regional = CAPRD`
- `Geography Municipal = Victoria`
- `Polygon Municipal = Victoria`

The short polygon key should match the generated or source GeoJSON key. If you are unsure, leave a note in `Source Notes`, run the generator, and check `data/processed/update-report.md`.

## Link Projects To Wix Pages

For links only, open `data/source/project_links.csv`.

Required column:

- `Project Number`

Useful columns:

- `Project Name`
- `Project URL`
- `Project Page Slug`
- `Thumbnail URL`
- `Featured`
- `Interactive`
- `Primary Geography`

Use `Featured = Yes` for projects that should appear as linked examples near the top of popup lists. They do not get a separate map icon.

Any row with a `Project URL` is treated as interactive. The popup item will behave like a link and navigate to that URL.

## Regenerate

Run the generator from the foundation folder:

```powershell
C:\Users\sebas\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe .\scripts\generate-webmap-data.py
```

It writes:

- `data/processed/projects.json`
- `data/processed/geography-index.json`
- `data/processed/app-data.generated.js`
- `data/processed/geojson/*.geojson`
- `data/processed/geography-bounds.json`
- `data/processed/update-report.md`
- `data/processed/update-report.json`

## Check The Report

Open `data/processed/update-report.md` after each update.

Pay attention to:

- Missing geography keys.
- Missing polygon keys.
- Layer match counts.
- Unexpected duplicate names, such as `Toronto` and `City Of Toronto`.
- Unexpected project type names.
- Encoding or typo issues.

If a project appears in the wrong geography, fix the source CSV first. Do not hand-edit `data/processed/` because it will be overwritten next time you generate.

## When Geometry Changes

If a new project uses an existing geography key, no ArcGIS, QGIS, or Mapbox update is needed.

If the geography key is new or mismatched:

1. Add or fix the geography in ArcGIS/QGIS.
2. Export new GeoJSON into `data/geojson/raw/`.
3. Run the generator again.
4. Check the report.
5. For production, upload the regenerated `data/processed/geojson/*.geojson` layer to the matching Mapbox tileset.
