import { Bell } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAvisos, type AlarmeDiarioItem } from "../context/avisos-context";
import { localDateKey } from "../lib/dailyAlarmDismiss";
import { parseHhMm } from "../lib/timeInput";
import { departuresTableShadowClass } from "../lib/uiShadows";
import { cn } from "../lib/utils";
import { Card, CardContent, CardHeader } from "./ui/card";

/**
 * Card na página inicial: só deve ser montado a partir do horário configurado (o dashboard filtra);
 * depois de disparar, pisca em laranja até o utilizador desativar — o alarme fica inativo (como em Avisos) até
 * voltar a ativar nessa aba.
 */
export function DailyAlarmCard({ alarm }: { alarm: AlarmeDiarioItem }) {
  const { updateAlarmeDiario } = useAvisos();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 5_000);
    return () => window.clearInterval(id);
  }, []);

  const alarmParsed = useMemo(() => parseHhMm(alarm.hora), [alarm.hora]);

  /** A partir do horário configurado no dia, até desativar com o checkbox. */
  const alarmJaDisparouHoje = useMemo(() => {
    if (!alarmParsed) return false;
    const agoraMin = now.getHours() * 60 + now.getMinutes();
    const alarmeMin = alarmParsed.h * 60 + alarmParsed.m;
    return agoraMin >= alarmeMin;
  }, [now, alarmParsed]);

  const shouldBlink = alarmJaDisparouHoje;

  const handleDesativar = useCallback(() => {
    updateAlarmeDiario(alarm.id, { ativo: false, pausaAteDia: null });
  }, [alarm.id, updateAlarmeDiario]);

  if (!alarm.ativo || !alarm.nome.trim() || !alarmParsed) return null;
  if (!alarmJaDisparouHoje) return null;

  return (
    <Card
      key={`${alarm.id}-${localDateKey(now)}`}
      className={cn(
        "w-full overflow-hidden border transition-colors duration-300",
        departuresTableShadowClass,
        shouldBlink ? "sot-alarm-card-blink" : "border-[hsl(var(--border))]",
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
        <div className="min-w-0 space-y-2">
          <p className="text-[1.75rem] font-semibold leading-snug text-[hsl(var(--foreground))]">
            {alarm.nome.trim()}
          </p>
          <p className="font-mono text-sm tabular-nums text-[hsl(var(--muted-foreground))]">{alarm.hora}</p>
        </div>
        <div
          className={cn(
            "shrink-0 rounded-lg p-2.5",
            shouldBlink ? "bg-orange-500/25 text-orange-700" : "bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]",
          )}
        >
          <Bell className="h-5 w-5" aria-hidden />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-[hsl(var(--foreground))]">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-[hsl(var(--border))] accent-[hsl(var(--primary))]"
            checked={false}
            onChange={(e) => {
              if (e.target.checked) handleDesativar();
            }}
          />
          <span>
            Desativar o alarme (fica inativo em Avisos; só volta a alertar se voltar a ativar nessa aba)
          </span>
        </label>
      </CardContent>
    </Card>
  );
}
