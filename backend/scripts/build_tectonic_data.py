"""Build the bundled PB2002 tectonic-plate atlas layer.

Run from the repository root with a build-only Shapely install:
uv run --project backend --with shapely python backend/scripts/build_tectonic_data.py
"""

import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

from shapely.geometry import mapping, shape

COMMIT = "339b0c56563c118307b1f4542703047f5f698fae"
DATA = Path(__file__).resolve().parents[1] / "app" / "data" / "atlas"
BASE = f"https://raw.githubusercontent.com/fraxen/tectonicplates/{COMMIT}/GeoJSON"
SOURCES = {
    "boundaries": f"{BASE}/PB2002_boundaries.json",
    "plates": f"{BASE}/PB2002_plates.json",
}


def rounded(value):
    if isinstance(value, (tuple, list)):
        return [rounded(item) for item in value]
    return round(value, 4) if isinstance(value, float) else value


def build():
    features, provenance = [], {}
    for layer, url in SOURCES.items():
        raw = urlopen(url, timeout=45).read()
        provenance[layer] = {"url": url, "sha256": hashlib.sha256(raw).hexdigest()}
        collection = json.loads(raw)
        for index, item in enumerate(collection["features"]):
            geometry = shape(item["geometry"])
            if geometry.geom_type != "Point":
                geometry = geometry.simplify(0.02, preserve_topology=True)
            properties = item["properties"]
            if layer == "plates":
                kept = {
                    "recordType": "plate",
                    "plateCode": properties.get("Code", ""),
                    "plateName": properties.get("PlateName", "Unnamed plate"),
                }
            else:
                kept = {
                    "recordType": "boundary",
                    "name": properties.get("Name", ""),
                    "plateA": properties.get("PlateA", ""),
                    "plateB": properties.get("PlateB", ""),
                    "boundaryType": properties.get("Type", ""),
                    "sourceCitation": properties.get("Source", ""),
                }
            features.append(
                {
                    "type": "Feature",
                    "id": f"{layer}:{item.get('id', index)}",
                    "geometry": {
                        "type": geometry.geom_type,
                        "coordinates": rounded(mapping(geometry)["coordinates"]),
                    },
                    "properties": kept,
                }
            )
    output = {
        "type": "FeatureCollection",
        "features": features,
        "referenceVintage": "PB2002 present-day plate model · published 2003",
        "coverage": "Global overview · 54 named plate polygons and 241 boundary segments; polar geometry is incomplete",
        "generalizationDegrees": 0.02,
        "sourceSnapshot": "Upstream GeoJSON converted June 2014",
        "sourceFiles": provenance,
    }
    DATA.mkdir(parents=True, exist_ok=True)
    target = DATA / "tectonic-plates.geojson"
    target.write_text(
        json.dumps(output, separators=(",", ":"), ensure_ascii=False, allow_nan=False) + "\n"
    )
    (DATA / "tectonic-plates-LICENSE.txt").write_text(
        "PB2002 plate boundaries and plate polygons. Original model: Peter Bird (2003), An updated digital model of plate boundaries, Geochemistry, Geophysics, Geosystems, 4(3), 1027. GeoJSON conversion: Hugo Ahlenius / Nordpil; source shapefile conversion: fraxen/tectonicplates.\n"
        "Open Data Commons Attribution License (ODbL) 1.0: https://opendatacommons.org/licenses/by/1-0/\n"
        "Dataset: https://github.com/fraxen/tectonicplates\n"
        "Geo simplifies geometries to 0.02 degrees and rounds coordinates to four decimals. PB2002 has incomplete polar coverage; the layer is a scientific overview, not a precision geologic survey.\n"
    )
    print(len(features), "tectonic features", target.stat().st_size, "bytes")


if __name__ == "__main__":
    build()
