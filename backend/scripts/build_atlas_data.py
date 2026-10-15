"""Build global atlas reference overlays from pinned Natural Earth data.

Run: uv run --with shapely --with pillow python scripts/build_atlas_data.py (from backend).
Shapely is only a build tool, not a server dependency.
"""

import hashlib
import json
import math
from pathlib import Path
from urllib.request import urlopen

from PIL import Image, ImageDraw
from shapely.geometry import mapping, shape

COMMIT = "ca96624a56bd078437bca8184e78163e5039ad19"
ROOT = Path(__file__).resolve().parents[1] / "app" / "data" / "atlas"
FILES = {
    "airports": ["ne_10m_airports"],
    "ports": ["ne_10m_ports"],
    "rivers": ["ne_50m_rivers_lake_centerlines"],
    "lakes": ["ne_50m_lakes"],
    "bathymetry": [
        f"ne_10m_bathymetry_{letter}_{depth}"
        for letter, depth in zip(
            "ABCDEFGHIJKL",
            [10000, 9000, 8000, 7000, 6000, 5000, 4000, 3000, 2000, 1000, 200, 0],
            strict=True,
        )
    ],
}


def rounded(value):
    if isinstance(value, (tuple, list)):
        return [rounded(v) for v in value]
    return round(value, 4) if isinstance(value, float) else value


def build():
    manifest = {}
    for layer, files in FILES.items():
        features, sources = [], []
        for file in files:
            url = f"https://raw.githubusercontent.com/nvkelso/natural-earth-vector/{COMMIT}/geojson/{file}.geojson"
            raw = urlopen(url, timeout=45).read()
            sources.append({"url": url, "sha256": hashlib.sha256(raw).hexdigest()})
            for index, feature in enumerate(json.loads(raw)["features"]):
                properties = feature["properties"]
                geometry = shape(feature["geometry"])
                if geometry.geom_type != "Point":
                    geometry = geometry.simplify(0.025, preserve_topology=True)
                kept = {
                    key: properties[key]
                    for key in [
                        "name",
                        "name_en",
                        "namealt",
                        "abbrev",
                        "iata_code",
                        "gps_code",
                        "type",
                        "featurecla",
                        "scalerank",
                        "depth",
                        "wikipedia",
                        "website",
                        "ne_id",
                    ]
                    if key in properties and properties[key] is not None
                }
                if layer == "bathymetry":
                    kept.update(depth=int(file.rsplit("_", 1)[1]), name="Ocean depth")
                features.append(
                    {
                        "type": "Feature",
                        "id": f"{file}:{properties.get('ne_id', index)}",
                        "geometry": {
                            "type": geometry.geom_type,
                            "coordinates": rounded(mapping(geometry)["coordinates"]),
                        },
                        "properties": kept,
                    }
                )
            print(layer, file, len(features), flush=True)
        collection = {
            "type": "FeatureCollection",
            "features": features,
            "referenceVintage": "Natural Earth · pinned 2022 source",
            "upstreamCommit": COMMIT,
            "generalizationDegrees": 0.025,
            "coverage": "Global · generalized atlas reference",
        }
        output = (
            json.dumps(collection, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
            + "\n"
        )
        (ROOT / f"{layer}.geojson").write_text(output)
        manifest[layer] = {
            "features": len(features),
            "bytes": len(output.encode()),
            "sources": sources,
        }
        print(layer, len(output.encode()), "bytes", flush=True)
    render_bathymetry(json.loads((ROOT / "bathymetry.geojson").read_text()))
    (ROOT / "bathymetry.geojson").unlink()
    manifest["bathymetry"]["imageBytes"] = (ROOT / "bathymetry.png").stat().st_size
    manifest["bathymetry"]["format"] = "4096 x 4096 Web Mercator PNG"
    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (ROOT / "LICENSE.txt").write_text(
        "Natural Earth map data is public domain. Source terms: https://www.naturalearthdata.com/about/terms-of-use/\nGeo generalizes non-point geometry by 0.025 degrees and rounds coordinates to four decimals; reference only, not for navigation.\n"
    )


def render_bathymetry(collection):
    """Render depth thresholds in Web Mercator, matching Leaflet image bounds."""
    colors = {
        0: "#81c6c8",
        200: "#64b5bf",
        1000: "#469baa",
        2000: "#35849b",
        3000: "#2c6c87",
        4000: "#285674",
        5000: "#24445f",
        6000: "#20334d",
        7000: "#252b45",
        8000: "#2c2541",
        9000: "#35203a",
        10000: "#431b37",
    }
    size = 4096
    image = Image.new("RGBA", (size, size))

    def pixels(ring):
        return [
            (
                (lon + 180) / 360 * size,
                (
                    1
                    - math.asinh(math.tan(math.radians(max(-85.05112878, min(85.05112878, lat)))))
                    / math.pi
                )
                / 2
                * size,
            )
            for lon, lat in ring
        ]

    for feature in sorted(collection["features"], key=lambda f: f["properties"]["depth"]):
        geometry = feature["geometry"]
        polygons = (
            geometry["coordinates"]
            if geometry["type"] == "MultiPolygon"
            else [geometry["coordinates"]]
        )
        for rings in polygons:
            projected = [pixels(ring) for ring in rings]
            xs = [x for x, y in projected[0]]
            ys = [y for x, y in projected[0]]
            left, top = max(0, math.floor(min(xs))), max(0, math.floor(min(ys)))
            right, bottom = min(size, math.ceil(max(xs)) + 1), min(size, math.ceil(max(ys)) + 1)
            if left >= right or top >= bottom:
                continue
            mask = Image.new("1", (right - left, bottom - top))
            draw = ImageDraw.Draw(mask)
            for index, ring in enumerate(projected):
                draw.polygon([(x - left, y - top) for x, y in ring], fill=1 if index == 0 else 0)
            image.paste(colors[feature["properties"]["depth"]], (left, top, right, bottom), mask)
    image.save(ROOT / "bathymetry.png", optimize=True)
    print(
        "Web Mercator depth raster", (ROOT / "bathymetry.png").stat().st_size, "bytes", flush=True
    )


if __name__ == "__main__":
    build()
