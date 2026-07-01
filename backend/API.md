# EchoLux API

`api.py` wraps the pipeline modules in `src/` with FastAPI so the
dashboard in `../frontend` has something real to call. It does not modify
`main.py` or anything in `src/` — same imports, same functions, just
exposed over HTTP instead of run as a batch script.

## Run it

```bash
cd backend                      # this directory
pip install -r requirements.txt
uvicorn api:app --reload --port 8000
```

Visit `http://localhost:8000/api/health`. You should see `cachedTargets`
> 0 — if it's 0, run `python main.py` first (this API reads from
`data/raw/*.npz`, it doesn't download anything itself).

## Endpoints

| Method | Path                     | Returns                                       |
| ------ | ------------------------ | ---------------------------------------------- |
| GET    | `/api/health`            | `{ classifierLoaded, cachedTargets }`          |
| GET    | `/api/targets`           | List of cached targets (id, TOI, disposition)  |
| GET    | `/api/targets/{tic_id}`  | Full `ExoplanetTarget` payload                 |

`{tic_id}` accepts `307210830`, `TIC 307210830`, or `TIC-307210830`.

## What it actually does per request

For `GET /api/targets/{tic_id}`:

1. Loads the cached `.npz` light curve (no network call).
2. Runs `preprocess_lightcurve` → `run_bls_search` — the expensive step,
   a few seconds on a full-size light curve.
3. Runs the trained classifier, if `data/classifier_model.pkl` exists. If
   not, `classification` comes back `null` and the dashboard shows its
   "classifier not trained yet" state instead of guessing.
4. If the effective label is `"Planet"`, also runs the trapezoidal fit
   (`compute_phase_folded_lc` + `fit_transit_parameters`).
5. Caches the assembled JSON in memory, keyed by TIC ID. Pass
   `?refresh=true` to force recomputation (useful after re-running
   `main.py`).

Light curve and periodogram arrays are downsampled before being sent
(`?max_lc_points=4000` / `?max_periodogram_points=1500` by default, both
overridable) — raw arrays can run into the tens of thousands of points,
more than a browser chart needs.

## Verified, not just written

Every call this file makes into `src/` — function names, argument order,
return-dict keys, and every unit conversion (BLS duration days→hours,
fit epoch days→minutes, fit depth fraction→ppt) — has been checked two
ways: a line-by-line read against the actual `src/` source, and an
executable test that imports the real `classifier.py` and
`parameter_estimation.py` (the two modules with no hard dependency on
astropy/lightkurve) and runs them against fabricated data, confirming the
recovered values match expectations. `preprocessing.py` and
`dip_detection.py` were verified by reading only, since both require
astropy/lightkurve to execute.

One specific design choice worth knowing: `main.py` triggers the
trapezoidal fit on `pred_class == "Planet" or assigned_label == "Planet"`
— an OR, useful during training to compare the model's prediction against
the original heuristic label side by side. This API instead defers
entirely to the trained model once one exists, falling back to the
heuristic only when no model is trained yet. For a single live lookup,
the model's own prediction is the more meaningful signal.

## One unit to double-check

`transit.catalog.depthPpm` is passed through from the TOI table's
`pl_trandep` column as-is, on the assumption it's already in ppm.
`transit.bls.depth`, by contrast, is unambiguously fractional in this
codebase (see `classifier.py`'s `depth * 1000` → ppt conversions,
confirmed via the executable test above). `pl_trandep`'s unit is asserted
by the catalog, not derived anywhere in this pipeline, so it's worth a
quick check against `data/toi_list.csv`'s column docs before that number
drives anything published.

## Before a hackathon demo

Pre-warm the cache: hit `/api/targets/{id}` for every target you'll show
*before* you're live, so the first click in front of judges isn't the one
paying the multi-second BLS cost.
