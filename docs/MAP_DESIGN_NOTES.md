# Map Design Notes

These notes capture the current design direction: clean embedded webmap, LGeo colours, project counts as the main visual signal, and details only on click.

## Overall Style Direction

Use the attached Lower Mainland project map as the visual reference:

- Warm off-white interface panels.
- Deep teal for main project geography.
- Muted aqua for regional/provincial geography.
- Warm orange for emphasis, active controls, outlines, and linked-project treatment.
- Minimal UI because Wix will provide the surrounding page content.

The map should feel like a refined interactive version of a designed LGeo map, not like a generic GIS dashboard.

## Symbology

The map uses one project-count symbol:

- Orange circle with number: geography has projects.

The number inside the symbol is the current project count after filters are applied.

Project type filters change the counts dynamically. For example, if only `Remote Sensing` is active, the circles show only remote-sensing project totals.

Project example links live in popups, not as separate map icons. Mark a project as `Featured` in `data/source/project_links.csv` to pin it near the top of popup lists with a blue visual treatment. Add `Project URL` later when the example page is ready.

## Zoom Behaviour

The map swaps visible geography levels by zoom:

- Far out: national points.
- Mid scale: provincial/state points and polygons.
- Closer: regional points and polygons.
- Close in: municipal points and polygons.

Edit this in:

```text
app/src/config.js
```

Look for each layer's:

```js
minzoom
maxzoom
```

If the split feels too early or too late, adjust those numbers.

Current handoff thresholds are set so two geography levels do not intentionally overlap:

- National: `0` to `3.7`
- Provincial/state: `3.7` to `5.8`
- Regional: `5.8` to `7.8`
- Municipal: `7.8` and closer

Polygon and count handoff has one exception: a provincial or regional polygon and its count circle can continue beyond normal `maxzoom` when there is no lower-level project polygon/point to replace it. This keeps polygon-level work visible for places without municipal or regional project geometries, while dense areas such as Metro Vancouver still hand off to lower-level features.

Point layers use a small fade overlap controlled by:

```js
zoomTransition: 0.3
```

Increase this slightly for a softer handoff between regional and municipal count centers; decrease it for a sharper GIS-style switch.

The map is also bounded to a North America extent in `app/src/config.js`:

```js
maxBounds: [[-142, 7], [-47, 74]]
```

Change those coordinates only if you want users to pan farther outside North America.

Startup framing is controlled separately:

```js
startupBounds: [[-142, 7], [-47, 74]]
```

The app fits to this box on load and when the reset button is clicked. Tighten it if the map feels too zoomed out; expand it if projects near the edges feel cramped.

Country click/search framing is controlled with explicit country bounds in `app/src/config.js`:

```js
countryBounds: {
  Canada: [[-141, 41.5], [-52, 70]],
  Mexico: [[-118.5, 14], [-86.5, 33]],
  "United States": [[-125, 24], [-66, 50]]
},
countryMinZoom: {
  Canada: 3.75,
  Mexico: 3.75,
  "United States": 3.75
}
```

Adjust these if a country zoom feels too tight or too loose. These bounds are used instead of the country point centroid. `countryMinZoom` makes the camera zoom in far enough for the provincial/state layer handoff.

## Region Search

The top-left search reads from `data/processed/geography-index.json`.

Typing a region/geography name shows matching regions with active-filter project counts. Selecting a national result zooms into the country only. Selecting a provincial/state, regional, or municipal result opens the same click popup used by map symbols when matching projects exist.

Search labels are cleaned for readability. For example, `Vancouver - British Columbia` displays as `Vancouver`, and duplicate display names are collapsed so the user does not see both versions.

National geographies act as drill-down targets only. Popups are available at all lower admin levels: provincial/state, regional, and municipal.

Geography matching ignores accents, so source differences like `Mazatlan` and `Mazatlán` still resolve to the same project list. Some source names can also be linked in `geographyAliases` inside `app/src/config.js`; for example, `Toronto - Ontario` and `City Of Toronto - Ontario` are treated as one project geography so the municipal point keeps the original count of 5 projects.

If a region does not appear in search, check:

- Whether it has projects after active filters.
- Whether its spelling matches the geography index.
- Whether it was suppressed in `data/source/projects.csv`.

Popups are scrollable and show all matching projects.

## Polygon Recommendations

For a polished web map, polygons should support the circles instead of competing with them.

Recommended defaults:

- Provincial polygons: pale aqua fill, medium outline, visible at mid zoom.
- Regional polygons: slightly stronger aqua fill, clear outline, visible at regional zoom.
- Municipal polygons: deep teal fill only if zoomed close; otherwise use outlines or very low opacity.

Avoid using a full polygon legend unless the polygon colours represent categories. Here they are mostly geographic context.

If the map feels busy:

1. Reduce polygon opacity first.
2. Make municipal polygons outline-only.
3. Keep project-count symbols visually dominant.

## Mapbox Colour Recommendations

For the Mapbox basemap, use:

- Land: warm grey/off-white.
- Water: muted blue-grey.
- Roads: low-contrast warm grey.
- Labels: dark charcoal, not pure black.
- Parks/green space: desaturated, not bright.

Avoid high-saturation basemap colours. Project symbols and orange accents should be the visual focus.

For dark mode:

- Land: deep charcoal or blue-grey.
- Water: darker slate.
- Roads: subtle grey.
- Labels: soft off-white.
- Project symbols: keep teal/orange bright enough for contrast.

In `app/src/config.js`, paste the published dark Mapbox style here:

```js
darkStyleUrl: "mapbox://styles/your-mapbox-user/your-dark-style-id"
```

The day/current style lives here:

```js
dayStyleUrl: "mapbox://styles/lickergeospatial/cmpygp42m001v01r9gddo4abx"
```

## Office Marker

The app can highlight the LGeo office with the logo.

Open:

```text
app/src/config.js
```

Find:

```js
office: {
  enabled: false,
  name: "LGeo Office",
  coordinates: [-123.1207, 49.2827],
  logoUrl: "./assets/LGeo-logo-rgb_vert.jpg"
}
```

To turn it on:

```js
enabled: true
```

Replace `coordinates` with:

```js
[longitude, latitude]
```

Example for downtown Vancouver-ish:

```js
coordinates: [-123.1207, 49.2827]
```

Send me the real office longitude/latitude and I can wire it precisely.

## File Explorer / Chrome Opening

Opening `app/index.html` directly from File Explorer used to fail because browsers block local `fetch()` calls from `file://` pages.

The generator now creates:

```text
data/processed/app-data.generated.js
```

`app/index.html` loads this bundle before the main map code. If local fetch fails, the app falls back to the bundled data.

For the best testing experience, still use a local server:

```powershell
C:\Users\sebas\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m http.server 5173
```

Then open:

```text
http://localhost:5173/app/
```
