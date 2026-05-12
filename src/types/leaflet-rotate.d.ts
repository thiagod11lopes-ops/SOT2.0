/**
 * `leaflet-rotate` não publica `.d.ts`. Declaramos um módulo opaco — o plugin
 * só é importado pelos seus side-effects (estende `L.Map.prototype` com `setBearing`
 * e adiciona opções `rotate`/`bearing`/`touchRotate`). O subconjunto que usamos
 * está tipado localmente em `src/saidas-mobile/navigation-fullscreen-modal.tsx`.
 */
declare module "leaflet-rotate";
