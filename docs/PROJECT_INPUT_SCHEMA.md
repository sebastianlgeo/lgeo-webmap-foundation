# Project Input Schema

This document explains the rebooted project input table. The goal is to make project entry predictable, keep sensitive rows private, and avoid duplicate map counts.

## Files

Private source files:

- `data/source/projects.csv`
- `data/source/project_links.csv`
- `data/source/PROJECT_INPUT_REBOOT_NOTES.md`

Generated public files:

- `data/processed/projects.json`
- `data/processed/geography-index.json`
- `data/processed/geojson/*.geojson`
- `data/processed/update-report.md`

## Required Columns

`Project Number`
: Unique project number. This is the join key for `project_links.csv`.

`Project Year`
: Year shown in popups.

`Project Name`
: Public-facing project title where possible.

`Project Type`
: Used by the project type toggles.

`Suppress`
: Use `Yes` for anything that should not appear publicly. Suppressed rows are excluded from generated data.

## Display Columns

Use these columns to say where the project should appear:

- `Display National`
- `Display Provincial`
- `Display Regional`
- `Display Municipal`

Use `Yes` for each level where the project should count. Leave blank or use `No` where it should not count.

The generator can still infer display from filled geographies, but explicit `Yes`/`No` values are better for new rows.

## Geography Columns

Use these columns for the visible map point, popup title, hover label, and search result:

- `Geography National`
- `Geography Provincial`
- `Geography Regional`
- `Geography Municipal`

Recommended naming:

- National: `Canada`, `United States`, or `Mexico`
- Provincial: `British Columbia`, `Alberta`, `Ontario`, etc.
- Regional: `Metro Vancouver Regional District - British Columbia`, `Capital Regional District - British Columbia`, etc.
- Municipal: `Victoria`, `City Of Toronto - Ontario`, `Port Moody`, etc.

Avoid duplicate local variants. Pick one canonical name and reuse it. For example, use `City Of Toronto - Ontario`, not both `Toronto - Ontario` and `City Of Toronto - Ontario`.

## Polygon Columns

Use these columns for polygon matching:

- `Polygon National`
- `Polygon Provincial`
- `Polygon Regional`
- `Polygon Municipal`

These values must match the point/polygon keys in the GeoJSON sources. Some regional polygons use abbreviations, such as:

- `CAPRD` for Capital Regional District
- `MVRD` for Metro Vancouver Regional District
- `RDN` for Regional District of Nanaimo

When unsure, fill the geography label first, leave a note in `Source Notes`, run the generator, and check `data/processed/update-report.md`.

## Links

Use `data/source/project_links.csv` for example project links.

If `Project URL` is filled, the matching popup item becomes a link. Project links now navigate in the same page/frame instead of opening a separate tab.

Use `Featured = Yes` for the project examples that should float toward the top of popup lists.

## Best Practice Examples

BC-level project:

```text
Display National = Yes
Display Provincial = Yes
Display Regional =
Display Municipal =
Geography National = Canada
Geography Provincial = British Columbia
Polygon National = Canada
Polygon Provincial = British Columbia
Primary Geography = British Columbia
```

CRD/Victoria project:

```text
Display National = Yes
Display Provincial = Yes
Display Regional = Yes
Display Municipal = Yes
Geography National = Canada
Geography Provincial = British Columbia
Geography Regional = Capital Regional District - British Columbia
Geography Municipal = Victoria
Polygon National = Canada
Polygon Provincial = British Columbia
Polygon Regional = CAPRD
Polygon Municipal = Victoria
Primary Geography = Victoria
```

Metro Vancouver regional project:

```text
Display National = Yes
Display Provincial = Yes
Display Regional = Yes
Display Municipal =
Geography National = Canada
Geography Provincial = British Columbia
Geography Regional = Metro Vancouver Regional District - British Columbia
Polygon National = Canada
Polygon Provincial = British Columbia
Polygon Regional = MVRD
Primary Geography = Metro Vancouver Regional District - British Columbia
```

Suppressed project:

```text
Suppress = Yes
```

The other fields can remain in the private source sheet for internal tracking, but the project will not appear in generated public files.
