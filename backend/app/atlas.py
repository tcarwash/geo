"""Bundled global cartographic reference products."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from . import cache

DATA = Path(__file__).parent / "data" / "atlas"
REFERENCE_LAYERS = ("airports", "ports", "rivers", "lakes", "bathymetry", "tectonic-plates")
DEPTH_COLORS = {
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


def reference_layer(layer: str) -> dict[str, Any]:
    if layer not in REFERENCE_LAYERS:
        raise ValueError("Unknown atlas reference layer")
    if layer == "bathymetry":
        data = {
            "type": "RasterReference",
            "tileSource": {
                "kind": "image",
                "url": "/api/v1/atlas/bathymetry-image",
                "bounds": [[-85.05112878, -180], [85.05112878, 180]],
            },
            "depthBands": [
                {"depth": depth, "color": color} for depth, color in DEPTH_COLORS.items()
            ],
            "referenceVintage": "Natural Earth · pinned 2022 source",
            "resolution": "4096 × 4096 Web Mercator overview",
        }
    else:
        data = json.loads((DATA / f"{layer}.geojson").read_text())
    tectonics = layer == "tectonic-plates"
    result = cache.envelope(
        source="pb2002-tectonic-plates" if tectonics else "natural-earth",
        kind="reference",
        data=data,
        attribution="Peter Bird PB2002 · Hugo Ahlenius / Nordpil · ODbL 1.0"
        if tectonics
        else "Natural Earth · public domain",
        documentation_url="https://github.com/fraxen/tectonicplates"
        if tectonics
        else "https://www.naturalearthdata.com/about/terms-of-use/",
        ttl_seconds=86400,
    )
    result.update(
        referenceVintage=data["referenceVintage"],
        coverage=data.get("coverage", "Global · generalized atlas reference"),
        units={"depth": "m"} if layer == "bathymetry" else {},
    )
    return result
