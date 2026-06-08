# Mapbox And Wix Handoff

## What Lives Locally

Local files are best for:

- Project entry.
- Data validation.
- Colour and symbology experiments.
- Local preview.
- Generating `projects.json`, `geography-index.json`, and enriched GeoJSON.

## What Lives In Mapbox

Mapbox is best for:

- Basemap style.
- Production tilesets for large polygon layers.
- Layer IDs and source-layer names once the production map is stable.

The current local preview uses GeoJSON directly through `data.useLocalGeojson = true` in `app/src/config.js`. That is good for tinkering because source-sheet fixes show up immediately after running the generator.

For production, switch back to the Mapbox vector tilesets after the processed GeoJSON has been uploaded. The app already supports the swap: the layer objects in `app/src/config.js` contain `tilesetUrl` and `sourceLayer` values, and `data.useLocalGeojson` controls whether the app loads local GeoJSON or those vector tiles.

## What Lives In Wix

Wix is best for:

- Project detail pages.
- Site navigation.
- The embedded map container.
- Page-level SEO/content.

The map should receive project page links through `Project URL` or `project_links.csv`. The map should not hard-code Wix page URLs inside `main.js`.

## Embed Direction

For a Wix embed, the cleanest path is:

1. Host generated data somewhere stable, such as GitHub Pages, jsDelivr, or Wix static files.
2. Host or paste the app bundle into Wix.
3. Define `window.LGEO_MAPBOX_TOKEN` before the app runs, or pass the token through the hosted page setup you already created.
4. Point `app/src/config.js` data URLs at the hosted `data/processed` files.

## Publishing Checklist

- Run the generator.
- Review `data/processed/update-report.md`.
- Confirm project links open the right Wix pages.
- Confirm any new geography keys have matching points/polygons.
- Confirm Mapbox token and style URL.
- Confirm large layers are not too slow in the target Wix embed.

## Recommended Hosting Setup

Best production setup:

- Mapbox hosts the basemap style and large vector polygon tilesets.
- GitHub Pages hosts this static webmap app and the generated JSON files.
- Wix hosts the main website, project pages, images, navigation, SEO content, and an iframe that embeds the hosted map.

This is cleaner than trying to make Wix host everything. Wix is excellent for the main site and project pages, but this map is a custom JavaScript app with generated data files and Mapbox dependencies. Keeping the app as static files on GitHub Pages makes versioning, cache-busting, rollback, and testing much easier. Wix can still host project images and project pages; the map only needs the final Wix project URLs in `data/source/project_links.csv`.

Can everything be hosted on Wix? Technically, parts of it can. You can embed HTML/code in Wix, and you may be able to upload some static assets, but it becomes harder to maintain because the app has multiple JS/CSS/data files and wants predictable relative paths. Use Wix for the visible site, not as the build/deployment system for the map.

Use GitHub Pages if you want the simplest static hosting. Use a paid static host such as Netlify, Cloudflare Pages, or Vercel only if you want preview deployments, custom headers, or easier CI later.

## Chrome Cache During Small Edits

When testing locally, Chrome can hold onto old JS/CSS even after you save changes.

Fast manual options:

1. Press `Ctrl+F5` or `Ctrl+Shift+R` on the map page.
2. Open DevTools with `F12`, right-click the reload button, then choose `Empty Cache and Hard Reload`.
3. In DevTools, open `Network`, check `Disable cache`, then reload. This only works while DevTools is open.
4. Add a cache-bust query string when opening the app, for example `http://localhost:5173/app/?v=test-20260604`.

For files referenced by `index.html`, update the query strings when needed:

```html
<link rel="stylesheet" href="./styles.css?v=20260604-dark-polys" />
<script src="./src/config.js?v=20260604-dark-polys"></script>
<script src="./src/main.js?v=20260604-dark-polys"></script>
```

Use a new value after small CSS/JS edits if Chrome is stubborn.

## 10. Move Layers To Mapbox Tilesets

Goal: move heavy generated map layers out of local GeoJSON and into Mapbox vector tiles, while keeping project and popup data easy to regenerate locally.

Before uploading, put the real Mapbox secret token in the local-only file:

```text
secrets/mapbox.env
```

That file is ignored by Git. Use `secrets/mapbox.env.example` as the template. In PowerShell, load it into the current session with:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\load-mapbox-env.ps1
```

The loader sets both `MAPBOX_SECRET_TOKEN` and `MAPBOX_ACCESS_TOKEN` for tools that expect the standard Mapbox environment variable.

To upload all generated point and polygon layers to stable Mapbox tilesets, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\upload-mapbox-tilesets.ps1
```

The script publishes these tilesets:

- `lickergeospatial.lgeo-national-points`
- `lickergeospatial.lgeo-provincial-points`
- `lickergeospatial.lgeo-regional-points`
- `lickergeospatial.lgeo-municipal-points`
- `lickergeospatial.lgeo-provincial-polygons`
- `lickergeospatial.lgeo-regional-polygons`
- `lickergeospatial.lgeo-municipal-polygons`

The source layer names are the app layer IDs, such as `RegionalLevelPoints` and `MunicipalLevelPolygons`.

Recommended tileset candidates:

- `data/processed/geojson/ProvincialLevelPolygons.geojson`
- `data/processed/geojson/RegionalLevelPolygons.geojson`
- `data/processed/geojson/MunicipalLevelPolygons.geojson`
- `data/processed/geojson/NationalLevelPoints.geojson`
- `data/processed/geojson/ProvincialLevelPoints.geojson`
- `data/processed/geojson/RegionalLevelPoints.geojson`
- `data/processed/geojson/MunicipalLevelPoints.geojson`

Keep these local at first:

- `data/processed/projects.json`
- `data/processed/geography-index.json`
- `data/processed/geography-bounds.json`

Steps:

1. Run the generator so the processed GeoJSON is current.

   ```powershell
   C:\Users\sebas\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe .\scripts\generate-webmap-data.py
   ```

2. Inspect the processed polygons in `data/processed/geojson/`. Confirm each feature has the fields the app needs, especially `NameKey`, `ProjectCount`, `HasLowerScaleReplacement`, and `PromoteFromProvince`.

3. In Mapbox Studio, open `Tilesets` and upload each polygon GeoJSON as a separate tileset. Start with Studio upload if the files are under Mapbox upload limits and upload frequency is low.

4. If Studio upload becomes limiting, switch to Mapbox Tiling Service/Tilesets CLI. The CLI flow is better for repeatable production updates:

   ```powershell
   tilesets upload-source lickergeospatial municipal-polygons .\data\processed\geojson\MunicipalLevelPolygons.geojson
   tilesets publish lickergeospatial.lgeo-municipal-polygons
   ```

   Use a Mapbox secret token with tileset write/read/list scopes for this step.

5. After publishing, note each tileset ID and source-layer name from Mapbox. The existing `layers` array in `app/src/config.js` already has this shape:

   ```js
   {
     id: "MunicipalLevelPolygons",
     sourceType: "vector",
     tilesetUrl: "mapbox://lickergeospatial.example",
     sourceLayer: "MunicipalLevelPolygons"
   }
   ```

6. Add the real tileset IDs and source-layer names to the matching layer objects in `app/src/config.js`.

7. After all tilesets are published and the IDs are correct, set:

   ```js
   data: {
     useLocalGeojson: false
   }
   ```

   Keep `useLocalGeojson: true` while testing source CSV changes locally. If you switch too early, the browser will show stale Mapbox tiles until those tilesets are republished.

8. Confirm visual order. In dark mode, the app polygon overlay should use the warm orange palette from `darkTheme`; light mode should keep the current teal palette. If the polygons appear buried under the basemap, make sure the app adds polygon layers after the Mapbox style loads.

9. Test these zoom handoffs after the tileset swap:

   - New Brunswick disappears and Fredericton appears with no blank range.
   - Nova Scotia hands off to HRM.
   - HRM persists at high zoom because it is the smallest polygon available.
   - Metro Vancouver regional polygons disappear when municipal polygons are visible.

10. Keep the original GeoJSON exports in `data/geojson/raw/` and generated outputs in `data/processed/geojson/`. Mapbox tilesets should be treated as deployment artifacts, not the only source of truth.

Count icon placement comes from the point layers, not the polygon layers. For production, adjust awkward count locations such as British Columbia or Alberta by moving the corresponding point features in the point source data before uploading the Mapbox tilesets. Avoid runtime pixel offsets unless they are absolutely necessary, because offsets can be harder to keep consistent across zoom levels and devices.

## 11. Embed The App In A Wix Test Page

Goal: create a low-risk Wix test page that embeds the hosted map before replacing anything public.

Recommended route:

1. Publish the static app somewhere HTTPS-accessible. Best first choice: GitHub Pages.

   Suggested repo layout:

   ```text
   /
   app/
   data/processed/
   ```

   The iframe URL should look like:

   ```text
   https://your-org.github.io/lgeo-webmap-foundation/app/
   ```

2. In `app/src/config.js`, use hosted data URLs if the relative paths do not work after publishing:

   ```js
   data: {
     projectsUrl: "https://your-org.github.io/lgeo-webmap-foundation/data/processed/projects.json",
     geographyIndexUrl: "https://your-org.github.io/lgeo-webmap-foundation/data/processed/geography-index.json",
     geojsonBaseUrl: "https://your-org.github.io/lgeo-webmap-foundation/data/processed/geojson/"
   }
   ```

3. In Wix, create a hidden or test page, for example `/project-map-test`.

4. Add an HTML iframe/embed element to the page.

5. Set the iframe source to the hosted app URL.

   ```html
   <iframe
     src="https://your-org.github.io/lgeo-webmap-foundation/app/?v=test-1"
     style="width:100%;height:760px;border:0;"
     loading="lazy"
     title="LGeo project map">
   </iframe>
   ```

6. Size the Wix section around the map:

   - Desktop: 700-850 px tall is a good starting range.
   - Tablet/mobile: use a shorter height only if the surrounding page has project cards below it.
   - Remove extra Wix padding around the iframe if the map should feel embedded into the page layout.

7. Test the iframe on the published Wix test page, not only in the editor preview. Check:

   - Map loads over HTTPS.
   - Dark mode toggles.
   - Search opens the correct region.
   - Project links navigate to the correct Wix project sections.
   - HQ logo appears only at Vancouver zoom.
   - HQ game popup sits above the logo.

8. If you see old behavior, cache-bust the iframe URL:

   ```html
   src="https://your-org.github.io/lgeo-webmap-foundation/app/?v=test-2"
   ```

9. Once the test page is approved, embed the same iframe on the real Wix page.

10. Keep images on Wix when they are part of project pages or marketing content. Keep map UI assets, like the LGeo marker logo, inside the static map app so the iframe has everything it needs.

11. Update `data/source/project_links.csv` with final Wix URLs as project pages go live, then regenerate and republish the static files.
