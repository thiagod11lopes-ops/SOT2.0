/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL absoluta da app principal quando o mobile está noutro domínio (opcional). */
  readonly VITE_PRIMARY_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
