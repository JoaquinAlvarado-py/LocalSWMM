# PPT-01 — OpenSWMM engine gap + user-based model library on free cloud

Notes for a technical presentation. All claims cite their primary source (GitHub API, official docs). Retrieved 2026-08-29.

---

## Topic A — The actual gap: who builds on the HydroCouple OpenSWMM 6 engine, and the May 2026 upgrade

### A.1 The repo: `HydroCouple/openswmm.engine`

Primary source: GitHub API for the repo. URL: https://github.com/HydroCouple/openswmm.engine (API: https://api.github.com/repos/HydroCouple/openswmm.engine)

- **Kind:** a **fork** of `USEPA/Stormwater-Management-Model` (the EPA SWMM 5.x repo). `parent.full_name = USEPA/Stormwater-Management-Model`, `fork = true`. The fork was **created 2025-07-11**.
- **Default branch:** `develop`. Other branches include `main`, **`swmm6_rel`** (release branch) and **`swmm6_exp`** (experimental), plus `build-v5.2.x`, `port/v2-on-marcher`, feature/CI branches.
- **Activity:** `pushed_at 2026-08-29`; 30 stars, 12 forks, 57 open issues (as of 2026-08-29).
- **Description (GitHub):** "Dynamic hydrology-hydraulic water quality simulation model for stormwater, wastewater, and combined sewer collection systems". Homepage: https://www.hydrocouple.org/openswmm.engine/.
- **Tags (24):** legacy 5.x line `v5.0.22` … `v5.2.4`, then the new line `v6.0.0-alpha.1 / alpha.2 / alpha.3`.
- **License:** the `LICENSE` file on `develop` is **MIT, "Copyright 2026 Caleb Buahin"**, with a note that EPA-origin material is in the public domain under 17 USC § 105 (https://github.com/HydroCouple/openswmm.engine/blob/develop/LICENSE). The `main` branch LICENSE is MIT "Copyright (c) 2025 HydroCouple". **Note an inconsistency:** the README footer and the generated docs site claim "Apache License, Version 2.0" while the LICENSE file is MIT (see https://raw.githubusercontent.com/HydroCouple/openswmm.engine/main/README.md and https://www.hydrocouple.org/openswmm.engine/). Worth flagging if license matters to the presentation.

### A.2 The May 2026 "significant upgrade": v6.0.0-alpha.1

Primary source: releases list + commits list via GitHub API, and README.

- **Three 6.0.0 alpha releases so far** (https://api.github.com/repos/HydroCouple/openswmm.engine/releases):
  - `v6.0.0-alpha.1` — published **2026-05-27**, titled **"Open Source SWMM (SWMM2D) 6.0.0-alpha.1 Release"**. This is the debut release of the v6 engine ("Open SWMM Version 6.0.0 Debut Release", PR #54).
  - `v6.0.0-alpha.2` — 2026-07-08.
  - `v6.0.0-alpha.3` — 2026-08-12 (current).
- So yes: **the big upgrade is real and it landed in May 2026** — the entire 6.0.0-alpha.1 milestone. Commit history shows a burst through May 22–27 2026: version bump to `6.0.0a1` (2026-05-23), "Alpha 1 stop" (2026-05-23), packaging/wheel builds for Windows/Linux/macOS, and notably **"Expanding API to support GUI development" / "Update api for GUI" / "Expanding api for ui" (2026-05-25/26)** — i.e., the engine API was deliberately opened up for GUIs (relevant to LocalSWMM, whose GitHub repo was created two days after alpha.1, on 2026-05-29).
- **What makes it distinct from EPA SWMM 5.x** (README, https://github.com/HydroCouple/openswmm.engine, and docs site https://www.hydrocouple.org/openswmm.engine/):
  - Architecture: data-oriented design (Structure-of-Arrays), **reentrant** engine behind an opaque `SWMM_Engine` handle (multiple sims in one process — the basis for the server pool in the CONTEXT.md plan), plugin-based I/O on a dedicated I/O thread, **Kokkos GPU/threaded plugin backends** (OpenMP/CUDA/HIP/SYCL) for the 2D solver loaded at runtime, **C++20** rewrite with the legacy EPA 5.x solver preserved unmodified in `src/legacy/`.
  - Hydraulics: semi-implicit node continuity (default `NODE_CONTINUITY SEMI_IMPLICIT`), Anderson acceleration on Picard iteration (`ANDERSON_ACCEL YES`, −25–50% iterations), dynamic Preissmann slot, explicit finite-volume 1D Godunov routing (`FLOW_ROUTING FV`), **1D/2D coupled overland flow** — this is the "SWMM2D" in the release title.
  - Hydrology: two-zone groundwater model, physics-based RDII initial-abstraction recovery (new `[RDII_DECAY]` section), runtime climate forcing and per-subcatchment PET, consistent snow/rain partitioning.
  - Water quality: Eulerian ADE transport on the FV mesh, treatment-expression engine.
  - Full SWMM 5.x LID controls; HEC-22 inlet analysis; variable-speed pumps; new storage shapes.
  - New domain-split C API under `include/openswmm/engine/`, Python bindings (PyPI package `openswmm`, current version `6.0.0a3`), GeoPackage I/O, hot-start API, CRS support.
- alpha.2/alpha.3 deltas (release bodies): parity fixes for `[CONTROLS]`, `NODE_OUTFLOW` API, analytical test batches, LID unit-conversion fix, 2D explicit local-inertial LTS marcher + Kokkos port, 1D FV finalization/packaging.

### A.3 US EPA SWMM 6.0 status: not released by EPA

- EPA's official SWMM page (last updated 2026-03-17) lists **SWMM 5.2.4 (2023-08-07)** as the latest software and provides no 6.0 download: https://www.epa.gov/water-research/storm-water-management-model-swmm
- The EPA repo `USEPA/Stormwater-Management-Model` has **no 6.x releases or tags** (latest tag `v5.2.4`, releases v5.2.4 … v5.1.13); last push 2025-05-01. https://github.com/USEPA/Stormwater-Management-Model (API: https://api.github.com/repos/USEPA/Stormwater-Management-Model/releases)
- Conclusion: **EPA has not shipped a SWMM 6.0.** The 6.x line exists only as the community continuation (HydroCouple OpenSWMM), currently `6.0.0-alpha.3`. (EPA's page does mention "the new graphical user interface being developed for SWMM" in the context of SSOAP retirement — context worth one slide if relevant.)

### A.4 Who is building on the engine (and the GAP)

Sources: GitHub repo search + forks list + org repo list (https://api.github.com/search/repositories?q=openswmm.engine, https://api.github.com/orgs/HydroCouple/repos, https://api.github.com/repos/HydroCouple/openswmm.engine/forks).

**Official HydroCouple ecosystem (engine-adjacent):**
- `HydroCouple/openswmm.gui` — Qt6/C++ **desktop** GUI for the v6 engine, GPLv3 (https://github.com/HydroCouple/openswmm.gui).
- `HydroCouple/openswmm.engine.wasm` — **"Web assembly bindings for the Open-Source SWMM Engine"**, created 2026-08-01. As of retrieval it contains only `LICENSE` + `README.md` (a stub — no bindings code published yet): https://github.com/HydroCouple/openswmm.engine.wasm
- `HydroCouple/openswmm.mcp` (MCP server), `HydroCouple/openswmm.gymnasium` (RL framework), `HydroCouple/openswmm.lab` (tutorial notebooks), benchmark repos, and sibling `HydroCouple/openepanet.engine`.

**External projects that reference/use the engine:**
- **`JoaquinAlvarado-py/LocalSWMM` — this project.** "An open-source Web UI for OpenSWMM 6 … run simulations on your browser" (3 stars, created 2026-05-29). README: uses the HydroCouple OpenSWMM engine "to execute hydraulic simulations directly in your web browser thanks to WebAssembly". Live at https://swmm6.is-local.org/
- **`dickinsonre/BatchSWMMRunner`** — React/Express batch runner; its engine-mode table includes **"WASM6 = OpenSWMM 6.0.0-alpha compiled to WebAssembly, entirely in your browser"** alongside EPA SWMM 5.2 modes (server executable / C API / WASM). So a second web app runs the v6 engine in-browser, but it is a batch runner, not an interactive modeling GUI. https://github.com/dickinsonre/BatchSWMMRunner
- **`razaali10/OPENSWMM` + `OpenSWMM-Custom-GPT-Gateway`** — a FastAPI **MCP + REST gateway** wrapping an OpenSWMM 6 "session pool" (server-side, Python; targets Claude/ChatGPT agents). https://github.com/razaali10/OPENSWMM
- `ElhadiMohsenAbdalla/CASWMM_shiny` — R/Shiny web app for coupled CAFlood–SWMM runs; appears to drive executables (engine provenance unverified; likely EPA SWMM, not the HydroCouple v6). https://github.com/ElhadiMohsenAbdalla/CASWMM_shiny
- The engine's **12 forks** are mostly mirrors/syncs (e.g., `SWMM-Project`, `SWMMBobSWMM6`, `iut-ibk`, `mklei`, `ddspot` — ddspot is an actual contributor, `chenjie0927`, `wanghai1988`, `CIMM-ORG`, `allgamers77`, plus `JoaquinAlvarado-py` [LocalSWMM] and two consultancies: `Hazen-Hydraulic-Modeling`, `richard-davey-arcadisgen`).

**The gap:** in-browser (WASM) consumers of the OpenSWMM 6 engine are extremely few. The official WASM bindings repo is an empty stub; the only interactive, map-based **browser GUI** found on the v6 engine is **LocalSWMM**; `BatchSWMMRunner` adds a WASM6 batch mode; everything else is desktop (official Qt GUI), server/Python tooling (MCP/gymnasium/lab/gateway), or unrelated to this engine. That supports the pitch: **LocalSWMM is one of very few (arguably the only) full web/WASM GUIs on the OpenSWMM 6 engine** — a genuine first-mover gap.

---

## Topic I — User-based model library on a free cloud bundle

Goal context: a place where each user of the web app stores their own model files (.inp/.json + results), browser-accessible, ideally without running a backend.

### I.1 Google Drive API — "free bundle to test"

Primary sources:
- https://developers.google.com/drive/api/guides/limits (usage limits; updated for May 1, 2026 quotas)
- https://one.google.com/about/plans ("All Google accounts come with up to 15 GB of storage")
- https://developers.google.com/workspace/drive/api/quickstart/js (pure client-side browser quickstart)
- https://developers.google.com/workspace/drive/api/guides/api-specific-auth (scope categories)
- https://support.google.com/cloud/answer/9110914 and /answer/13463817 (OAuth verification, 100-user cap)

**Free tier facts:**
- **Storage is per-user and free:** every Google account includes **15 GB** of Drive/Gmail/Photos storage (Google One plans page). A web app that writes into *each user's* own Drive effectively gets an unlimited pool of free, user-owned storage — no app-side quota to buy.
- **API usage is free:** "All standard use of the Google Drive API is available at no additional cost." Exceeding quota is only *planned* to incur charges "later in 2026" under Google's standardized model for agent tools and APIs — so today it's effectively free.
- **Quotas (new projects, as of May 1, 2026):** per-minute-per-project **1,000,000 quota units**; per-minute-per-user-per-project **325,000 units**; per-day-per-project **1 TB** of egress (bytes) before charges; daily project threshold **400,000,000 quota units**. "Provided you stay within the per-minute quotas, there's no limit to the number of requests you can make per day." Upload: up to **750 GB/day per user**, max single file **5 TB**.
- Projects that already used the API Nov 2025–Apr 2026 keep their old quotas; new projects get the above.

**Authentication requirements (OAuth):**
- A web app needs a **Google Cloud project** with the Drive API enabled and an **OAuth 2.0 web client ID** (authorized JavaScript origins). Crucially, **"client secrets aren't used for Web applications"** — the browser-only OAuth flow needs no backend secret. The official JS quickstart is a plain client-side HTML page (Google Identity Services + gapi) that lists and reads Drive files — proof that **a personal Drive can be accessed from a web app with zero backend**.
- Consent screen: must be configured (user type External for apps outside your own organization); test users work immediately.

**Scopes (which ones you need, and how painful verification is):**
- **Non-sensitive (no verification required; only optional brand verification):** `drive.file` ("Create new Drive files, or modify existing files, that you open with an app or that the user shares with an app"), `drive.appdata`/`drive.appfolder`, `drive.install`. **`drive.file` is the recommended scope** for a user model library — per-file access, works with all Drive API resources.
- **Sensitive:** `drive.apps.readonly` — requires sensitive-scope verification (~10 business days).
- **Restricted:** `drive`, `drive.readonly`, `drive.metadata(.readonly)`, `drive.activity(.readonly)`, etc. — require restricted-scope verification (~6 weeks + a security assessment; storing restricted-scope data on servers requires assessment). Restricted Drive scopes also have **qualification categories** (backup/sync, productivity/education, reporting/security).
- **The 100-user cap:** unverified apps requesting sensitive/restricted scopes are limited to **100 new users over the lifetime of the project**; exhausting it disables Google sign-in. Using `drive.file` (non-sensitive) avoids this entirely.

**Practical constraints:**
- Each user must have a Google account with Drive enabled and must complete OAuth consent once; the access token lives in their browser (no refresh-token server storage needed in a pure client app; storing refresh tokens server-side requires secure storage).
- Binary files are downloaded via `alt=media` with the access token; CORS is supported (the JS quickstart exercises it).
- If you later want "app hidden" storage, `drive.appdata` gives an invisible per-app folder; `drive.file` + Picker gives a user-visible flow.
- **"Free bundle to test":** Cloud project → enable Drive API → configure OAuth consent screen (External, test users) → create Web client ID → use `drive.file` scope. No billing account required for standard usage today.

### I.2 Alternatives (free bundles, compared on: free quota / user-owned storage? / browser-only, no backend? / complexity)

**GitHub Gists** (primary: https://docs.github.com/en/rest/gists/gists, https://docs.github.com/en/get-started/writing-on-github/editing-and-sharing-content-with-gists/creating-gists)
- Free; per-user, tied to a GitHub account; gists are Git repos.
- Must be signed in to create gists; auth via OAuth `gist` scope or PAT. Rate limits: unauthenticated 60 req/hr, authenticated **5,000 req/hr** (REST API rate-limits doc).
- **Size behavior:** the REST API returns up to **1 MB of content per file** (truncated flag); files larger than ~10 MB require cloning the gist via git — so practical for text `.inp`/`.json` models, poor for large result binaries.
- **Secret gists are not private** (anyone with the URL can view). No per-user storage quota published for gists specifically.
- Complexity: low (simple REST), but no backend-free private storage for arbitrary sizes.

**Dropbox API** (primary: https://www.dropbox.com/individual/plans-comparison → **Basic = 2 GB free**; https://developers.dropbox.com/oauth-guide)
- Free tier **2 GB per user**; OAuth 2.0, browser (PKCE) flow supported.
- **Content access modes** at app creation: **App Folder** (app confined to `/apps/<app>`, suitable for apps that only manage their own content — no approval needed) vs **Full Dropbox** (requires approval).
- Rate limits: no stable public page found for concrete numbers (see "unverified" list) — Dropbox applies per-app/per-user limits under fair use.
- Complexity: medium-low; API is straightforward, but free storage is small (2 GB) and browser-only flows for uploads are clunkier than Drive.

**Cloudflare R2** (primary: https://developers.cloudflare.com/r2/pricing/)
- Free tier: **10 GB-month storage** (Standard only) + **1M Class A ops** + **10M Class B ops** per month; **zero egress fees**.
- **Not user-owned:** the bucket lives in the *app's* Cloudflare account; you must partition per-user yourself. Requires app credentials (S3 API keys) → you need a small backend or a Cloudflare Worker issuing presigned URLs to browsers.
- Complexity: medium (S3 API + Worker/backend needed). Best if the app owns storage and egress costs are a worry.

**Supabase** (primary: https://supabase.com/pricing)
- Free tier ($0): **500 MB database, 1 GB file storage**, 50,000 MAU, 5 GB egress, **max file upload 50 MB**, 2 projects, projects **pause after 1 week inactivity**. Unlimited API requests.
- Hosted Postgres + Storage + Auth: no infra to run; browser access via anon key + Row Level Security. But storage is in **your project** (shared 1 GB), not per-user.
- Complexity: low-medium; auth + storage in one; best for small user bases.

### I.3 Bottom line for LocalSWMM
- **Google Drive is the only option where storage is free per-user (15 GB each), browser-only (no backend), and cheap to wire up** — use OAuth `drive.file` (non-sensitive → no verification, no 100-user cap). This is the natural "free bundle to test" for a user-based model library.
- Gists are a zero-setup stopgap for small text models but can't hold big results and aren't truly private.
- R2/Supabase put storage in the app's own quota (shared, must be partitioned) and effectively require a small backend/Worker; they make sense later for server-side results storage (the planned API/pool path).

---

## URLs I could not fully verify
- **Dropbox API concrete rate limits** — `https://developers.dropbox.com/rates-limits` (and variants) return 404; no stable public page found. Dropbox free tier (2 GB) is verified.
- **GitHub Gist total size limit** — GitHub's docs don't publish a gist-specific on-disk size cap; only the REST behaviors are documented (1 MB per-file API truncation; >10 MB needs git clone).
- **EPA SWMM 6.0** — could not find any EPA 6.0 release or repo; EPA's page lists only 5.2.4. Statement "EPA has not shipped SWMM 6.0" is based on absence in primary sources.
- **`ElhadiMohsenAbdalla/CASWMM_shiny`** — engine provenance (EPA SWMM vs HydroCouple v6) not verified.
- **License identity of `openswmm.engine`** — LICENSE file is MIT, but README/docs claim Apache 2.0; the conflict itself is verified but the "true" license is unresolved.