"""Bundle the global OSM submarine communications-cable extract from QLever.

No planet query is performed at application runtime. Rebuild from repo root:
/usr/bin/python3 backend/scripts/build_cable_data.py
"""

import hashlib
import json
import re
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from build_transport_data import split_dateline

API = "https://qlever.dev/api/osm-planet"
QUERY = 'PREFIX geo: <http://www.opengis.net/ont/geosparql#> PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:> SELECT ?way ?name ?operator ?geometry WHERE { ?way osmkey:submarine "yes"; osmkey:communication "line"; geo:hasGeometry/geo:asWKT ?geometry . OPTIONAL { ?way osmkey:name ?name } OPTIONAL { ?way osmkey:operator ?operator } }'
ROOT = Path(__file__).resolve().parents[1] / "app" / "data" / "atlas"


def build(payload=None, stats=None):
    if payload is None:
        request = Request(
            API + "?" + urlencode({"query": QUERY}),
            headers={"User-Agent": "GeoDashboard/0.1", "Accept": "application/sparql-results+json"},
        )
        payload = urlopen(request, timeout=60).read()
    if stats is None:
        stats = json.load(urlopen(API + "?cmd=stats", timeout=20))
    snapshot = re.search(r"planet-(\d{6})\.osm\.pbf", stats["name-index"])
    if snapshot is None:
        raise ValueError("QLever OSM snapshot date is unavailable")
    vintage = datetime.strptime(snapshot[1], "%y%m%d").replace(tzinfo=UTC).strftime("%Y-%m-%d")
    bindings = json.loads(payload)["results"]["bindings"]
    features = []
    seen = set()
    for row in bindings:
        way = row["way"]["value"]
        wkt = row["geometry"]["value"]
        if not re.fullmatch(r"https://www.openstreetmap.org/way/\d+", way):
            raise ValueError("Unsupported OSM identifier")
        if way in seen:
            continue
        match = re.fullmatch(r"LINESTRING\s*\((.+)\)", wkt)
        if not match:
            raise ValueError("Unsupported cable geometry")
        points = [
            [round(float(value), 4) for value in point.split()] for point in match[1].split(",")
        ]
        if len(points) < 2 or any(
            len(point) != 2 or not (-180 <= point[0] <= 180 and -90 <= point[1] <= 90)
            for point in points
        ):
            raise ValueError("Invalid cable coordinates")
        seen.add(way)
        features.append(
            {
                "type": "Feature",
                "id": way.rsplit("/", 1)[1],
                "geometry": {"type": "MultiLineString", "coordinates": split_dateline(points)},
                "properties": {
                    "name": row.get("name", {}).get("value"),
                    "operator": row.get("operator", {}).get("value"),
                    "cableType": "Submarine communications cable",
                    "referenceVintage": vintage,
                    "attribution": "OpenStreetMap contributors · ODbL 1.0",
                    "osmUrl": way,
                },
            }
        )
    if not features:
        raise ValueError("No mapped cables were returned")
    collection = {
        "type": "FeatureCollection",
        "features": features,
        "referenceVintage": f"OSM planet · {vintage}",
        "snapshotDate": vintage,
        "coverage": "Global · mapped submarine communications cables; incomplete",
        "queryService": "QLever OSM planet",
    }
    ROOT.mkdir(parents=True, exist_ok=True)
    path = ROOT / "submarine-cables.geojson"
    path.write_text(
        json.dumps(collection, separators=(",", ":"), ensure_ascii=False, allow_nan=False) + "\n"
    )
    (ROOT / "submarine-cables-provenance.json").write_text(
        json.dumps(
            {
                "source": API,
                "query": QUERY,
                "databaseSnapshot": stats["name-index"],
                "rawSha256": hashlib.sha256(payload).hexdigest(),
                "retrievedAt": datetime.now(UTC).isoformat(),
                "transformations": "Deduplicate OSM ways, round coordinates to four decimals, split at date line",
                "license": "ODbL 1.0",
            },
            indent=2,
        )
        + "\n"
    )
    (ROOT / "submarine-cables-LICENSE.txt").write_text(
        "OpenStreetMap contributors · Open Database License (ODbL) 1.0. Individual contents: Database Contents License 1.0.\nDerived database in submarine-cables.geojson is available under ODbL 1.0.\nhttps://www.openstreetmap.org/copyright\nhttps://opendatacommons.org/licenses/odbl/1-0/\nhttps://opendatacommons.org/licenses/dbcl/1-0/\nSource: QLever OSM planet extract; not TeleGeography data.\n"
    )
    print("Submarine cables", len(features), "features", path.stat().st_size, "bytes", vintage)


if __name__ == "__main__":
    build()
