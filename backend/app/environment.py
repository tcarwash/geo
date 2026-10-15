"""Fixed-source environmental products with product time, units and last-good caching."""

from __future__ import annotations

import asyncio
import json
import math
import re
import xml.etree.ElementTree as ET
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import eccodes
import httpx
import numpy as np

from . import cache

ENVIRONMENT_LAYERS = (
    "night-lights",
    "vegetation",
    "smoke-aerosols",
    "surface-wind",
    "pressure",
    "sea-temperature",
    "ocean-currents",
    "waves",
    "vessel-density-global",
    "vessel-density",
    "glotec",
    "submarine-cables",
)
ENVIRONMENT_CATALOG = {
    "night-lights": (
        "City lights",
        "composite",
        "NASA Black Marble · daily NOAA-20/VIIRS night-light composite",
    ),
    "vegetation": (
        "Vegetation greenness",
        "composite",
        "NASA GIBS · NOAA-20/VIIRS rolling 8-day NDVI",
    ),
    "smoke-aerosols": (
        "Smoke & aerosols",
        "analysis",
        "NASA GIBS · Terra/Aqua MODIS MAIAC aerosol optical depth",
    ),
    "surface-wind": ("Surface wind", "forecast", "NOAA/NCEP GFS · 10 m wind"),
    "pressure": ("Sea-level pressure", "forecast", "NOAA/NCEP GFS · mean sea-level pressure"),
    "sea-temperature": ("Sea-surface temperature", "analysis", "NASA GIBS · GHRSST MUR SST"),
    "ocean-currents": (
        "Ocean currents",
        "analysis",
        "NOAA CoastWatch · experimental geostrophic currents",
    ),
    "waves": ("Waves & swell", "forecast", "NOAA/NCEP GFS Wave"),
    "vessel-density-global": (
        "Vessel density · global",
        "reference",
        "World Bank / IMF · January 2015–February 2021 · CC BY 4.0",
    ),
    "vessel-density": (
        "Vessel density · Europe",
        "composite",
        "EMODnet Human Activities · annual mean",
    ),
    "glotec": ("Ionospheric electron content", "model", "NOAA SWPC · GloTEC"),
    "submarine-cables": (
        "Submarine cables",
        "reference",
        "OpenStreetMap contributors · ODbL · bundled snapshot",
    ),
}

GIBS_CAPABILITIES = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml"
GIBS_WMS = "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi"
EMODNET_WMS = "https://ows.emodnet-humanactivities.eu/wms"
GLOTEC_INDEX = "https://services.swpc.noaa.gov/products/glotec/geojson_2d_urt.json"
CURRENTS = "https://coastwatch.pfeg.noaa.gov/erddap/griddap/nesdisSSH1day.json"
NOMADS = "https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod"
GIBS_PRODUCTS = {
    "night-lights": "VIIRS_NOAA20_GapFilled_BRDF_Corrected_DayNightBand_Radiance",
    "vegetation": "VIIRS_NOAA20_NDVI_8Day",
    "smoke-aerosols": "MODIS_Combined_MAIAC_L2G_AerosolOpticalDepth",
    "sea-temperature": "GHRSST_L4_MUR_Sea_Surface_Temperature",
}


def iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def number(value: Any) -> float | None:
    return (
        float(value)
        if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
        else None
    )


async def bounded_get(
    client: httpx.AsyncClient, url: str, *, max_bytes: int = 8_000_000, **kwargs: Any
) -> bytes:
    chunks, size = [], 0
    async with client.stream("GET", url, timeout=45, **kwargs) as response:
        response.raise_for_status()
        expected = kwargs.get("headers", {}).get("Range")
        if expected and (
            response.status_code != 206
            or not response.headers.get("Content-Range", "").startswith(
                expected.replace("bytes=", "bytes ") + "/"
            )
        ):
            raise TypeError("NOMADS did not honor the exact byte range")
        async for chunk in response.aiter_bytes():
            size += len(chunk)
            if size > max_bytes:
                raise TypeError("Provider response exceeds the supported size")
            chunks.append(chunk)
    return b"".join(chunks)


async def gibs_metadata(client: httpx.AsyncClient, layer: str) -> dict[str, Any]:
    product = GIBS_PRODUCTS[layer]

    async def fetch() -> dict[str, Any]:
        root = ET.fromstring(await bounded_get(client, GIBS_CAPABILITIES, max_bytes=12_000_000))
        ns = {"w": "http://www.opengis.net/wmts/1.0", "o": "http://www.opengis.net/ows/1.1"}
        record = next(
            (
                item
                for item in root.findall(".//w:Layer", ns)
                if item.findtext("o:Identifier", namespaces=ns) == product
            ),
            None,
        )
        if record is None:
            raise TypeError("NASA GIBS product is absent from its catalog")
        dimensions = record.findall("w:Dimension", ns)
        date = next(
            (
                d.findtext("w:Default", namespaces=ns)
                for d in dimensions
                if d.findtext("o:Identifier", namespaces=ns) == "Time"
            ),
            None,
        )
        if not date or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
            raise TypeError("NASA GIBS product date is unavailable")
        detail = {
            "night-lights": (
                "NASA Black Marble · NOAA-20 / VIIRS daily moonlight- and atmosphere-corrected nighttime lights",
                "NASA Black Marble science team",
                "https://ladsweb.modaps.eosdis.nasa.gov/missions-and-measurements/products/VJ146A2",
                "Global · daily gap-filled nighttime-light composite",
            ),
            "vegetation": (
                "NASA GIBS · NOAA-20 / VIIRS rolling 8-day vegetation index",
                "NASA EOSDIS GIBS · NOAA-20 VIIRS",
                "https://gibs.earthdata.nasa.gov/layer-metadata/v1.0/VIIRS_NOAA20_NDVI_8Day.json",
                "Global land · rolling 8-day greenness composite",
            ),
            "smoke-aerosols": (
                "NASA GIBS · Terra + Aqua MODIS MAIAC daily aerosol optical depth",
                "NASA EOSDIS GIBS · Terra + Aqua MODIS MAIAC",
                "https://gibs.earthdata.nasa.gov/layer-metadata/v1.0/MODIS_Combined_MAIAC_L2G_AerosolOpticalDepth.json",
                "Global land · daytime satellite aerosol retrievals; clouds and retrieval gaps remain",
            ),
            "sea-temperature": (
                "NASA EOSDIS GIBS · GHRSST MUR SST",
                "NASA EOSDIS GIBS · GHRSST / JPL MUR SST",
                "https://podaac.jpl.nasa.gov/dataset/MUR-JPL-L4-GLOB-v4.1",
                "Global ocean · daily blended temperature analysis",
            ),
        }[layer]
        product_name, attribution, documentation_url, coverage = detail
        kind = "composite" if layer in {"night-lights", "vegetation"} else "analysis"
        result = cache.envelope(
            source="nasa-gibs",
            kind=kind,
            data={
                "type": "RasterProduct",
                "tileSource": {
                    "kind": "wms",
                    "url": GIBS_WMS,
                    "wmsLayers": product,
                    "wmsTime": date,
                    "attribution": product_name,
                },
                "product": product,
                "productDate": date,
                "compositePeriod": "rolling 8-day" if layer == "vegetation" else None,
            },
            attribution=attribution,
            documentation_url=documentation_url,
            data_time=date + "T00:00:00Z",
            ttl_seconds=21600,
            units={"temperature": "°C"}
            if layer == "sea-temperature"
            else {"NDVI": "unitless index"}
            if layer == "vegetation"
            else {"AOD": "unitless optical depth"}
            if layer == "smoke-aerosols"
            else {"radiance": "NASA Black Marble nighttime radiance"}
            if layer == "night-lights"
            else {},
        )
        result["coverage"] = coverage
        if layer == "night-lights":
            result["referenceVintage"] = f"Black Marble daily composite · {date}"
        elif layer == "vegetation":
            result["referenceVintage"] = f"Rolling 8-day NDVI composite · {date}"
        elif layer == "smoke-aerosols":
            result["referenceVintage"] = f"Daily satellite analysis · {date}"
        return result

    return await cache.get_or_fetch("gibs:" + product, fetch)


async def vessel_density(client: httpx.AsyncClient) -> dict[str, Any]:
    async def fetch() -> dict[str, Any]:
        root = ET.fromstring(
            await bounded_get(
                client,
                EMODNET_WMS,
                params={"service": "WMS", "request": "GetCapabilities"},
                max_bytes=12_000_000,
            )
        )
        ns = {"w": "http://www.opengis.net/wms"}
        record = next(
            (
                item
                for item in root.findall(".//w:Layer", ns)
                if item.findtext("w:Name", namespaces=ns) == "vesseldensity_allavg"
            ),
            None,
        )
        if record is None:
            raise TypeError("EMODnet vessel density product is absent")
        dimension = record.find("w:Dimension", ns)
        date = dimension.get("default") if dimension is not None else None
        if not date:
            raise TypeError("EMODnet density reference year is unavailable")
        year = int(date[:4])
        result = cache.envelope(
            source="emodnet-human-activities",
            kind="composite",
            data={
                "type": "RasterProduct",
                "tileSource": {
                    "kind": "wms",
                    "url": EMODNET_WMS,
                    "wmsLayers": "vesseldensity_allavg",
                    "wmsTime": date,
                    "attribution": "EMODnet Human Activities · Cogea · AIS-derived vessel density",
                },
                "productDate": date,
                "period": str(year),
                "limitations": record.findtext("w:Abstract", namespaces=ns),
            },
            attribution="EMODnet Human Activities · Cogea · vessel density",
            documentation_url="https://emodnet.ec.europa.eu/en/human-activities-eu-vessel-density-map-detailed-method",
            data_time=date,
            ttl_seconds=86400,
            units={"density": "vessel hours/km²/month"},
        )
        result.update(
            coverage="European waters and adjacent seas · annual mean of monthly AIS density",
            referenceVintage=f"{year} annual average",
            validFrom=f"{year}-01-01T00:00:00Z",
            validTo=f"{year + 1}-01-01T00:00:00Z",
        )
        return result

    return await cache.get_or_fetch("emodnet:vessel-density:annual:all", fetch)


async def glotec(client: httpx.AsyncClient) -> dict[str, Any]:
    async def fetch() -> dict[str, Any]:
        response = await client.get(GLOTEC_INDEX)
        response.raise_for_status()
        index = response.json()
        if not isinstance(index, list):
            raise TypeError("GloTEC index is not a list")
        valid = [
            item
            for item in index
            if isinstance(item, dict)
            and re.fullmatch(
                r"/products/glotec/geojson_2d_urt/glotec_icao_\d{8}T\d{6}Z\.geojson",
                str(item.get("url", "")),
            )
            and isinstance(item.get("time_tag"), str)
        ]
        if not valid:
            raise TypeError("GloTEC index has no supported products")
        latest = max(valid, key=lambda item: item["time_tag"])
        response = await client.get("https://services.swpc.noaa.gov" + latest["url"])
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict) or not isinstance(payload.get("features"), list):
            raise TypeError("GloTEC product has no features")
        features = []
        for feature in payload["features"]:
            geometry = feature.get("geometry") or {}
            p = feature.get("properties") or {}
            coord = geometry.get("coordinates")
            if geometry.get("type") != "Point" or not isinstance(coord, list) or len(coord) < 2:
                continue
            lon, lat, tec = number(coord[0]), number(coord[1]), number(p.get("tec"))
            if (
                lon is None
                or lat is None
                or tec is None
                or not -180 <= lon <= 180
                or not -90 <= lat <= 90
                or tec < 0
            ):
                continue
            west, east = max(-180, lon - 2.5), min(180, lon + 2.5)
            south, north = max(-85, lat - 1.25), min(85, lat + 1.25)
            if south >= north:
                continue
            features.append(
                {
                    "type": "Feature",
                    "id": f"tec:{lon:g}:{lat:g}",
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [
                            [
                                [west, south],
                                [east, south],
                                [east, north],
                                [west, north],
                                [west, south],
                            ]
                        ],
                    },
                    "properties": {
                        "tec": round(tec, 3),
                        "anomaly": number(p.get("anomaly")),
                        "qualityFlag": number(p.get("quality_flag")),
                        "validTime": latest["time_tag"],
                    },
                }
            )
        if not features:
            raise TypeError("GloTEC has no finite TEC cells")
        result = cache.envelope(
            source="noaa-glotec",
            kind="model",
            data={"type": "FeatureCollection", "features": features, "gridSpacing": [5, 2.5]},
            attribution="NOAA SWPC · GloTEC data-assimilative model",
            documentation_url="https://www.spaceweather.gov/products/glotec",
            data_time=latest["time_tag"],
            ttl_seconds=600,
            units={"tec": "TECU", "anomaly": "TECU"},
        )
        result["coverage"] = (
            "Global · 5° longitude × 2.5° latitude model cells; background estimates where observations are absent"
        )
        if (datetime.now(UTC) - datetime.fromisoformat(latest["time_tag"])).total_seconds() > 3600:
            result.update(status="stale", staleReason="GloTEC model time is more than one hour old")
        return result

    return await cache.get_or_fetch("swpc:glotec:urt", fetch)


def decode_grib(payload: bytes, *, stride: int = 1) -> dict[str, Any]:
    if (
        len(payload) < 20
        or payload[:4] != b"GRIB"
        or payload[7] != 2
        or int.from_bytes(payload[8:16], "big") != len(payload)
        or payload[-4:] != b"7777"
    ):
        raise TypeError("NOMADS record is not a complete GRIB2 message")
    handle = eccodes.codes_new_from_message(payload)
    try:
        if eccodes.codes_get(handle, "gridType") != "regular_ll":
            raise TypeError("Only regular latitude-longitude grids are supported")
        nx, ny = int(eccodes.codes_get(handle, "Ni")), int(eccodes.codes_get(handle, "Nj"))
        if nx * ny > 2_500_000:
            raise TypeError("GRIB grid exceeds supported size")
        values = eccodes.codes_get_values(handle).reshape(ny, nx)[::stride, ::stride]
        missing = eccodes.codes_get(handle, "missingValue")
        values = np.where((values == missing) | ~np.isfinite(values), np.nan, values)
        lat = float(eccodes.codes_get(handle, "latitudeOfFirstGridPointInDegrees"))
        lon = float(eccodes.codes_get(handle, "longitudeOfFirstGridPointInDegrees"))
        dx = float(eccodes.codes_get(handle, "iDirectionIncrementInDegrees")) * stride
        dy = float(eccodes.codes_get(handle, "jDirectionIncrementInDegrees")) * stride
        if not eccodes.codes_get(handle, "jScansPositively"):
            dy = -dy
        if eccodes.codes_get(handle, "iScansNegatively"):
            dx = -dx
        if eccodes.codes_get(handle, "jPointsAreConsecutive") or eccodes.codes_get(
            handle, "alternativeRowScanning"
        ):
            raise TypeError("Unsupported GRIB scan order")
        stamp = lambda prefix: datetime.strptime(
            str(eccodes.codes_get(handle, prefix + "Date"))
            + f"{int(eccodes.codes_get(handle, prefix + 'Time')):04d}",
            "%Y%m%d%H%M",
        ).replace(tzinfo=UTC)
        return {
            "nx": values.shape[1],
            "ny": values.shape[0],
            "lon0": lon,
            "lat0": lat,
            "dx": dx,
            "dy": dy,
            "values": [round(float(v), 3) if np.isfinite(v) else None for v in values.ravel()],
            "issuedAt": iso(stamp("data")),
            "validAt": iso(stamp("validity")),
            "unit": eccodes.codes_get(handle, "units"),
        }
    finally:
        eccodes.codes_release(handle)


async def grib_fields(client: httpx.AsyncClient, wave: bool = False) -> dict[str, Any]:
    key = "nomads:gfs-wave:global:swell-v3" if wave else "nomads:gfs:global:surface"

    async def fetch() -> dict[str, Any]:
        now = datetime.now(UTC)
        available = now - timedelta(hours=4)
        cycle = available.replace(hour=available.hour // 6 * 6, minute=0, second=0, microsecond=0)
        error = None
        for back in range(3):
            issue = cycle - timedelta(hours=back * 6)
            forecast = max(0, int((now - issue).total_seconds() // 10800) * 3)
            hour = f"{issue.hour:02d}"
            date = issue.strftime("%Y%m%d")
            filename = (
                f"gfswave.t{hour}z.global.0p25.f{forecast:03d}.grib2"
                if wave
                else f"gfs.t{hour}z.pgrb2.1p00.f{forecast:03d}"
            )
            url = (
                f"{NOMADS}/gfs.{date}/{hour}/" + ("wave/gridded/" if wave else "atmos/") + filename
            )
            try:
                index = (await bounded_get(client, url + ".idx", max_bytes=500_000)).decode()
                lines = index.strip().splitlines()
                tokens = (
                    {
                        "height": ":HTSGW:surface:",
                        "period": ":PERPW:surface:",
                        "direction": ":DIRPW:surface:",
                        "swellHeight": ":SWELL:1 in sequence:",
                        "swellPeriod": ":SWPER:1 in sequence:",
                        "swellDirection": ":SWDIR:1 in sequence:",
                    }
                    if wave
                    else {
                        "u": ":UGRD:10 m above ground:",
                        "v": ":VGRD:10 m above ground:",
                        "pressure": ":PRMSL:mean sea level:",
                    }
                )
                fields = {}
                for name, token in tokens.items():
                    position = next((i for i, line in enumerate(lines) if token in line), None)
                    if position is None or position + 1 >= len(lines):
                        raise TypeError("Required GRIB record or end offset is absent")
                    start, end = (
                        int(lines[position].split(":")[1]),
                        int(lines[position + 1].split(":")[1]) - 1,
                    )
                    raw = await bounded_get(
                        client,
                        url,
                        max_bytes=5_000_000,
                        headers={"Range": f"bytes={start}-{end}", "Accept-Encoding": "identity"},
                    )
                    fields[name] = await asyncio.to_thread(
                        decode_grib, raw, stride=4 if wave else 1
                    )
                first = next(iter(fields.values()))
                layout = {k: first[k] for k in ("nx", "ny", "lon0", "lat0", "dx", "dy")}
                if any(
                    any(value[k] != layout[k] for k in layout)
                    or value["validAt"] != first["validAt"]
                    for value in fields.values()
                ):
                    raise TypeError("Forecast component grids/times do not match")
                data = {
                    "type": "GridField",
                    **layout,
                    "fields": {name: value["values"] for name, value in fields.items()},
                    "product": filename,
                    "nativeResolutionDegrees": 0.25 if wave else 1,
                    "validAt": first["validAt"],
                }
                return cache.envelope(
                    source="noaa-gfs-wave" if wave else "noaa-gfs",
                    kind="forecast",
                    data=data,
                    attribution="NOAA/NCEP · GFS Wave"
                    if wave
                    else "NOAA/NCEP · Global Forecast System",
                    documentation_url="https://nomads.ncep.noaa.gov/",
                    data_time=first["issuedAt"],
                    valid_from=first["validAt"],
                    ttl_seconds=3600,
                    units={
                        "height": "m",
                        "period": "s",
                        "direction": "° from true north",
                        "swellHeight": "m",
                        "swellPeriod": "s",
                        "swellDirection": "° from true north",
                    }
                    if wave
                    else {"u": "m/s", "v": "m/s", "pressure": "Pa"},
                )
            except (httpx.HTTPError, TypeError, ValueError) as exc:
                error = exc
        raise TypeError("No supported recent NOAA forecast cycle is available") from error

    return await cache.get_or_fetch(key, fetch)


async def ocean_currents(client: httpx.AsyncClient) -> dict[str, Any]:
    async def fetch() -> dict[str, Any]:
        # 0.25° provider grid sampled every 8 cells (2° overview); no invented coastal values.
        query = "ugos[(last)][(89.875):8:(-89.875)][(-179.875):8:(179.875)],vgos[(last)][(89.875):8:(-89.875)][(-179.875):8:(179.875)]"
        response = await client.get(CURRENTS + "?" + query, timeout=45)
        response.raise_for_status()
        payload = response.json()
        table = payload.get("table") or {}
        columns = table.get("columnNames") or []
        rows = table.get("rows")
        if (
            columns != ["time", "latitude", "longitude", "ugos", "vgos"]
            or not isinstance(rows, list)
            or not rows
        ):
            raise TypeError("Ocean current response schema is unsupported")
        latitudes = sorted({row[1] for row in rows}, reverse=True)
        longitudes = sorted({row[2] for row in rows})
        nx, ny = len(longitudes), len(latitudes)
        if nx * ny != len(rows) or nx < 2 or ny < 2:
            raise TypeError("Ocean current grid is incomplete")
        li = {value: i for i, value in enumerate(latitudes)}
        xi = {value: i for i, value in enumerate(longitudes)}
        u = [None] * (nx * ny)
        v = [None] * (nx * ny)
        times = set()
        for row in rows:
            times.add(row[0])
            index = li[row[1]] * nx + xi[row[2]]
            u[index], v[index] = number(row[3]), number(row[4])
        if len(times) != 1:
            raise TypeError("Ocean current response mixes analysis times")
        valid = times.pop()
        result = cache.envelope(
            source="noaa-coastwatch-geostrophic",
            kind="analysis",
            data={
                "type": "GridField",
                "nx": nx,
                "ny": ny,
                "lon0": longitudes[0],
                "lat0": latitudes[0],
                "dx": longitudes[1] - longitudes[0],
                "dy": latitudes[1] - latitudes[0],
                "fields": {"u": u, "v": v},
                "nativeResolutionDegrees": 0.25,
                "validAt": valid,
            },
            attribution="NOAA CoastWatch/OceanWatch · NOAA/NESDIS · SWFSC ERD",
            documentation_url="https://coastwatch.pfeg.noaa.gov/erddap/info/nesdisSSH1day/index.html",
            data_time=valid,
            ttl_seconds=21600,
            units={"u": "m/s", "v": "m/s"},
        )
        result["coverage"] = (
            "Global ocean · 2° sampled geostrophic analysis; masked coastal/equatorial gaps"
        )
        if (datetime.now(UTC) - datetime.fromisoformat(valid)).total_seconds() > 7 * 86400:
            result.update(
                status="stale", staleReason="Latest provider analysis is older than seven days"
            )
        return result

    return await cache.get_or_fetch("coastwatch:geostrophic:2deg", fetch)


async def submarine_cables(client: httpx.AsyncClient) -> dict[str, Any]:
    # Bundled global OSM snapshot; avoid a global public Overpass scan at runtime.
    data = json.loads(
        (Path(__file__).parent / "data" / "atlas" / "submarine-cables.geojson").read_text()
    )
    result = cache.envelope(
        source="openstreetmap-submarine-cables",
        kind="reference",
        data=data,
        attribution="OpenStreetMap contributors · ODbL 1.0",
        documentation_url="https://www.openstreetmap.org/copyright",
        data_time=data["snapshotDate"] + "T00:00:00Z",
        ttl_seconds=86400,
    )
    result.update(referenceVintage=data["referenceVintage"], coverage=data["coverage"])
    return result


def global_vessel_density() -> dict[str, Any]:
    data = {
        "type": "RasterReference",
        "tileSource": {
            "kind": "image",
            "url": "/api/v1/atlas/vessel-density-global-image",
            "bounds": [[-85.05112878, -180], [85.05112878, 180]],
            "attribution": "World Bank / IMF · ESMAP / PROBLUE · CC BY 4.0",
        },
        "period": "January 2015–February 2021",
        "rendering": "Logarithmic relative AIS report intensity · European-style palette with sparse-report fading · resampled overview",
    }
    result = cache.envelope(
        source="world-bank-imf-shipping-density",
        kind="reference",
        data=data,
        attribution="World Bank / IMF · ESMAP / PROBLUE · CC BY 4.0",
        documentation_url="https://datacatalog.worldbank.org/search/dataset/0037580/global-shipping-traffic-density",
        ttl_seconds=86400,
        units={
            "sourceQuantity": "Hourly AIS report positions per 0.005° source cell",
            "display": "Logarithmic relative intensity",
        },
    )
    result.update(
        referenceVintage="January 2015–February 2021",
        coverage="Global · all vessel categories · historical AIS report density",
        validFrom="2015-01-01T00:00:00Z",
        validTo="2021-03-01T00:00:00Z",
    )
    return result


async def environment_layer(client: httpx.AsyncClient, layer: str) -> dict[str, Any]:
    if layer in GIBS_PRODUCTS:
        return await gibs_metadata(client, layer)
    if layer == "vessel-density-global":
        return global_vessel_density()
    if layer == "vessel-density":
        return await vessel_density(client)
    if layer == "glotec":
        return await glotec(client)
    if layer == "ocean-currents":
        return await ocean_currents(client)
    if layer == "submarine-cables":
        return await submarine_cables(client)
    if layer in {"surface-wind", "pressure", "waves"}:
        result = await grib_fields(client, layer == "waves")
        data = result["data"]
        names = {
            "surface-wind": ("u", "v"),
            "pressure": ("pressure",),
            "waves": (
                "height",
                "period",
                "direction",
                "swellHeight",
                "swellPeriod",
                "swellDirection",
            ),
        }[layer]
        return {
            **result,
            "coverage": "Global · 1° forecast overview",
            "data": {**data, "fields": {name: data["fields"][name] for name in names}},
            "units": {name: result["units"][name] for name in names},
        }
    raise ValueError("Unknown environment layer")
