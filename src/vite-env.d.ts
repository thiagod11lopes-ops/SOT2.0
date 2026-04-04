/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL absoluta da app principal quando o mobile está noutro domínio (opcional). */
  readonly VITE_PRIMARY_APP_URL?: string;
  /** Firebase Web App (Console → Configuração do projeto). Obrigatórios para sincronizar saídas na nuvem. */
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
