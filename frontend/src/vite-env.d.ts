/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the running ../backend/api.py FastAPI server, e.g. "http://localhost:8000".
   *  Unset = the app runs entirely on mock data (see src/hooks/useExoplanetData.ts). */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
