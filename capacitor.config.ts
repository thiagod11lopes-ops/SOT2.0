import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  /** Identificador único do app na Play Store / package Android. Use reverse-domain. */
  appId: "br.com.sot.mobile",
  appName: "SOT Saídas",
  /**
   * Pasta gerada por `npm run build:capacitor`. O `index.html` dentro de `dist-capacitor`
   * é, na verdade, o shell mobile (cópia de `mobile.html`), para que o WebView abra a UI
   * de saídas directamente, sem carregar a vista desktop.
   */
  webDir: "dist-capacitor",
  bundledWebRuntime: false,
  android: {
    /** Permite usar localhost/https no WebView; necessário para Firebase Auth/Functions. */
    allowMixedContent: false,
    /** Mantém a app a usar o esquema https para conformidade de cookies/storage. */
    webContentsDebuggingEnabled: true,
    /**
     * Obrigatório pelo plugin @capacitor-community/background-geolocation para que as
     * actualizações de localização não parem após 5 minutos em background. Ver
     * https://github.com/capacitor-community/background-geolocation/issues/89
     */
    useLegacyBridge: true,
  },
  plugins: {
    /**
     * Após 5 minutos em background o WebView do Android estrangula `fetch`/XHR. Quando
     * `CapacitorHttp` está activo, os pedidos saem pela camada nativa e não são afectados.
     * Aplica-se a TODAS as chamadas `fetch` da app uma vez que está activo.
     */
    CapacitorHttp: {
      enabled: true,
    },
    BackgroundGeolocation: {
      // Configurado por chamada em runtime (mobileDriverTracking.ts).
    },
  },
};

export default config;
