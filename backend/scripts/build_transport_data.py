"""Rebuild the bundled reference layers from pinned upstream data (stdlib only)."""

import csv
import io
import json
import math
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1] / "app" / "data"
AIR_COMMIT = "7d1a611e070295dba776d6afb86e57d0d1aa1cef"
SEA_COMMIT = "b0ad85cdab959b84bc915b21d77d18bb8f1429f4"
AIR_LIMIT = 2000


def download(repo, commit, file):
    with urlopen(
        f"https://raw.githubusercontent.com/{repo}/{commit}/{file}", timeout=30
    ) as response:
        return response.read().decode("utf-8")


def split_dateline(points):
    lines, line = [], [points[0]]
    for point in points[1:]:
        previous = line[-1]
        if abs(point[0] - previous[0]) > 180:
            adjusted = point[0] + (360 if point[0] < previous[0] else -360)
            edge = 180 if previous[0] > 0 else -180
            lat = previous[1] + (point[1] - previous[1]) * (edge - previous[0]) / (
                adjusted - previous[0]
            )
            line.append([edge, round(lat, 4)])
            lines.append(line)
            line = [[-edge, round(lat, 4)]]
        line.append(point)
    if len(line) > 1:
        lines.append(line)
    return lines


def arc(a, b):
    def vector(point):
        lon, lat = map(math.radians, point)
        return (math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat))

    va, vb = vector(a), vector(b)
    angle = math.acos(max(-1, min(1, sum(x * y for x, y in zip(va, vb)))))
    count = max(2, math.ceil(math.degrees(angle) / 4))
    points = []
    for step in range(count + 1):
        t = step / count
        if abs(math.sin(angle)) < 1e-8:
            point = [a[i] + (b[i] - a[i]) * t for i in range(2)]
        else:
            v = [
                (math.sin((1 - t) * angle) * x + math.sin(t * angle) * y) / math.sin(angle)
                for x, y in zip(va, vb)
            ]
            point = [
                math.degrees(math.atan2(v[1], v[0])),
                math.degrees(math.atan2(v[2], math.hypot(v[0], v[1]))),
            ]
        points.append([round(value, 4) for value in point])
    return split_dateline(points)


def build():
    airports = {}
    for row in csv.reader(
        io.StringIO(download("jpatokal/openflights", AIR_COMMIT, "data/airports.dat"))
    ):
        try:
            airports[row[0]] = {
                "code": row[4] if row[4] != r"\N" else row[5],
                "name": row[1],
                "city": row[2],
                "coordinates": [float(row[7]), float(row[6])],
            }
        except (IndexError, ValueError):
            continue
    pairs = {}
    for row in csv.reader(
        io.StringIO(download("jpatokal/openflights", AIR_COMMIT, "data/routes.dat"))
    ):
        if (
            len(row) < 9
            or row[7] != "0"
            or row[3] not in airports
            or row[5] not in airports
            or row[3] == row[5]
        ):
            continue
        pair = tuple(sorted((row[3], row[5])))
        pairs.setdefault(pair, set()).add(row[0])
    features = []
    for (a, b), airlines in sorted(pairs.items(), key=lambda item: (-len(item[1]), item[0]))[
        :AIR_LIMIT
    ]:
        start, end = airports[a], airports[b]
        features.append(
            {
                "type": "Feature",
                "id": f"air:{a}:{b}",
                "geometry": {
                    "type": "MultiLineString",
                    "coordinates": arc(start["coordinates"], end["coordinates"]),
                },
                "properties": {
                    "name": f"{start['code']} ↔ {end['code']}",
                    "fromAirport": start["name"],
                    "toAirport": end["name"],
                    "fromCity": start["city"],
                    "toCity": end["city"],
                    "airlineCount": len(airlines),
                    "referenceVintage": "June 2014",
                },
            }
        )
    air = {
        "type": "FeatureCollection",
        "features": features,
        "totalConnections": len(pairs),
        "displayLimit": AIR_LIMIT,
        "selection": "Top airport pairs by distinct airline count; directions and codeshares combined",
        "referenceVintage": "June 2014",
        "upstreamCommit": AIR_COMMIT,
    }
    sea = json.loads(
        download("newzealandpaul/Shipping-Lanes", SEA_COMMIT, "data/Shipping_Lanes_v1.geojson")
    )
    for feature in sea["features"]:
        lines = feature["geometry"]["coordinates"]
        feature["geometry"]["coordinates"] = [
            part
            for line in lines
            for part in split_dateline([[round(x, 4), round(y, 4)] for x, y, *_ in line])
        ]
        feature["properties"] = {
            "category": feature["properties"]["Type"],
            "name": feature["properties"]["Type"] + " shipping lanes",
            "referenceVintage": "2012 CIA map · 2022 dataset",
        }
    sea.update(referenceVintage="2012 CIA map · 2022 dataset", upstreamCommit=SEA_COMMIT)
    ROOT.mkdir(parents=True, exist_ok=True)
    for name, data in [("air-routes", air), ("sea-routes", sea)]:
        path = ROOT / (name + ".geojson")
        path.write_text(
            json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n"
        )
        print(name, len(data["features"]), path.stat().st_size, "bytes")
    (ROOT / "shipping-lanes-LICENSE.txt").write_text(
        download("newzealandpaul/Shipping-Lanes", SEA_COMMIT, "LICENSE")
    )
    (ROOT / "openflights-LICENSE.txt").write_text(
        "OpenFlights database: ODbL 1.0; individual contents: Database Contents License 1.0.\nDerived database in air-routes.geojson is available under ODbL 1.0.\nhttps://openflights.org/data#license\nhttps://opendatacommons.org/licenses/odbl/1-0/\nhttps://opendatacommons.org/licenses/dbcl/1-0/\n"
    )


if __name__ == "__main__":
    build()
