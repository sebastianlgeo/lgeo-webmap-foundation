#!/usr/bin/env python3
"""Import selected missing admin polygons into local raw GeoJSON layers.

The raw and processed GeoJSON files are intentionally ignored by Git. This
script gives us a repeatable way to rebuild local geometry edits before
regenerating the app data and publishing Mapbox tilesets.
"""

from __future__ import annotations

import json
import time
import unicodedata
from pathlib import Path
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
RAW_GEOJSON_DIR = ROOT / "data" / "geojson" / "raw"

GEBOUNDARIES_API = "https://www.geoboundaries.org/api/current/gbOpen/{iso}/{adm}/"

IMPORTS = [
    {
        "iso": "MEX",
        "adm": "ADM1",
        "shapeName": "Sinaloa",
        "targetLayer": "ProvincialLevelPolygons.geojson",
        "nameKey": "Sinaloa",
    },
    {
        "iso": "MEX",
        "adm": "ADM1",
        "shapeName": "Distrito Federal",
        "targetLayer": "ProvincialLevelPolygons.geojson",
        "nameKey": "Distrito Federal",
    },
    {
        "iso": "MEX",
        "adm": "ADM1",
        "shapeName": "Distrito Federal",
        "targetLayer": "RegionalLevelPolygons.geojson",
        "nameKey": "Ciudad de Mexico",
    },
    {
        "iso": "MEX",
        "adm": "ADM2",
        "shapeName": "Mazatlan",
        "targetLayer": "RegionalLevelPolygons.geojson",
        "nameKey": "Mazatlan",
    },
]


def normalized_name(value: object) -> str:
    text = "" if value is None else str(value).strip()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(character for character in text if not unicodedata.combining(character))
    return text.casefold()


def read_json_url(url: str) -> object:
    last_error: Exception | None = None
    for attempt in range(1, 4):
        request = Request(
            url,
            headers={
                "Accept": "application/geo+json, application/json, */*",
                "User-Agent": "LGeo-Webmap-Boundary-Importer/1.0",
            },
        )
        try:
            with urlopen(request, timeout=120) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as error:  # noqa: BLE001 - surface final URL failure with context.
            last_error = error
            if attempt < 3:
                time.sleep(2 * attempt)
    raise RuntimeError(f"Failed to download JSON from {url}") from last_error


def read_json_file(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json_file(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def metadata_for(iso: str, adm: str) -> dict[str, object]:
    return read_json_url(GEBOUNDARIES_API.format(iso=iso, adm=adm))


def source_features(meta: dict[str, object]) -> list[dict[str, object]]:
    url = str(meta.get("simplifiedGeometryGeoJSON") or meta.get("gjDownloadURL"))
    if not url:
        raise ValueError("geoBoundaries metadata did not include a GeoJSON download URL")
    data = read_json_url(url)
    features = data.get("features", [])
    if not isinstance(features, list):
        raise ValueError(f"Download did not contain a feature list: {url}")
    return features


def find_feature(features: list[dict[str, object]], shape_name: str) -> dict[str, object]:
    wanted = normalized_name(shape_name)
    for feature in features:
        properties = feature.get("properties", {})
        if not isinstance(properties, dict):
            continue
        candidates = [
            properties.get("shapeName"),
            properties.get("shapeISO"),
            properties.get("shapeID"),
        ]
        if any(normalized_name(candidate) == wanted for candidate in candidates):
            return feature
    available = sorted(
        str(feature.get("properties", {}).get("shapeName", ""))
        for feature in features
        if isinstance(feature.get("properties"), dict)
    )
    raise ValueError(f"Could not find {shape_name!r}. Available examples: {available[:12]}")


def next_fid(features: list[dict[str, object]]) -> int:
    max_fid = -1
    for feature in features:
        properties = feature.get("properties", {})
        if not isinstance(properties, dict):
            continue
        try:
            max_fid = max(max_fid, int(properties.get("FID")))
        except (TypeError, ValueError):
            continue
    return max_fid + 1


def replace_or_append(target_path: Path, source: dict[str, object], name_key: str, meta: dict[str, object]) -> str:
    target = read_json_file(target_path)
    features = target.setdefault("features", [])
    if not isinstance(features, list):
        raise ValueError(f"{target_path} does not contain a feature list")

    replacement = {
        "type": "Feature",
        "geometry": source.get("geometry"),
        "properties": {
            "FID": next_fid(features),
            "NameKey": name_key,
            "Frequency": 0,
            "BoundarySource": "geoBoundaries",
            "BoundarySourceAgency": meta.get("boundarySource"),
            "BoundarySourceURL": meta.get("boundarySourceURL"),
            "BoundaryLicense": meta.get("boundaryLicense"),
            "BoundaryYearRepresented": meta.get("boundaryYearRepresented"),
            "BoundaryType": meta.get("boundaryType"),
        },
    }

    for index, feature in enumerate(features):
        properties = feature.get("properties", {})
        if isinstance(properties, dict) and normalized_name(properties.get("NameKey")) == normalized_name(name_key):
            original_fid = properties.get("FID", replacement["properties"]["FID"])
            replacement["properties"]["FID"] = original_fid
            features[index] = replacement
            write_json_file(target_path, target)
            return "replaced"

    features.append(replacement)
    write_json_file(target_path, target)
    return "added"


def main() -> None:
    cache: dict[tuple[str, str], tuple[dict[str, object], list[dict[str, object]]]] = {}
    results = []

    for item in IMPORTS:
        key = (item["iso"], item["adm"])
        if key not in cache:
            meta = metadata_for(*key)
            cache[key] = (meta, source_features(meta))

        meta, features = cache[key]
        source = find_feature(features, str(item["shapeName"]))
        target_path = RAW_GEOJSON_DIR / str(item["targetLayer"])
        status = replace_or_append(target_path, source, str(item["nameKey"]), meta)
        results.append(f"{status}: {item['nameKey']} -> {item['targetLayer']}")

    print("\n".join(results))


if __name__ == "__main__":
    main()
