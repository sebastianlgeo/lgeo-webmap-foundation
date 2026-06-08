# Roadmap

## Phase 1: Foundation

- Clean folder structure.
- Editable project CSV.
- Project link override file.
- Generator for projects, geography index, and enriched GeoJSON.
- Configurable preview app.
- Basic search, layer toggles, popups, and project lists.

## Phase 2: Data Cleanup

- Fix geography key mismatches from `update-report.md`.
- Normalize duplicate project types, such as `Carbon and Energy Modelling` vs `Carbon & Energy Modelling`.
- Decide whether blank project types should stay `Uncategorized` or be filled.
- Add Wix links for the first batch of interactive projects.

## Phase 3: Symbology

- Finalize project type colours in `app/src/config.js`.
- Decide if point colour should represent project type, organization level, or linked/not-linked status.
- Tune point radius thresholds.
- Decide which polygon layers should be visible by default.

## Phase 4: Production Mapbox

- Upload heavy polygon layers as Mapbox tilesets if Wix performance needs it.
- Record tileset IDs and source-layer names in config.
- Test the production style in a clean browser session.

## Phase 5: Wix Integration

- Embed the map in a Wix test page.
- Set project URLs in `project_links.csv`.
- Test click-throughs.
- Confirm mobile layout inside Wix.
- Publish the stable data/config/app bundle.
