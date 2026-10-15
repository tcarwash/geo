"""Build a global historical AIS-density overview from the World Bank/IMF raster.

Run from the repository root:
uv run --project backend --with rasterio --with pillow python backend/scripts/build_global_vessel_density.py --archive /tmp/geo-worldbank-shipdensity-global.zip
The 535 MB source archive is a build input, not shipped in the runtime image.
"""

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.transform import Affine, from_bounds
from rasterio.warp import reproject

ROOT = Path(__file__).resolve().parents[1] / "app" / "data" / "atlas"
SOURCE = "https://datacatalogfiles.worldbank.org/ddh-published/0037580/5/DR0045406/shipdensity_global.zip"
CATALOG = "https://datacatalog.worldbank.org/search/dataset/0037580/global-shipping-traffic-density"
SIZE = 4096
EXTENT = 20037508.342789244


def build(archive):
    path = Path(archive).resolve()
    print("Reading World Bank/IMF raster overview", flush=True)
    with (
        rasterio.Env(GDAL_CACHEMAX=64_000_000),
        rasterio.open("/vsizip/" + str(path) + "/shipdensity_global.tif") as source,
    ):
        values = (
            source.read(1, out_shape=(2048, SIZE), resampling=Resampling.average, masked=True)
            .astype("float32")
            .filled(np.nan)
        )
        transform = source.transform * Affine.scale(source.width / SIZE, source.height / 2048)
        profile = {
            "width": source.width,
            "height": source.height,
            "bounds": list(source.bounds),
            "crs": str(source.crs),
            "nativeCellDegrees": 0.005,
            "nodata": source.nodata,
            "providerOverviews": source.overviews(1),
        }
        projected = np.full((SIZE, SIZE), np.nan, dtype="float32")
        reproject(
            values,
            projected,
            src_transform=transform,
            src_crs=source.crs,
            src_nodata=np.nan,
            dst_transform=from_bounds(-EXTENT, -EXTENT, EXTENT, EXTENT, SIZE, SIZE),
            dst_crs="EPSG:3857",
            dst_nodata=np.nan,
            resampling=Resampling.average,
            num_threads=2,
        )
    positive = np.isfinite(projected) & (projected > 0)
    log = np.zeros_like(projected)
    log[positive] = np.log10(1 + projected[positive])
    # EMODnet's European palette, with separate logarithmic display thresholds
    # for this cumulative AIS-report product. Do not reuse vessel-hours units.
    stops = np.array([0, 6.2, 7.1, 7.6, 7.85, 8, 8.3])
    colors = np.array(
        [
            [11, 44, 122],
            [32, 153, 143],
            [0, 219, 0],
            [255, 255, 0],
            [237, 161, 19],
            [221, 58, 27],
            [155, 24, 0],
        ]
    )
    image = np.zeros((SIZE, SIZE, 4), dtype="uint8")
    for channel in range(3):
        image[:, :, channel] = np.interp(log, stops, colors[:, channel]).astype("uint8")
    # Fade sparse reports instead of laying a bright stipple across the oceans.
    opacity = np.clip((log - 4.5) / 2.5, 0, 1) ** 2
    image[:, :, 3] = np.where(positive, 255 * opacity, 0).astype("uint8")
    ROOT.mkdir(parents=True, exist_ok=True)
    output = ROOT / "vessel-density-global.png"
    Image.fromarray(image).save(output, optimize=True)
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(2_000_000):
            digest.update(chunk)
    provenance = {
        "source": SOURCE,
        "catalog": CATALOG,
        "archiveSha256": digest.hexdigest(),
        "attribution": "World Bank / IMF · ESMAP / PROBLUE",
        "license": "CC BY 4.0",
        "observationStart": "2015-01-01",
        "observationEnd": "2021-02",
        "sourceQuantity": "Hourly AIS report positions per 0.005° source cell, moving and stationary vessels, all vessel categories",
        "sourceProfile": profile,
        "outputProjection": "EPSG:3857",
        "outputPixels": [SIZE, SIZE],
        "transformations": "Read provider raster overviews; average to 4096 x 2048 geographic overview; average-reproject into Web Mercator; logarithmic relative-intensity colors using the European EMODnet palette, with low-intensity opacity fading. This is a visualization, not unique vessel counts or current traffic.",
        "displayStyle": {
            "palette": [
                "#0b2c7a",
                "#20998f",
                "#00db00",
                "#ffff00",
                "#eda113",
                "#dd3a1b",
                "#9b1800",
            ],
            "log10ReportStops": stops.tolist(),
            "opacity": "clip((log10(1 + overview report count) - 4.5) / 2.5, 0, 1)^2",
            "paletteSource": "https://ows.emodnet-humanactivities.eu/wms?service=WMS&version=1.1.1&request=GetStyles&layers=vesseldensity_allavg",
        },
        "positiveOverviewPixels": int(positive.sum()),
        "maximumOverviewValue": float(np.nanmax(projected)),
        "pngBytes": output.stat().st_size,
    }
    (ROOT / "vessel-density-global-provenance.json").write_text(
        json.dumps(provenance, indent=2) + "\n"
    )
    (ROOT / "vessel-density-global-LICENSE.txt").write_text(
        "World Bank / IMF · ESMAP / PROBLUE · Global Shipping Traffic Density.\nCreative Commons Attribution 4.0: https://creativecommons.org/licenses/by/4.0/\nSource: "
        + CATALOG
        + "\nGeo changes: provider overview sampling, geographic averaging, Web Mercator reprojection, logarithmic relative-intensity color rendering and low-intensity opacity fading. Period: January 2015–February 2021.\n"
    )
    print(
        "Global density",
        output.stat().st_size,
        "bytes",
        int(positive.sum()),
        "positive overview pixels",
        flush=True,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", required=True)
    args = parser.parse_args()
    build(args.archive)
