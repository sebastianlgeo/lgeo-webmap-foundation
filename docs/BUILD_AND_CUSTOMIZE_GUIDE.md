# Build And Customize The LGeo Webmap

This guide walks through the practical steps for turning the foundation folder into the finished website map.

## 1. Start With The Preview App

Open:

- `app/index.html`
- `app/src/config.js`
- `app/src/main.js`

Most day-to-day customization should happen in `app/src/config.js`. Avoid editing `app/src/main.js` unless you want to change behaviour.

To preview locally, run this from the `lgeo-webmap-foundation` folder:

```powershell
C:\Users\sebas\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m http.server 5173
```

Then open:

```text
http://localhost:5173/app/
```

## 2. Add A Mapbox Token

The map will not draw unless Mapbox has a public access token.

For local testing, open the preview page and paste the token into the token prompt. The browser stores it locally.

For a more permanent local setup, open:

```text
app/src/config.js
```

Find:

```js
mapbox: {
  accessToken: "",
```

Change it to:

```js
mapbox: {
  accessToken: "pk.your_public_mapbox_token_here",
```

Use a public `pk...` Mapbox token only. Do not put a secret token in website code.

For Wix, the better option is usually to define the token in the embed/page before the app loads:

```html
<script>
  window.LGEO_MAPBOX_TOKEN = "pk.your_public_mapbox_token_here";
</script>
```

## 3. Change The Basemap Style

Open:

```text
app/src/config.js
```

Find:

```js
styleUrl: "mapbox://styles/mapbox/light-v11",
```

Replace it with your Mapbox style URL, for example:

```js
styleUrl: "mapbox://styles/your-mapbox-user/your-style-id",
```

This controls the background map: roads, water, labels, land colours, etc.

## 4. Change General Map Colours

Open:

```text
app/src/config.js
```

Find:

```js
theme: {
  defaultPointColor: "#2563eb",
  linkedPointColor: "#be3455",
  polygonFillColor: "#3f7f42",
  polygonLineColor: "#2d5d31",
  labelColor: "#172026"
},
```

What each one means:

- `defaultPointColor` - ordinary point colour.
- `linkedPointColor` - point colour when at least one project has a clickable URL.
- `polygonFillColor` - fallback polygon fill.
- `polygonLineColor` - polygon outline.
- `labelColor` - map label text.

Use hex colours like `#2563eb`.

## 5. Change Project Type Colours

Open:

```text
app/src/config.js
```

Find:

```js
projectTypeColors: {
```

This section controls the sidebar legend and can later drive point colours by project type.

Example:

```js
"Urban Simulation": "#2563eb",
"Remote Sensing": "#be3455",
"Uncategorized": "#65727c"
```

If a new project type appears in the CSV and is not listed here, it falls back to `Uncategorized`.

## 6. Change Layer Colours And Visibility

Open:

```text
app/src/config.js
```

Find:

```js
layers: [
```

Each layer has this shape:

```js
{
  id: "MunicipalLevelPoints",
  label: "Municipal points",
  kind: "point",
  file: "MunicipalLevelPoints.geojson",
  color: "#be3455",
  defaultVisible: true
}
```

What to change:

- `label` - how the layer appears in the sidebar.
- `color` - colour for that layer.
- `defaultVisible` - whether it starts turned on.

Leave these alone unless you are changing filenames or code:

- `id`
- `kind`
- `file`

## 7. Add Or Update Projects

Open:

```text
data/source/projects.csv
```

Add/edit project rows here.

Important columns:

- `Project Number`
- `Project Year`
- `Project Name`
- `Project Type`
- `Suppress`
- `Display National`
- `Display Provincial`
- `Display Regional`
- `Display Municipal`
- `Geography National`
- `Geography Provincial`
- `Geography Regional`
- `Geography Municipal`
- `Polygon National`
- `Polygon Provincial`
- `Polygon Regional`
- `Polygon Municipal`
- `Primary Geography`

If `Suppress` starts with `Yes`, the generator skips that project. Fill a `Display ...` column with `Yes` only where the project should count/show on the map.

## 8. Make A Project Click Through To A Wix Page

Open:

```text
data/source/project_links.csv
```

Add a row like:

```csv
Project Number,Project Name,Project URL,Project Page Slug,Thumbnail URL,Featured,Interactive,Primary Geography,Map Notes,Symbology Override
25001,Example Project,https://www.example.com/project-page,,,Yes,Yes,Vancouver,,
```

The key field is `Project Number`. It must match the project number in `projects.csv`.

Use:

- `Project URL` for a full Wix page link.
- `Project Page Slug` if you want the generator to make `/projects/my-project-slug`.
- `Primary Geography` if the project should zoom to a specific place.
- `Interactive` as `Yes` when you want the project treated as clickable.
- `Featured` as `Yes` when it should appear as a highlighted example near the top of popup lists.

## 9. Regenerate Data After Edits

Run this from the `lgeo-webmap-foundation` folder:

```powershell
C:\Users\sebas\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe .\scripts\generate-webmap-data.py
```

This updates:

- `data/processed/projects.json`
- `data/processed/geography-index.json`
- `data/processed/geojson/*.geojson`
- `data/processed/geography-bounds.json`
- `data/processed/contractsList.generated.js`
- `data/processed/update-report.md`

Do not hand-edit files in `data/processed`; they are generated.

## 10. Read The Update Report

Open:

```text
data/processed/update-report.md
```

Check:

- Are there missing geography keys?
- Did all layers match expected features?
- Are project type names consistent?
- Are there typos in geography names?

If a project does not show up where expected, the problem is usually a mismatch between a `Geography ...` or `Polygon ...` field in `projects.csv` and a key in the GeoJSON.

## 11. When You Need Mapbox Tilesets

The local preview uses GeoJSON files. That is good for tinkering.

For the final Wix site, large polygon layers may perform better as Mapbox tilesets.

Use Mapbox when:

- The map is slow in Wix.
- Polygon files are too large.
- You want styling managed inside Mapbox Studio.

Keep local GeoJSON while designing. Move to Mapbox tilesets when the data and styling are stable.

## 12. Suggested Build Order

1. Add your Mapbox public token.
2. Confirm the preview map loads.
3. Pick a basemap style.
4. Tune layer colours in `app/src/config.js`.
5. Clean project types in `projects.csv`.
6. Add a few Wix project links in `project_links.csv`.
7. Run the generator.
8. Check `update-report.md`.
9. Test popups and project links.
10. Decide whether big layers should stay GeoJSON or move to Mapbox tilesets.
11. Embed the app in a Wix test page.
12. Iterate on styling and interaction.

## 13. Quick File Cheat Sheet

- Change colours: `app/src/config.js`
- Change basemap: `app/src/config.js`
- Change layer defaults: `app/src/config.js`
- Add/edit projects: `data/source/projects.csv`
- Add clickable Wix links: `data/source/project_links.csv`
- Regenerate data: `scripts/generate-webmap-data.py`
- Check problems: `data/processed/update-report.md`
- Change UI behaviour: `app/src/main.js`
- Change layout/style: `app/styles.css`
