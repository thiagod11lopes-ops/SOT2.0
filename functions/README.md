# Cloud Functions - Push de Alarmes Mobile

## Objetivo

Enviar notificações push para motoristas mesmo com o app mobile fechado (PWA), usando Firebase + Web Push.

## Pré-requisitos

- Firebase CLI instalado e autenticado (`firebase login`)
- Projeto Firebase com Firestore e Functions habilitados
- Node.js 20+

## Configuração

1. Ajuste `../.firebaserc` com o `projectId` real.
2. Instale dependências:

```bash
cd functions
npm install
```

3. Defina segredos/variáveis da function:

```bash
firebase functions:secrets:set WEB_PUSH_VAPID_PUBLIC_KEY
firebase functions:secrets:set WEB_PUSH_VAPID_PRIVATE_KEY
firebase functions:secrets:set WEB_PUSH_SUBJECT
```

4. No frontend, configure o `.env`:

```bash
VITE_WEB_PUSH_VAPID_PUBLIC_KEY=...
```

## Deploy

```bash
cd ..
firebase deploy --only functions
```

## Function criada

- `processMobileAlarmPush` (schedule: a cada 1 minuto, timezone America/Sao_Paulo)
  - lê inscrições em `sot_mobile_push_subscriptions`
  - lê configuração global em `sot_state/alarmesConfig`
  - avalia alarme de saída e vistoria pendente
  - envia push por motorista

- `postDriverLocation` (**Passo 3** — ingestão persistida na coleção **`driver_active_locations`**, HTTP POST, região `southamerica-east1`, `cors: true`, invoker público + validação JWT)
  - corpo JSON: `placa` (obrigatório, até 32 caracteres), `latitude`, `longitude`, opcionais `departureId` (truncate 512), `capturedAt` (ISO válido ou servidor substitui)
  - cabeçalho `Authorization: Bearer <Firebase ID token>` (Auth anónima ou conta)
  - **Um documento por viatura**: ID Firestore = placa normalizada (A–Z/0–9/`_`) — sempre `set` com `merge`; cada POST substitui a posição anterior da mesma placa (`updatedAt`).
  - Código modular: `functions/src/driverActiveLocationIngest.ts` (`parseDriverLocationPayload`, `upsertDriverActiveLocation`).
  - URL típica: `https://southamerica-east1-<PROJECT_ID>.cloudfunctions.net/postDriverLocation` (ou `VITE_DRIVER_LOCATION_POST_URL` no frontend).
