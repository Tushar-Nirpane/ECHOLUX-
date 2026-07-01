# EchoLux

Deep Space Command Center for TESS exoplanet detection — built for the
ISRO hackathon. A Python pipeline (lightkurve, astropy, scikit-learn) runs
BLS transit search and ML classification on TESS light curves; a FastAPI
layer serves the results; a React dashboard visualizes them.

```
EchoLux/
├── backend/          Python pipeline + API
│   ├── main.py        original batch pipeline (download → BLS → train → plot)
│   ├── api.py          FastAPI bridge — serves the pipeline over HTTP
│   ├── API.md           docs for api.py specifically
│   ├── README.md        original project README
│   └── src/              pipeline modules (unchanged)
└── frontend/         React dashboard
    ├── .env.example      template for pointing at the backend
    ├── README.md
    └── src/
```

## Run it, in order

**1. Backend — get at least one target analyzed and cached.**

```bash
cd backend
pip install -r requirements.txt
python main.py --targets 15        # downloads + analyzes + trains the classifier
```

This needs internet access (queries the NASA Exoplanet Archive and
downloads TESS light curves via lightkurve) and takes a few minutes. It
populates `data/raw/*.npz` and trains `data/classifier_model.pkl`.

**2. Backend — start the API.**

```bash
uvicorn api:app --reload --port 8000
```

Check `http://localhost:8000/api/health` — `cachedTargets` should be > 0.

**3. Frontend — point it at the backend and run.**

```bash
cd ../frontend
npm install
cp .env.example .env
# uncomment VITE_API_BASE_URL=http://localhost:8000 in .env
npm run dev
```

Opens at `http://localhost:5173`.

## How to know it's actually wired, not just running

The header shows a "Mock Data" badge whenever `VITE_API_BASE_URL` is
unset or the backend isn't reachable — the frontend runs standalone on
realistic generated data with no backend at all, specifically so step 3
doesn't block on steps 1–2 while you're working on UI independently. Once
the badge disappears, you're looking at real BLS/classifier output for
whatever TIC ID is loaded. That disappearance is the actual proof the
integration works — not anything either README can promise on its own.

If the backend is configured but unreachable (wrong port, not started,
crashed), that surfaces as a real error screen, not a silent fallback to
fake data — important for a demo, since a crashed backend should never
quietly look like a working one.

## What's been verified, and how

Two independent checks, on each side:

**Frontend** — every `.ts`/`.tsx` file parsed with the real TypeScript
compiler, zero syntax errors. Not a read-through; mechanically confirmed.

**Backend (`api.py` ↔ `src/`)** — every function call api.py makes into
`src/` (argument order, return-dict keys, every unit conversion) was
checked two ways: a line-by-line read against the actual source files in
this repo, and an executable test that imports the real `classifier.py`
and `parameter_estimation.py` — the two modules with no hard dependency
on astropy/lightkurve — and runs them against fabricated data, confirming
recovered values match expectations to the precision scipy's `curve_fit`
actually produces. `preprocessing.py` and `dip_detection.py` (both
astropy/lightkurve-dependent) were verified by reading only, since
executing them needs packages unavailable in the environment doing this
verification. See `backend/API.md` for the full breakdown.

Neither check replaces actually running `python main.py` end to end with
real TESS data and your own eyes on the dashboard — that's the real test,
and it needs your own machine with internet access and the full
`requirements.txt` installed.

## Two things worth a second look

- `backend/api.py` passes `pl_trandep` (the TOI catalog's transit depth)
  through as ppm, on the assumption that's its actual unit — confirmed
  for `transit.bls.depth` (fractional, verified above) but only assumed
  for the raw catalog column. Worth checking against
  `data/toi_list.csv`'s header before it drives a published number.
- Every `lucide-react` icon name used in the frontend is one I'm
  confident exists in the pinned version, but icon-font correctness can
  only be fully confirmed by `npm install` actually running on a machine
  with internet access. If one ever renders as a broken/undefined
  component, it's a one-line swap — purely decorative.
