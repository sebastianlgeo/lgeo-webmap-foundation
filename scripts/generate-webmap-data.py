#!/usr/bin/env python3
"""Generate webmap-ready data from the editable project CSV.

This script is intentionally plain Python so project updates do not require
ArcGIS, npm, or a build step. ArcGIS/Mapbox still matter when geometries change,
but ordinary project entries and links can be regenerated here.
"""

from __future__ import annotations

import csv
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "data" / "source"
RAW_GEOJSON_DIR = ROOT / "data" / "geojson" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"
PROCESSED_GEOJSON_DIR = PROCESSED_DIR / "geojson"

EDITABLE_PROJECTS_CSV = SOURCE_DIR / "projects.csv"
LEGACY_PROJECTS_CSV = SOURCE_DIR / "projects_legacy_20250123.csv"
PROJECT_LINKS_CSV = SOURCE_DIR / "project_links.csv"

OPTIONAL_PROJECT_COLUMNS = [
    "Project URL",
    "Project Page Slug",
    "Thumbnail URL",
    "Featured",
    "Interactive",
    "Primary Geography",
    "Map Notes",
    "Symbology Override",
]

PROJECT_LINK_COLUMNS = [
    "Project Number",
    "Project Name",
    "Project URL",
    "Project Page Slug",
    "Thumbnail URL",
    "Featured",
    "Interactive",
    "Primary Geography",
    "Map Notes",
    "Symbology Override",
]

SCALE_FIELD_OPTIONS = {
    "National": ["Geography National", "NameKeyNational"],
    "Provincial": ["Geography Provincial", "NameKeyProvincial"],
    "Regional": ["Geography Regional", "NameKeyRegional"],
    "Municipal": ["Geography Municipal", "NameKeyMunicipal"],
}

POLYGON_KEY_FIELD_OPTIONS = {
    "National": ["Polygon National", "PolygonKeyNational", "NameKeyNational"],
    "Provincial": ["Polygon Provincial", "PolygonKeyProvincial", "NameKeyProvincial"],
    "Regional": ["Polygon Regional", "PolygonKeyRegional", "PolyKeyRegional"],
    "Municipal": ["Polygon Municipal", "PolygonKeyMunicipal", "PolyKeyMunicpal"],
}

DISPLAY_FIELD_OPTIONS = {
    "National": "Display National",
    "Provincial": "Display Provincial",
    "Regional": "Display Regional",
    "Municipal": "Display Municipal",
}

EXPLICIT_GEOGRAPHY_NORMALIZATIONS = {
    "Toronto - Ontario": "City Of Toronto - Ontario",
    "Nanaimo Regional District - British Columbia": "Regional District of Nanaimo - British Columbia",
    "Squamish Lillouet Regional District": "Squamish-Lillooet Regional District - British Columbia",
    "Mazatl?n": "Mazatlan",
    "Langley - District": "Langley - Township",
    "Langley - District - British Columbia": "Langley - Township",
    "Langley - Township - British Columbia": "Langley - Township",
}

PROVINCE_SUFFIXES = [
    " - British Columbia",
    " - Alberta",
    " - Ontario",
    " - Nova Scotia",
    " - New Brunswick",
]

GEOGRAPHY_NORMALIZATIONS: dict[str, str] = {}

POINT_COORDINATE_OVERRIDES = {
    "Alberta": [-114.6, 54.65],
}

DISPLAY_NAME_OVERRIDES = {
    "Langley - Township": "Langley - Township",
    "UBC - British Columbia": "UBC",
}

POINT_POLYGON_LAYER_PAIRS = [
    ("ProvincialLevelPoints.geojson", "ProvincialLevelPolygons.geojson"),
    ("RegionalLevelPoints.geojson", "RegionalLevelPolygons.geojson"),
    ("MunicipalLevelPoints.geojson", "MunicipalLevelPolygons.geojson"),
]


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, rows: list[dict[str, str]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def clean(value: object) -> str:
    if value is None:
        return ""
    return str(value).strip()


def truthy(value: object) -> bool:
    text = clean(value).lower()
    return text in {"1", "true", "yes", "y", "x"} or text.startswith("yes ")


def falsey(value: object) -> bool:
    return clean(value).lower() in {"0", "false", "no", "n"}


def first_value(*values: object) -> str:
    for value in values:
        text = clean(value)
        if text:
            return text
    return ""


def row_first_value(row: dict[str, str], *columns: str) -> str:
    return first_value(*(row.get(column) for column in columns))


def display_enabled(row: dict[str, str], scale: str) -> bool:
    value = clean(row.get(DISPLAY_FIELD_OPTIONS[scale]))
    if value:
        return truthy(value) and not falsey(value)
    return True


def build_geography_normalizations() -> dict[str, str]:
    normalizations = dict(EXPLICIT_GEOGRAPHY_NORMALIZATIONS)
    municipal_polygons = polygon_feature_keys("MunicipalLevelPolygons.geojson")

    for path_name in ("MunicipalLevelPoints.geojson", "MunicipalLevelPolygons.geojson"):
        path = RAW_GEOJSON_DIR / path_name
        if not path.exists():
            continue

        data = json.loads(path.read_text(encoding="utf-8"))
        for feature in data.get("features", []):
            name_key = clean(feature.get("properties", {}).get("NameKey"))
            if not name_key:
                continue

            for suffix in PROVINCE_SUFFIXES:
                if name_key.endswith(suffix):
                    base_name = name_key[: -len(suffix)]
                    if base_name in municipal_polygons:
                        normalizations[name_key] = base_name
                    break

    return normalizations


def normalize_geography_key(value: object) -> str:
    text = clean(value)
    return GEOGRAPHY_NORMALIZATIONS.get(text, text)


def display_name_for_geography_key(value: object) -> str:
    key = clean(value)
    return DISPLAY_NAME_OVERRIDES.get(key, key)


def slug_to_relative_url(slug: str) -> str:
    slug = clean(slug).strip("/")
    if not slug:
        return ""
    return f"/projects/{slug}"


def ensure_editable_sources() -> None:
    if not EDITABLE_PROJECTS_CSV.exists():
        if not LEGACY_PROJECTS_CSV.exists():
            raise FileNotFoundError(f"Missing {EDITABLE_PROJECTS_CSV} and {LEGACY_PROJECTS_CSV}")

        rows = read_csv(LEGACY_PROJECTS_CSV)
        fieldnames = list(rows[0].keys()) if rows else []
        for column in OPTIONAL_PROJECT_COLUMNS:
            if column not in fieldnames:
                fieldnames.append(column)
        for row in rows:
            for column in OPTIONAL_PROJECT_COLUMNS:
                row.setdefault(column, "")
        write_csv(EDITABLE_PROJECTS_CSV, rows, fieldnames)

    if not PROJECT_LINKS_CSV.exists():
        write_csv(PROJECT_LINKS_CSV, [], PROJECT_LINK_COLUMNS)


def read_project_links() -> dict[str, dict[str, str]]:
    links: dict[str, dict[str, str]] = {}
    if not PROJECT_LINKS_CSV.exists():
        return links

    for row in read_csv(PROJECT_LINKS_CSV):
        project_number = clean(row.get("Project Number"))
        if project_number:
            links[project_number] = row
    return links


def normalize_project(row: dict[str, str], override: dict[str, str] | None) -> dict[str, object]:
    override = override or {}
    project_number = clean(row.get("Project Number"))
    slug = first_value(override.get("Project Page Slug"), row.get("Project Page Slug"))
    project_url = first_value(
        override.get("Project URL"),
        row.get("Project URL"),
        slug_to_relative_url(slug),
    )

    geographies = {}
    polygon_keys = {}
    for scale, fields in SCALE_FIELD_OPTIONS.items():
        if not display_enabled(row, scale):
            continue
        key = normalize_geography_key(row_first_value(row, *fields))
        if key and key.upper() != "N/A":
            geographies[scale] = key

    for scale, fields in POLYGON_KEY_FIELD_OPTIONS.items():
        if not display_enabled(row, scale):
            continue
        key = normalize_geography_key(row_first_value(row, *fields))
        if key and key.upper() != "N/A":
            polygon_keys[scale] = key

    project = {
        "projectNumber": project_number,
        "projectYear": clean(row.get("Project Year")),
        "projectName": clean(row.get("Project Name")),
        "projectType": clean(row.get("Project Type")),
        "projectLevel": row_first_value(row, "Client/Project Level", "Project Level"),
        "description": clean(row.get("Description")),
        "primeContact": clean(row.get("PM/Prime LGeo Contact")),
        "value": clean(row.get("Value ($)")),
        "projectUrl": project_url,
        "projectPageSlug": slug,
        "thumbnailUrl": first_value(override.get("Thumbnail URL"), row.get("Thumbnail URL")),
        "featured": truthy(first_value(override.get("Featured"), row.get("Featured"))),
        "interactive": bool(project_url)
        or truthy(first_value(override.get("Interactive"), row.get("Interactive"))),
        "primaryGeography": first_value(
            override.get("Primary Geography"),
            row.get("Primary Geography"),
            geographies.get("Municipal"),
            geographies.get("Regional"),
            geographies.get("Provincial"),
            geographies.get("National"),
        ),
        "mapNotes": first_value(override.get("Map Notes"), row.get("Map Notes")),
        "symbologyOverride": first_value(
            override.get("Symbology Override"),
            row.get("Symbology Override"),
        ),
        "geographies": geographies,
        "polygonKeys": polygon_keys,
    }
    return project


def public_projects(rows: list[dict[str, str]], links: dict[str, dict[str, str]]) -> list[dict[str, object]]:
    projects: list[dict[str, object]] = []
    for row in rows:
        if truthy(row.get("Suppress")):
            continue
        project_number = clean(row.get("Project Number"))
        projects.append(normalize_project(row, links.get(project_number)))
    return projects


def project_summary(project: dict[str, object]) -> dict[str, object]:
    return {
        "projectNumber": project["projectNumber"],
        "projectYear": project["projectYear"],
        "projectName": project["projectName"],
        "projectType": project["projectType"],
        "projectLevel": project["projectLevel"],
        "projectUrl": project["projectUrl"],
        "thumbnailUrl": project["thumbnailUrl"],
        "featured": project["featured"],
        "interactive": project["interactive"],
        "description": project["description"],
    }


def add_lookup_project(
    lookup: dict[str, dict[str, object]],
    key: str,
    scale: str,
    key_kind: str,
    project: dict[str, object],
) -> None:
    key = clean(key)
    if not key:
        return

    entry = lookup.setdefault(
        key,
        {
            "geographyName": key,
            "scales": set(),
            "keyKinds": set(),
            "projectNumbers": set(),
            "projectTypes": Counter(),
            "projectLevels": Counter(),
            "projects": [],
        },
    )

    if project["projectNumber"] in entry["projectNumbers"]:
        entry["scales"].add(scale)
        entry["keyKinds"].add(key_kind)
        return

    entry["scales"].add(scale)
    entry["keyKinds"].add(key_kind)
    entry["projectNumbers"].add(project["projectNumber"])
    entry["projectTypes"].update([clean(project["projectType"]) or "Uncategorized"])
    entry["projectLevels"].update([clean(project["projectLevel"]) or "Uncategorized"])
    entry["projects"].append(project_summary(project))


def build_geography_lookup(projects: list[dict[str, object]]) -> dict[str, dict[str, object]]:
    lookup: dict[str, dict[str, object]] = {}
    for project in projects:
        geographies = project["geographies"]
        polygon_keys = project["polygonKeys"]
        assert isinstance(geographies, dict)
        assert isinstance(polygon_keys, dict)

        for scale, key in geographies.items():
            add_lookup_project(lookup, key, scale, "point-name", project)
        for scale, key in polygon_keys.items():
            add_lookup_project(lookup, key, scale, "polygon-key", project)

    finalized: dict[str, dict[str, object]] = {}
    for key, entry in sorted(lookup.items()):
        projects_for_entry = sorted(
            entry["projects"],
            key=lambda item: (str(item.get("projectYear")), str(item.get("projectName"))),
            reverse=True,
        )
        linked_count = sum(1 for item in projects_for_entry if item.get("projectUrl"))
        project_types = [name for name, _count in entry["projectTypes"].most_common()]
        project_levels = [name for name, _count in entry["projectLevels"].most_common()]

        finalized[key] = {
            "geographyName": key,
            "scales": sorted(entry["scales"]),
            "keyKinds": sorted(entry["keyKinds"]),
            "projectCount": len(projects_for_entry),
            "linkedProjectCount": linked_count,
            "projectTypes": project_types,
            "projectLevels": project_levels,
            "topProjectType": project_types[0] if project_types else "",
            "topProjectLevel": project_levels[0] if project_levels else "",
            "projects": projects_for_entry,
        }
    return finalized


def update_geojson_layers(lookup: dict[str, dict[str, object]]) -> dict[str, object]:
    PROCESSED_GEOJSON_DIR.mkdir(parents=True, exist_ok=True)
    report_layers = []
    geojson_keys: set[str] = set()

    for path in sorted(RAW_GEOJSON_DIR.glob("*.geojson")):
        data = json.loads(path.read_text(encoding="utf-8"))
        features = data.get("features", [])
        matched_features = 0

        for feature in features:
            properties = feature.setdefault("properties", {})
            name_key = normalize_geography_key(properties.get("NameKey"))
            properties["NameKey"] = name_key
            properties["DisplayName"] = display_name_for_geography_key(name_key)
            properties.pop("Frequency", None)
            if (
                name_key in POINT_COORDINATE_OVERRIDES
                and isinstance(feature.get("geometry"), dict)
                and feature["geometry"].get("type") == "Point"
            ):
                feature["geometry"]["coordinates"] = POINT_COORDINATE_OVERRIDES[name_key]
            geojson_keys.add(name_key)
            entry = lookup.get(name_key)

            if entry:
                matched_features += 1
                project_count = int(entry["projectCount"])
                linked_count = int(entry["linkedProjectCount"])
                properties["FREQUENCY"] = project_count
                properties["ProjectCount"] = project_count
                properties["LinkedProjectCount"] = linked_count
                properties["Interactive"] = False
                properties["TopProjectType"] = entry.get("topProjectType", "")
                properties["ProjectTypes"] = ", ".join(entry.get("projectTypes", [])[:4])
            else:
                properties["ProjectCount"] = 0
                properties["LinkedProjectCount"] = 0
                properties["Interactive"] = False
                properties["TopProjectType"] = ""
                properties["ProjectTypes"] = ""

        output_path = PROCESSED_GEOJSON_DIR / path.name
        write_json(output_path, data)
        report_layers.append(
            {
                "layer": path.name,
                "featureCount": len(features),
                "matchedFeatureCount": matched_features,
                "output": str(output_path.relative_to(ROOT)).replace("\\", "/"),
            }
        )

    synthesize_missing_point_features(report_layers, geojson_keys, lookup)

    missing_geojson_keys = sorted(key for key in lookup if key and key not in geojson_keys)
    return {
        "layers": report_layers,
        "geojsonKeyCount": len(geojson_keys),
        "missingGeojsonKeys": missing_geojson_keys,
    }


def synthesize_missing_point_features(
    report_layers: list[dict[str, object]],
    geojson_keys: set[str],
    lookup: dict[str, dict[str, object]],
) -> None:
    for point_layer_name, polygon_layer_name in POINT_POLYGON_LAYER_PAIRS:
        point_path = PROCESSED_GEOJSON_DIR / point_layer_name
        polygon_path = PROCESSED_GEOJSON_DIR / polygon_layer_name
        if not point_path.exists() or not polygon_path.exists():
            continue

        point_data = json.loads(point_path.read_text(encoding="utf-8"))
        polygon_data = json.loads(polygon_path.read_text(encoding="utf-8"))
        point_features = point_data.get("features", [])
        polygon_features = polygon_data.get("features", [])

        existing_point_keys = {
            clean(feature.get("properties", {}).get("NameKey"))
            for feature in point_features
            if clean(feature.get("properties", {}).get("NameKey"))
        }
        existing_project_sets = {
            project_number_set(lookup.get(name_key))
            for name_key in existing_point_keys
        }
        existing_project_sets.discard(frozenset())
        max_fid = max(
            [int(feature.get("properties", {}).get("FID") or 0) for feature in point_features]
            or [0]
        )
        generated_count = 0

        for polygon_feature in polygon_features:
            properties = polygon_feature.get("properties", {})
            name_key = clean(properties.get("NameKey"))
            project_count = int(properties.get("ProjectCount") or 0)
            if not name_key or project_count <= 0 or name_key in existing_point_keys:
                continue
            if project_number_set(lookup.get(name_key)) in existing_project_sets:
                continue

            bounds = bounds_for_geometry(polygon_feature.get("geometry", {}))
            if not bounds:
                continue

            max_fid += 1
            generated_count += 1
            existing_point_keys.add(name_key)
            geojson_keys.add(name_key)

            point_features.append(
                {
                    "type": "Feature",
                    "properties": {
                        "FID": max_fid,
                        "NameKey": name_key,
                        "DisplayName": display_name_for_geography_key(name_key),
                        "FREQUENCY": project_count,
                        "ProjectCount": project_count,
                        "LinkedProjectCount": int(properties.get("LinkedProjectCount") or 0),
                        "Interactive": properties.get("Interactive") is True,
                        "TopProjectType": clean(properties.get("TopProjectType")),
                        "ProjectTypes": clean(properties.get("ProjectTypes")),
                        "GeneratedPoint": True,
                    },
                    "geometry": {
                        "type": "Point",
                        "coordinates": bounds["center"],
                    },
                }
            )

        if not generated_count:
            continue

        write_json(point_path, point_data)
        for layer_report in report_layers:
            if layer_report.get("layer") == point_layer_name:
                layer_report["featureCount"] = len(point_features)
                layer_report["matchedFeatureCount"] = int(layer_report["matchedFeatureCount"]) + generated_count
                layer_report["generatedPointCount"] = generated_count
                break


def project_number_set(entry: dict[str, object] | None) -> frozenset[str]:
    if not entry:
        return frozenset()
    projects = entry.get("projects", [])
    if not isinstance(projects, list):
        return frozenset()
    return frozenset(
        clean(project.get("projectNumber"))
        for project in projects
        if isinstance(project, dict) and clean(project.get("projectNumber"))
    )


def collect_geometry_coordinates(value: object, output: list[list[float]]) -> None:
    if not isinstance(value, list):
        return
    if len(value) >= 2 and isinstance(value[0], (int, float)) and isinstance(value[1], (int, float)):
        output.append([float(value[0]), float(value[1])])
        return
    for item in value:
        collect_geometry_coordinates(item, output)


def bounds_for_geometry(geometry: dict[str, object]) -> dict[str, object] | None:
    coords: list[list[float]] = []
    collect_geometry_coordinates(geometry.get("coordinates"), coords)
    if not coords:
        return None

    min_lng = min(coord[0] for coord in coords)
    min_lat = min(coord[1] for coord in coords)
    max_lng = max(coord[0] for coord in coords)
    max_lat = max(coord[1] for coord in coords)

    return {
        "bounds": [[min_lng, min_lat], [max_lng, max_lat]],
        "center": [(min_lng + max_lng) / 2, (min_lat + max_lat) / 2],
    }


def layer_id_from_filename(path: Path) -> str:
    return path.stem


def kind_and_scale_from_layer_id(layer_id: str) -> tuple[str, str]:
    kind = "polygon" if "Polygons" in layer_id else "point"
    if layer_id.startswith("National"):
        scale = "national"
    elif layer_id.startswith("Provincial"):
        scale = "provincial"
    elif layer_id.startswith("Regional"):
        scale = "regional"
    else:
        scale = "municipal"
    return kind, scale


def geometry_index_score(kind: str, scale: str) -> int:
    kind_score = 10 if kind == "polygon" else 0
    scale_score = {"municipal": 4, "regional": 3, "provincial": 2, "national": 1}.get(scale, 0)
    return kind_score + scale_score


def build_geography_bounds_index() -> dict[str, object]:
    entries: dict[str, dict[str, object]] = {}
    feature_names_by_layer: dict[str, list[str]] = {}

    for path in sorted(PROCESSED_GEOJSON_DIR.glob("*.geojson")):
        layer_id = layer_id_from_filename(path)
        kind, scale = kind_and_scale_from_layer_id(layer_id)
        data = json.loads(path.read_text(encoding="utf-8"))
        names: list[str] = []

        for feature in data.get("features", []):
            properties = feature.get("properties", {})
            name_key = clean(properties.get("NameKey"))
            geometry = feature.get("geometry")
            if not name_key or not isinstance(geometry, dict):
                continue

            names.append(name_key)
            geometry_bounds = bounds_for_geometry(geometry)
            if not geometry_bounds:
                continue

            feature_info = {
                "layerId": layer_id,
                "kind": kind,
                "scale": scale,
                "bounds": geometry_bounds["bounds"],
                "center": geometry_bounds["center"],
            }
            entry = entries.setdefault(
                name_key,
                {
                    "name": name_key,
                    "bounds": geometry_bounds["bounds"],
                    "center": geometry_bounds["center"],
                    "preferredLayerId": layer_id,
                    "preferredKind": kind,
                    "preferredScale": scale,
                    "features": [],
                },
            )
            entry["features"].append(feature_info)

            current_score = geometry_index_score(str(entry["preferredKind"]), str(entry["preferredScale"]))
            next_score = geometry_index_score(kind, scale)
            if next_score > current_score:
                entry["bounds"] = geometry_bounds["bounds"]
                entry["center"] = geometry_bounds["center"]
                entry["preferredLayerId"] = layer_id
                entry["preferredKind"] = kind
                entry["preferredScale"] = scale

        feature_names_by_layer[layer_id] = sorted(set(names))

    return {
        "entries": entries,
        "featureNamesByLayer": feature_names_by_layer,
    }


def polygon_feature_keys(layer_name: str) -> set[str]:
    path = RAW_GEOJSON_DIR / layer_name
    if not path.exists():
        return set()
    data = json.loads(path.read_text(encoding="utf-8"))
    return {
        normalize_geography_key(feature.get("properties", {}).get("NameKey"))
        for feature in data.get("features", [])
        if normalize_geography_key(feature.get("properties", {}).get("NameKey"))
    }


def build_missing_polygon_report(projects: list[dict[str, object]]) -> dict[str, list[dict[str, object]]]:
    layers = {
        "Regional": {
            "layer": "RegionalLevelPolygons.geojson",
            "keys": polygon_feature_keys("RegionalLevelPolygons.geojson"),
        },
        "Municipal": {
            "layer": "MunicipalLevelPolygons.geojson",
            "keys": polygon_feature_keys("MunicipalLevelPolygons.geojson"),
        },
    }
    missing: dict[str, dict[str, dict[str, object]]] = {"Regional": {}, "Municipal": {}}

    for project in projects:
        polygon_keys = project["polygonKeys"]
        geographies = project["geographies"]
        assert isinstance(polygon_keys, dict)
        assert isinstance(geographies, dict)

        for scale in ("Regional", "Municipal"):
            key = clean(polygon_keys.get(scale))
            geography_name = clean(geographies.get(scale))
            if not key and not geography_name:
                continue
            normalized_key = normalize_geography_key(key)
            normalized_geography_name = normalize_geography_key(geography_name)
            if normalized_key and normalized_key in layers[scale]["keys"]:
                continue
            if not normalized_key and normalized_geography_name in layers[scale]["keys"]:
                continue
            report_key = normalized_key or normalized_geography_name
            entry = missing[scale].setdefault(
                report_key,
                {
                    "polygonKey": key,
                    "displayName": geography_name or key,
                    "missingFrom": layers[scale]["layer"],
                    "issue": "missing polygon key" if not key else "polygon key not found",
                    "projectNumbers": [],
                },
            )
            entry["projectNumbers"].append(project["projectNumber"])

    return {
        scale: sorted(items.values(), key=lambda item: item["displayName"])
        for scale, items in missing.items()
    }


def write_legacy_contracts_list(projects: list[dict[str, object]]) -> None:
    legacy_rows = []
    for project in projects:
        geographies = project["geographies"]
        polygon_keys = project["polygonKeys"]
        assert isinstance(geographies, dict)
        assert isinstance(polygon_keys, dict)

        legacy_rows.append(
            {
                "Project Number": project["projectNumber"],
                "Project Year": project["projectYear"],
                "Project Name": project["projectName"],
                "Project Type": project["projectType"],
                "Project Level": project["projectLevel"],
                "NameKeyMunicipal": geographies.get("Municipal", ""),
                "NameKeyRegional": geographies.get("Regional", ""),
                "NameKeyProvincial": geographies.get("Provincial", ""),
                "NameKeyNational": geographies.get("National", ""),
                "PolyKeyMunicpal": polygon_keys.get("Municipal", ""),
                "PolyKeyRegional": polygon_keys.get("Regional", ""),
                "PM/Prime LGeo Contact": project["primeContact"],
                "Value ($)": project["value"],
                "Description": project["description"],
                "Project URL": project["projectUrl"],
                "Thumbnail URL": project["thumbnailUrl"],
                "Interactive": project["interactive"],
            }
        )

    payload = json.dumps(legacy_rows, indent=2, ensure_ascii=False)
    output = (
        "// Generated by scripts/generate-webmap-data.py\n"
        f"var contractsList = {payload};\n"
        "window.contractsList = contractsList;\n"
    )
    (PROCESSED_DIR / "contractsList.generated.js").write_text(output, encoding="utf-8")


def write_app_data_bundle(projects: list[dict[str, object]], lookup: dict[str, dict[str, object]]) -> None:
    geojson_layers = {}
    for path in sorted(PROCESSED_GEOJSON_DIR.glob("*.geojson")):
        geojson_layers[path.name] = json.loads(path.read_text(encoding="utf-8"))

    payload = {
        "projects": projects,
        "geographyIndex": lookup,
        "geojson": geojson_layers,
    }
    output = (
        "// Generated by scripts/generate-webmap-data.py\n"
        "// Lets app/index.html work from a local file:// URL when fetch() is blocked.\n"
        f"window.LGEO_WEBMAP_DATA = {json.dumps(payload, ensure_ascii=False)};\n"
    )
    (PROCESSED_DIR / "app-data.generated.js").write_text(output, encoding="utf-8")


def write_update_report(report: dict[str, object]) -> None:
    lines = [
        "# Webmap Data Update Report",
        "",
        f"Generated: {report['generatedAt']}",
        f"Public projects: {report['projectCount']}",
        f"Suppressed projects skipped: {report['suppressedProjectCount']}",
        f"Geography lookup keys: {report['geographyLookupCount']}",
        "",
        "## Layer Matches",
        "",
    ]

    for layer in report["geojson"]["layers"]:
        lines.append(
            f"- {layer['layer']}: {layer['matchedFeatureCount']} matched / {layer['featureCount']} features"
        )

    missing = report["geojson"]["missingGeojsonKeys"]
    lines.extend(["", "## Geography Keys Missing From GeoJSON", ""])
    if missing:
        lines.extend(f"- {key}" for key in missing[:200])
        if len(missing) > 200:
            lines.append(f"- ...and {len(missing) - 200} more")
    else:
        lines.append("- None")

    polygon_gaps = report.get("missingPolygons", {})
    lines.extend(["", "## Missing Project Polygons", ""])
    for scale in ("Regional", "Municipal"):
        items = polygon_gaps.get(scale, [])
        lines.extend(["", f"### {scale}", ""])
        if items:
            for item in items[:200]:
                project_numbers = ", ".join(str(number) for number in item["projectNumbers"])
                polygon_key = item["polygonKey"] or "(blank)"
                lines.append(
                    f"- {item['displayName']} (`{polygon_key}`): {item['issue']} in "
                    f"`{item['missingFrom']}`; projects: {project_numbers}"
                )
            if len(items) > 200:
                lines.append(f"- ...and {len(items) - 200} more")
        else:
            lines.append("- None")

    lines.extend(
        [
            "",
            "## Project Types",
            "",
        ]
    )
    for name, count in report["projectTypes"]:
        lines.append(f"- {name}: {count}")

    (PROCESSED_DIR / "update-report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_manifest(report: dict[str, object]) -> None:
    raw_geojson_files = sorted(
        str(path.relative_to(ROOT)).replace("\\", "/")
        for path in RAW_GEOJSON_DIR.glob("*.geojson")
    )
    processed_files = sorted(
        str(path.relative_to(ROOT)).replace("\\", "/")
        for path in PROCESSED_DIR.rglob("*")
        if path.is_file()
    )
    manifest_path = "data/processed/manifest.json"
    if manifest_path not in processed_files:
        processed_files.append(manifest_path)
        processed_files.sort()

    write_json(
        PROCESSED_DIR / "manifest.json",
        {
            "generatedAt": report["generatedAt"],
            "sourceFilesPrivate": True,
            "rawGeojsonFiles": raw_geojson_files,
            "processedFiles": processed_files,
            "projectCount": report["projectCount"],
            "geographyLookupCount": report["geographyLookupCount"],
        },
    )


def main() -> None:
    global GEOGRAPHY_NORMALIZATIONS

    ensure_editable_sources()
    GEOGRAPHY_NORMALIZATIONS = build_geography_normalizations()
    rows = read_csv(EDITABLE_PROJECTS_CSV)
    links = read_project_links()
    projects = public_projects(rows, links)
    lookup = build_geography_lookup(projects)
    geojson_report = update_geojson_layers(lookup)
    geography_bounds = build_geography_bounds_index()
    missing_polygon_report = build_missing_polygon_report(projects)

    generated_at = datetime.now(timezone.utc).isoformat()
    project_type_counts = Counter(clean(project["projectType"]) or "Uncategorized" for project in projects)
    suppressed_count = sum(1 for row in rows if truthy(row.get("Suppress")))

    write_json(PROCESSED_DIR / "projects.json", projects)
    write_json(PROCESSED_DIR / "geography-index.json", lookup)
    write_json(PROCESSED_DIR / "geography-bounds.json", geography_bounds)
    write_legacy_contracts_list(projects)
    write_app_data_bundle(projects, lookup)

    report = {
        "generatedAt": generated_at,
        "sourceCsv": str(EDITABLE_PROJECTS_CSV.relative_to(ROOT)).replace("\\", "/"),
        "projectCount": len(projects),
        "suppressedProjectCount": suppressed_count,
        "geographyLookupCount": len(lookup),
        "projectTypes": project_type_counts.most_common(),
        "geojson": geojson_report,
        "missingPolygons": missing_polygon_report,
    }
    write_json(PROCESSED_DIR / "update-report.json", report)
    write_update_report(report)
    write_manifest(report)

    print(f"Generated {len(projects)} public projects")
    print(f"Wrote {len(geojson_report['layers'])} processed GeoJSON layers")
    print(f"Report: {PROCESSED_DIR / 'update-report.md'}")


if __name__ == "__main__":
    main()
