# LGeo Webmap Foundation

## Folder Map

- `app/` - local preview webmap. Open this through a local server at `/app/`.
- `app/src/config.js` - colours, layer visibility, source URLs, and Mapbox settings.
- `app/src/main.js` - map behaviour, search, popups, side panel, and project links.
- `data/source/projects.csv` - editable project source table.
- `data/source/project_links.csv` - optional link/thumbnail/featured overrides.
- `data/geojson/raw/` - local-only editable GeoJSON exports for point/polygon geometry.
- `data/processed/` - generated files used by the preview app and future website.
- `scripts/generate-webmap-data.py` - project/data generator.
- `scripts/import-missing-boundaries.py` - repeatable importer for selected missing admin polygons.
- `scripts/update-webmap.ps1` - one-command helper for generating data and optionally publishing Mapbox layers.
- `docs/` - update workflow, data model, Mapbox/Wix notes, and roadmap.

## Daily Update Loop

For full project-entry instructions, start with `docs/ADD_PROJECTS_GUIDE.md`.

1. Edit `data/source/projects.csv`.
2. Add page links in `data/source/project_links.csv` when a project should click through to Wix.
3. Run:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\update-webmap.ps1
   ```

4. Read `data/processed/update-report.md`.
5. If geometry changed, publish the regenerated local GeoJSONs to Mapbox:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\update-webmap.ps1 -Upload All -WaitForCompletion
   ```

6. If a needed admin polygon is missing, update `scripts/import-missing-boundaries.py`, run it, then repeat steps 3-5.

7. Preview locally:

   ```powershell
   C:\Users\sebas\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m http.server 5173
   ```

8. Open `http://localhost:5173/app/`.

## Current State

The current generated pass has:

- 244 public projects.
- 38 suppressed projects skipped.
- 7 processed GeoJSON layers.
- A few geography key mismatches called out in `data/processed/update-report.md`.

The app uses Mapbox vector tilesets for geometry in production. Raw and processed GeoJSON files are ignored by Git so large geometry and local edit working copies do not ship through GitHub Pages.
