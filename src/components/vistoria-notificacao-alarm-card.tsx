import { ClipboardList } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useAvisos } from "../context/avisos-context";
import type { PendenciaVistoriaEscalaSItem } from "../lib/vistoriaCalendarTint";
import { departuresTableShadowClass } from "../lib/uiShadows";
import { cn } from "../lib/utils";
import { Card, CardContent, CardHeader } from "./ui/card";

function PlacasMono({ placas }: { placas: string[] }) {
  return (
    <span className="whitespace-normal break-words font-mono text-sm font-semibold tabular-nums text-[hsl(var(--foreground))]">
      {placas.join(", ")}
    </span>
  );
}

export function VistoriaNotificacaoAlarmCard({ pendencias }: { pendencias: PendenciaVistoriaEscalaSItem[] }) {
  const { setNotificacaoVistoria } = useAvisos();
  const handleDesativar = useCallback(() => {
    setNotificacaoVistoria({ ativo: false });
  }, [setNotificacaoVistoria]);

  const blocoTexto = useMemo(() => {
    if (pendencias.length === 0) return null;
    if (pendencias.length === 1) {
      const { motorista, viaturasNaoVistoriadas } = pendencias[0];
      const n = viaturasNaoVistoriadas.length;
      if (n === 1) {
        return (
          <p className="text-sm font-medium leading-relaxed text-[hsl(var(--foreground))]">
            O motorista <strong className="font-semibold">{motorista}</strong> não realizou a vistoria na viatura{" "}
            <PlacasMono placas={viaturasNaoVistoriadas} />.
          </p>
        );
      }
      return (
        <p className="text-sm font-medium leading-relaxed text-[hsl(var(--foreground))]">
          O motorista <strong className="font-semibold">{motorista}</strong> não realizou as vistorias nas viaturas{" "}
          <PlacasMono placas={viaturasNaoVistoriadas} />.
        </p>
      );
    }
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium leading-relaxed text-[hsl(var(--foreground))]">
          O(s) motorista(s) abaixo não realizou(aram) a(s) vistoria(s) na(s) viatura(s) indicadas:
        </p>
        <ul className="list-none space-y-2 text-sm font-medium text-[hsl(var(--foreground))]">
          {pendencias.map((p) => (
            <li key={p.motorista} className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.25)] px-3 py-2">
              <div className="font-semibold">{p.motorista}</div>
              <div className="mt-1 text-[hsl(var(--muted-foreground))]">
                Viaturas: <PlacasMono placas={p.viaturasNaoVistoriadas} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }, [pendencias]);

  if (pendencias.length === 0) return null;

  return (
    <Card
      className={cn(
        "w-full overflow-hidden border transition-colors duration-300 sot-alarm-card-blink",
        departuresTableShadowClass,
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
        <div className="min-w-0 space-y-3">
          <p className="text-[1.75rem] font-semibold leading-snug text-[hsl(var(--foreground))]">
            Notificações de Vistoria
          </p>
          {blocoTexto}
        </div>
        <div className="shrink-0 rounded-lg bg-red-500/20 p-2.5 text-red-800 dark:text-red-200">
          <ClipboardList className="h-5 w-5" aria-hidden />
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
          <span>Desativar Notificação</span>
        </label>
      </CardContent>
    </Card>
  );
}
