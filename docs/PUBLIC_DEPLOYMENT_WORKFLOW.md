# Public Deployment Workflow

Use this workflow when adding projects without publishing sensitive project-list details to GitHub.

## Private Files

Keep these local only:

- `data/source/projects.csv`
- `data/source/project_links.csv`
- `data/source/projects_pre_reboot_*.csv`
- any draft/internal project spreadsheets

These source tables may include suppressed projects, internal notes, incomplete URLs, or projects that should not appear publicly. They are ignored by Git through `.gitignore`.

## Public Files

These are safe to publish after generation and review:

- `app/`
- `data/processed/projects.json`
- `data/processed/geography-index.json`
- `data/processed/app-data.generated.js`
- `data/processed/geography-bounds.json`
- `data/processed/geojson/*.geojson`
- `docs/`
- `scripts/`

The generator skips rows where `Suppress` is truthy. Values such as `Yes`, `yes`, and `yes for now` suppress the project.

## Add Or Update Projects

1. Edit `data/source/projects.csv` locally.
2. Use `Suppress = Yes` for any project that should not be public.
3. Fill the display and geography columns only for levels where the project should count.
4. For a project that should link to a Wix page, add or update its row in `data/source/project_links.csv`.
5. Run:

   ```powershell
   C:\Users\sebas\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe .\scripts\generate-webmap-data.py
   ```

6. Open `data/processed/update-report.md`.
7. Check the generated public files before committing.

## Privacy Checklist Before Commit

Run:

```powershell
git status --short
```

Do not commit:

- anything under `data/source/`
- source spreadsheets with suppressed/internal projects
- one-off exports that contain private project rows

Do commit:

- changed app files
- changed generated public files in `data/processed/`
- docs and scripts

If `data/source/` appears in `git status`, stop and check `.gitignore` before committing.

## Suppressed Project Check

Search generated public outputs for a suppressed project number or name before pushing:

```powershell
rg "PROJECT_NUMBER_OR_PRIVATE_NAME" data/processed app
```

If anything private appears in `data/processed/`, fix the source `Suppress` value and regenerate.

## GitHub Pages Publishing

GitHub Pages should serve only the public static app and processed data. The source CSVs should remain on your local machine or in a private storage location such as OneDrive.

Recommended public structure on GitHub:

```text
app/
data/processed/
docs/
scripts/
README.md
```

Do not rely on GitHub as the authoritative project database unless the repository is private.

## Deployment Rhythm

Use this rhythm when the map is live:

1. Update private source CSVs locally.
2. Generate processed public data.
3. Review the report.
4. Preview locally.
5. Commit only public outputs.
6. Upload changed polygon GeoJSON to Mapbox tilesets if geometry or counts changed.
7. Publish the GitHub Pages update.
8. Cache-bust the Wix iframe URL if needed.
