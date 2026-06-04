# LGeo Webmap Foundation

This folder is a clean starting point for the next version of the LGeo projects webmap. It separates project entry, generated map data, map styling, and Wix/Mapbox handoff decisions so future updates are less tangled.

## Folder Map

- `app/` - local preview webmap. Open this through a local server at `/app/`.
- `app/src/config.js` - colours, layer visibility, source URLs, and Mapbox settings.
- `app/src/main.js` - map behaviour, search, popups, side panel, and project links.
- `data/source/projects.csv` - editable project source table.
- `data/source/project_links.csv` - optional link/thumbnail/featured overrides.
- `data/geojson/raw/` - current exported GeoJSON from the old workflow.
- `data/processed/` - generated files used by the preview app and future website.
- `scripts/generate-webmap-data.py` - project/data generator.
- `docs/` - update workflow, data model, Mapbox/Wix notes, and roadmap.

## Daily Update Loop

1. Edit `data/source/projects.csv`.
2. Add page links in `data/source/project_links.csv` when a project should click through to Wix.
3. Run:

   ```powershell
   C:\Users\sebas\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe .\scripts\generate-webmap-data.py
   ```

4. Read `data/processed/update-report.md`.
5. Preview locally:

   ```powershell
   C:\Users\sebas\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m http.server 5173
   ```

6. Open `http://localhost:5173/app/`.

## Current State

The first generated pass has:

- 245 public projects.
- 37 suppressed projects skipped.
- 7 processed GeoJSON layers.
- A few geography key mismatches called out in `data/processed/update-report.md`.

The preview app is ready for Mapbox token testing. Add a token in the in-app prompt, or set `window.LGEO_MAPBOX_TOKEN` before loading the app in Wix.
