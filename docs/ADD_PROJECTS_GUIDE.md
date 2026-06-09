# Add Projects To The Webmap

This is the everyday guide for adding or updating projects in the LGeo webmap. It assumes you have access to the repo and the private local `data/source/` files.

Do not commit `data/source/`, `data/geojson/raw/`, `data/processed/geojson/`, or `secrets/*.env`. Those can contain private project data, large geometry, or tokens.

## 1. Choose The Right Update Type

Use this quick decision tree before editing:

| Change | Edit | Regenerate | Upload to Mapbox |
| --- | --- | --- | --- |
| Add a project in existing places | `data/source/projects.csv` | Yes | Points only |
| Add or change a project page link | `data/source/project_links.csv` | Yes | Points only |
| Move an orange count point | `data/config/point-coordinate-overrides.json` | Yes | Points only |
| Rename a geography key | `data/source/projects.csv` and possibly raw GeoJSON | Yes | Changed point/polygon layers |
| Add a missing polygon | `data/geojson/raw/*.geojson` | Yes | Polygons and usually points |

If you are unsure whether geometry changed, run the update first without uploading and read `data/processed/update-report.md`.

## 2. Add The Project Row

Open:

```text
data/source/projects.csv
```

Add one row per project.

Required fields:

| Column | What to enter |
| --- | --- |
| `Project Number` | Unique project number. This is also the link join key. |
| `Project Year` | Year shown in popups. |
| `Project Name` | Public-facing title. |
| `Project Type` | Used by the sidebar toggles. Reuse an existing type where possible. |
| `Client/Project Level` | Municipal Government, Regional Government, Provincial Government, Private Company, etc. |
| `Suppress` | `Yes` for anything that must not appear publicly. Otherwise use `No`. |

Recommended helper fields:

| Column | What to enter |
| --- | --- |
| `Primary Geography` | The most specific geography people would expect to click/search. |
| `Source Notes` | Any uncertainty, missing polygon notes, or naming decisions. |
| `PM/Prime LGeo Contact` | Internal owner if useful. |
| `Description` | Optional popup/support text for future use. |

## 3. Set Display Levels

The display columns decide where a project counts:

```text
Display National
Display Provincial
Display Regional
Display Municipal
```

Use `Yes` for every level where the project should appear. Leave blank or use `No` where it should not.

Examples:

| Project type | National | Provincial | Regional | Municipal |
| --- | --- | --- | --- | --- |
| BC-wide provincial work | Yes | Yes | No | No |
| Metro Vancouver regional work | Yes | Yes | Yes | No |
| City of Victoria municipal work | Yes | Yes | Yes | Yes |
| Private/suppressed work | Any | Any | Any | Any, with `Suppress = Yes` |

Avoid filling lower levels just because you know the location. Only fill lower levels when the project should count there.

## 4. Fill Geography Labels

Geography columns control orange count points, popup titles, hover labels, and search results:

```text
Geography National
Geography Provincial
Geography Regional
Geography Municipal
```

Use consistent canonical names. Examples:

| Scale | Good examples |
| --- | --- |
| National | `Canada`, `United States`, `Mexico` |
| Provincial/state | `British Columbia`, `Alberta`, `Ontario`, `Sinaloa` |
| Regional | `Metro Vancouver Regional District - British Columbia`, `Capital Regional District - British Columbia`, `Mazatlan` |
| Municipal | `Victoria`, `Langley - Township`, `North Vancouver - District`, `City Of Toronto - Ontario` |

Do not create near-duplicates. For example, do not mix `Toronto`, `Toronto - Ontario`, and `City Of Toronto - Ontario` for the same intended geography. Pick the existing canonical name.

## 5. Fill Polygon Keys

Polygon columns control which polygon receives the count:

```text
Polygon National
Polygon Provincial
Polygon Regional
Polygon Municipal
```

Often the polygon key is the same as the geography label, but not always.

Common examples:

| Geography label | Polygon key |
| --- | --- |
| `Metro Vancouver Regional District - British Columbia` | `MVRD` |
| `Capital Regional District - British Columbia` | `CAPRD` |
| `Regional District of Nanaimo - British Columbia` | `RDN` |
| `British Columbia` | `British Columbia` |
| `Langley - Township` | `Langley - Township` |

If you do not know the polygon key, fill the geography label, leave the polygon field blank, add a note in `Source Notes`, then run the generator and check the missing polygon section in `data/processed/update-report.md`.

## 6. Add Project Page Links

For project example links, open:

```text
data/source/project_links.csv
```

Add or update a row using `Project Number`.

Useful columns:

| Column | What it does |
| --- | --- |
| `Project Number` | Joins to `projects.csv`. Required. |
| `Project URL` | Makes the popup project item clickable. Use full Wix URL, including anchors. |
| `Featured` | Use `Yes` to float the item near the top of popup lists. |
| `Interactive` | Use `Yes` for linked/highlighted examples. |
| `Primary Geography` | Optional override for link-related display logic. |

The link sheet is intentionally separate so a person can add Wix links without touching the full project list.

## 7. Move Count Points

Count icon coordinates are controlled here:

```text
data/config/point-coordinate-overrides.json
```

Use exact `NameKey` text and `[longitude, latitude]` order:

```json
{
  "British Columbia": [-122.40530713641914, 52.041875796289744],
  "North Vancouver - District": [-123.01100108449386, 49.34994948919645]
}
```

After changing this file, regenerate and upload points.

## 8. Regenerate Data

From the repo root, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\update-webmap.ps1
```

This runs the generator and writes the public app data in `data/processed/`.

Open:

```text
data/processed/update-report.md
```

Check:

- Missing geography keys.
- Missing polygon keys.
- Duplicate or suspicious names.
- Unexpected project type spelling.
- Layer match counts.
- Suppressed project count.

Do not hand-edit files in `data/processed/`; they are generated and will be overwritten.

## 9. Add Or Fix Missing Geometry

If the report says a point or polygon is missing, use this order:

1. Confirm the intended geography name in `projects.csv`.
2. Check whether an existing raw GeoJSON feature already has the same place under a different `NameKey`.
3. If the feature exists with the wrong name, rename its `NameKey` in the raw GeoJSON or GIS source.
4. If the feature does not exist, add/export it into the matching raw GeoJSON file:

   ```text
   data/geojson/raw/NationalLevelPoints.geojson
   data/geojson/raw/ProvincialLevelPoints.geojson
   data/geojson/raw/RegionalLevelPoints.geojson
   data/geojson/raw/MunicipalLevelPoints.geojson
   data/geojson/raw/ProvincialLevelPolygons.geojson
   data/geojson/raw/RegionalLevelPolygons.geojson
   data/geojson/raw/MunicipalLevelPolygons.geojson
   ```

5. Run the generator again.
6. Recheck `data/processed/update-report.md`.

The app reads Mapbox tilesets in production, but raw GeoJSON is the local source of truth for geometry. Mapbox should be treated as the published copy, not the only copy.

## 10. Upload To Mapbox

If only projects, links, counts, or point locations changed, publish points:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\update-webmap.ps1 -Upload Points -WaitForCompletion
```

If polygons changed, publish polygons:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\update-webmap.ps1 -Upload Polygons -WaitForCompletion
```

If both changed, publish everything:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\update-webmap.ps1 -Upload All -WaitForCompletion
```

The upload script uses:

```text
secrets/mapbox.env
```

That file must exist locally and must not be committed.

## 11. Preview Locally

Start a local server from the repo root:

```powershell
& 'C:\Users\sebas\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m http.server 5173
```

Open:

```text
http://localhost:5173/app/
```

If the map still shows old tiles after a Mapbox publish, hard refresh Chrome with `Ctrl + Shift + R`.

## 12. Commit Only Public-Safe Files

Safe to commit:

```text
app/
data/config/
data/processed/app-data.generated.js
data/processed/geography-bounds.json
data/processed/geography-index.json
data/processed/manifest.json
data/processed/projects.json
data/processed/update-report.json
data/processed/update-report.md
docs/
scripts/
```

Do not commit:

```text
data/source/
data/geojson/raw/
data/processed/geojson/
secrets/*.env
```

Before committing, run:

```powershell
git status --short
```

Make sure private source files and raw/processed GeoJSON are not staged.

## 13. Common Fixes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Project is missing | `Suppress = Yes`, missing display level, or generator not run | Check source row, regenerate |
| Popup has wrong place | Wrong `Geography ...` field | Fix geography label, regenerate |
| Polygon does not appear | Wrong or missing `Polygon ...` key | Fix key or add polygon, regenerate, upload polygons |
| Count is in awkward spot | Point coordinate needs override | Edit `data/config/point-coordinate-overrides.json`, regenerate, upload points |
| New link does not appear | `project_links.csv` project number mismatch | Match `Project Number`, regenerate |
| Mapbox still looks old | Publish still processing or browser cache | Use `-WaitForCompletion`, then `Ctrl + Shift + R` |
