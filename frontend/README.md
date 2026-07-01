# EchoLux — Frontend

Deep Space Command Center UI for the TESS analysis pipeline. Complete,
runnable Vite + React + TypeScript project — not just components to drop
into something else. See the repo root README for how this fits together
with `../backend`.

## Run it

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`. With no setup at all it runs entirely
on mock data — deterministic per target ID, a "Mock Data" badge shows in
the header so that's never ambiguous.

To point it at the real pipeline instead: get `../backend/api.py` running
first (see `../backend/API.md`), then:

```bash
cp .env.example .env
# uncomment VITE_API_BASE_URL=http://localhost:8000 in .env
npm run dev
```

The "Mock Data" badge disappears once it's actually talking to the
backend — that disappearance is the real confirmation the wiring works,
more than anything either README can promise.

## File map

```
package.json / vite.config.ts / tsconfig*.json / postcss.config.js / index.html
                                             → standard Vite + React + TS + Tailwind scaffold
.env.example                                → template for VITE_API_BASE_URL
src/main.tsx, src/App.tsx, src/index.css    → entry point, mounts MissionControlPage
src/vite-env.d.ts                           → typed VITE_API_BASE_URL env var
tailwind.config.ts                          → theme tokens + pulse/radar/scan keyframes
src/types/exoplanet.ts                      → contract for GET /api/targets/{id}
src/hooks/useExoplanetData.ts               → live fetch when VITE_API_BASE_URL is set, else mock
src/components/layout/DashboardLayout.tsx   → sidebar + header (incl. Mock Data badge) + bento grid shell
src/components/widgets/FluxContainer.tsx        → light curve viewer (zoom/pan, raw/detrended/trend)
src/components/widgets/BLSPeriodogram.tsx       → period vs power area chart
src/components/widgets/PhaseFoldedView.tsx      → Panel D — binned phase-fold + trapezoidal fit overlay
src/components/widgets/MLClassificationCard.tsx → confidence gauge + feature importances
src/MissionControlPage.tsx                  → composes all of the above; what App.tsx renders
```

## Dependency versions

`recharts`, `framer-motion`, and `lucide-react` are pinned in
`package.json` already — `npm install` is all you need. If you want newer
majors later, the components only use stable, long-standing APIs from each
(no version-specific features), so bumping should be low-risk.

## Where this data actually comes from

Read against the real `src/` pipeline modules, not assumed:

| Frontend field                      | Pipeline source                                              |
| ------------------------------------ | -------------------------------------------------------------- |
| `lightCurve[].rawFlux/.detrendedFlux/.trend` | `preprocessing.py` → `raw_flux` / `flat_flux` / `trend`  |
| `periodogram[]`                      | `dip_detection.py` → `results.period` / `results.power`        |
| `transit.bls`                        | `dip_detection.py`'s `run_bls_search()` return dict             |
| `transit.fit`                        | `parameter_estimation.py`'s `fit_transit_parameters()` — only present when the label is `"Planet"`; drawn as the red curve in `PhaseFoldedView` |
| `transit.catalog`                    | the cached `.npz`'s TOI fields (`true_period`, `true_duration`, `true_depth`, `disposition`) |
| `classification.label`               | `"Planet" \| "Eclipse" \| "Blend" \| "Noise"` — `classifier.py`'s actual classes |
| `classification.features`            | `classifier.py`'s `extract_features()` columns, weighted by `model.feature_importances_` |

`classification` is optional — it comes back `null` if
`data/classifier_model.pkl` hasn't been trained yet, and
`MLClassificationCard` renders an explicit empty state for that rather
than a fake result.

## What's actually been verified

Every `.ts`/`.tsx` file in `src/` has been parsed with the real
TypeScript compiler — zero syntax errors, confirmed mechanically, not
just read. On the Python side, `../backend/api.py`'s field mapping was
checked two ways: a line-by-line read against the actual `src/` source,
and an executable test that imports the real `classifier.py` and
`parameter_estimation.py` and runs them against fabricated data,
confirming recovered values and every unit conversion are correct (see
`../backend/API.md` for specifics).

What that can't cover, since it doesn't install packages: full
type-checking against `recharts`, `framer-motion`, and `lucide-react`'s
actual type definitions, or a real browser render — both only happen with
`npm install` on a machine with internet access. The one specific thing
worth knowing: every `lucide-react` icon name used (`Crosshair`,
`BrainCircuit`, `Orbit`, `Telescope`, `TriangleAlert`, etc.) is one I'm
confident exists in the pinned 0.383.0 release, but if one ever comes
back as an undefined-component error, it's a one-line swap for any other
Lucide icon name — purely decorative, nothing structural rides on which
exact icon is used where.

## One unit to double-check

`transit.catalog.depthPpm` is passed through from the TOI table's
`pl_trandep` column as-is, on the assumption it's already in ppm — unlike
`transit.bls.depth`, which this codebase explicitly and confirmedly
treats as fractional. See `../backend/API.md` for the full note.
