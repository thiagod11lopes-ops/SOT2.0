import { Bell } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AlarmeDiarioItem } from "../context/avisos-context";
import { useAlarmDismiss } from "../context/alarm-dismiss-context";
import { localDateKey } from "../lib/dailyAlarmDismiss";
import { parseHhMm } from "../lib/timeInput";
import { departuresTableShadowClass } from "../lib/uiShadows";
import { cn } from "../lib/utils";
import { Card, CardContent, CardHeader } from "./ui/card";

function msUntilNextMidnight(): number {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.max(0, next.getTime() - now.getTime());
}

/**
 * Card na página inicial: só deve ser montado a partir do horário configurado (o dashboard filtra);
 * depois de disparar, pisca em laranja até marcar o checkbox para ocultar o dia.
 */
export function DailyAlarmCard({ alarm }: { alarm: AlarmeDiarioItem }) {
  const { isDismissedTodayForAlarm, dismissAlarmForToday } = useAlarmDismiss();
  const [now, setNow] = useState(() => new Date());
  const [dismissedToday, setDismissedToday] = useState(() =>
    isDismissedTodayForAlarm(alarm.id),
  );

  useEffect(() => {
    const tick = () => {
      setNow(new Date());
      setDismissedToday(isDismissedTodayForAlarm(alarm.id));
    };
    const id = window.setInterval(tick, 5_000);
    return () => window.clearInterval(id);
  }, [alarm.id, isDismissedTodayForAlarm]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    function armMidnight() {
      timeoutId = window.setTimeout(() => {
        setNow(new Date());
        setDismissedToday(isDismissedTodayForAlarm(alarm.id));
        armMidnight();
      }, msUntilNextMidnight());
    }
    armMidnight();
    return () => clearTimeout(timeoutId);
  }, [alarm.id, isDismissedTodayForAlarm]);

  const alarmParsed = useMemo(() => parseHhMm(alarm.hora), [alarm.hora]);

  /** A partir do horário configurado no dia, até ocultar com o checkbox. */
  const alarmJaDisparouHoje = useMemo(() => {
    if (!alarmParsed) return false;
    const agoraMin = now.getHours() * 60 + now.getMinutes();
    const alarmeMin = alarmParsed.h * 60 + alarmParsed.m;
    return agoraMin >= alarmeMin;
  }, [now, alarmParsed]);

  const shouldBlink = alarmJaDisparouHoje;

  const handleOcultarHoje = useCallback(() => {
    dismissAlarmForToday(alarm.id);
    setDismissedToday(true);
  }, [alarm.id, dismissAlarmForToday]);

  if (!alarm.ativo || !alarm.nome.trim() || !alarmParsed) return null;
  if (!alarmJaDisparouHoje) return null;
  if (dismissedToday) return null;

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
              if (e.target.checked) handleOcultarHoje();
            }}
          />
          <span>Ocultar este card hoje (interrompe o piscar; volta amanhã)</span>
        </label>
      </CardContent>
    </Card>
  );
}
