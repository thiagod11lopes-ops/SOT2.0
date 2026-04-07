# Inventario de dominios sincronizados

Este documento mapeia os dados sincronizados entre clientes para orientar a aplicacao do controle de concorrencia (version, updatedAt, updatedBy) no restante do sistema.

## Fontes sincronizadas

- `departures` (colecao Firestore dedicada)
- `sot_state/catalog`
- `sot_state/avisos`
- `sot_state/limpezaPendente`
- `sot_state/oficina`
- `sot_state/oilMaintenance`
- `sot_state/customLocations`
- `sot_state/escalaPaoBundle`
- `sot_state/motoristaPao`
- `sot_state/appearance`
- `sot_state/departuresReportEmail`
- `sot_state/alarmDismiss`
- `sot_state/detalheServico`

## Prioridade de rollout (concorrencia)

### P0 - critico operacional

- `departures` (ja com controle de versao em andamento)
- `sot_state/oficina` (impacta "Viaturas na Oficina")
- `sot_state/catalog` (impacta cadastro e validacao de saidas)
- `sot_state/avisos` (impacta agenda/alarme operacional)

### P1 - alto impacto diario

- `sot_state/escalaPaoBundle`
- `sot_state/oilMaintenance`
- `sot_state/detalheServico`
- `sot_state/limpezaPendente`

### P2 - baixo/medio impacto

- `sot_state/motoristaPao`
- `sot_state/departuresReportEmail`
- `sot_state/alarmDismiss`
- `sot_state/customLocations`
- `sot_state/appearance`

## Criterios de priorizacao

- risco de sobrescrever dado de outra maquina;
- impacto direto em operacao (saidas/oficina/avisos);
- frequencia de escrita concorrente;
- impacto de divergencia para usuarios em campo.

