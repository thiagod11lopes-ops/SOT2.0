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
