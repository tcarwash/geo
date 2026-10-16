# Geo desktop

The desktop package wraps the existing Geo app; it does not fork the frontend or data logic. Electron opens the same Vite build used by the web deployment and starts the same FastAPI application as a private, single-user local service. The backend serves the built frontend and API from one loopback origin. SQLite lives in Electron's per-user application-data directory. Redis is disabled for this one-process install.

## Local development

From the repository root:

```sh
cd frontend
npm ci
npm run build
cd ../backend
uv sync --extra dev --extra desktop
uv run python build_desktop.py
cd ../desktop
pnpm install
pnpm packaging:check
pnpm start
```

The package build expects `frontend/dist` and `backend/dist/geo-backend` to exist. The Python sidecar is built for the current OS and CPU architecture; do not copy a sidecar built on a different platform.

## Local data sources

Geo starts in private mode so local-only layers remain available. The existing WSJT-X UDP adapter listens on `127.0.0.1:2237` by default. In WSJT-X, enable UDP reporting and send to that address. Set `GEO_WSJT_X_UDP_PORT` before launching Geo to use another port. The desktop service binds its HTTP API only to loopback; it is not a LAN or internet server. Future local adapters belong in the shared backend, not the Electron main process.

## CI and releases

`.github/workflows/desktop.yml` runs the shared frontend/backend tests, builds native packages on Linux, Windows, and macOS runners, and uploads CI artifacts. A `v*` tag also publishes those packages to its GitHub Release. Builds are currently unsigned; macOS notarization and Windows signing require maintainer credentials and are not configured. The existing Docker image workflow remains separate but uses the same version tag.

Packaging dependencies install with pnpm 10.7.0 and a frozen lockfile. The explicit build-script allowlist includes `fs-xattr` and `macos-alias` for DMGs and `electron-winstaller` for Windows tools; unapproved scripts fail installation. `pnpm packaging:check` loads the native DMG modules on macOS, checks Windows installer tools, and checks maker prerequisites before the expensive builds. On release tags, it also requires the tag version to match `desktop/package.json`.

Before creating a release, set `desktop/package.json`'s `version` to the intended tag without its `v` prefix (for example, `0.1.1` for `v0.1.1`). From `desktop`, run `GITHUB_REF=refs/tags/v0.1.1 pnpm packaging:check`, then commit and push the version change before creating the matching tag on that commit. The frontend and backend have independent versions and do not need to change for this check.

If a tag fails this check, re-running its workflow still checks out the same tagged source. To retry that version, the tag must point to the commit containing the corrected desktop version; otherwise, prepare a new version and matching tag on a new commit. A manually dispatched build uploads CI artifacts but does not publish release assets.

Each platform runs `pnpm sidecar:check` against its frozen backend to verify startup, the private API, and serving the built frontend. Linux additionally runs the packaged Electron browser smoke check. Windows installer interactions and macOS DMG mounting still need manual validation on those platforms. To build locally after producing the frontend and sidecar, run `pnpm sidecar:check` and `pnpm make`; outputs are in `desktop/out/make`.

The current Political Atlas and Grayscale maps are local vector layers. Remote imagery/raster layers still need a connection; managed offline tile packs are a separate future feature.
