/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend API origin for production builds (e.g. a Render URL). Leave
   * unset in local dev to use Vite's /api proxy instead. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
