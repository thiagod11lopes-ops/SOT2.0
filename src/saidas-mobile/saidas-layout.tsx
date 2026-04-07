import { useRef, useState, type ChangeEvent } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Ambulance, Building2, Upload } from "lucide-react";
import { useDepartures } from "../context/departures-context";
import { mapSotBackupJsonToDepartures } from "../lib/sotBackupImport";
import { normalizeDepartureRows } from "../lib/normalizeDepartures";
import { cn } from "../lib/utils";
import { SaidasHeaderEscalaPao } from "./saidas-header-escala-pao";
import { SaidasMobileDetalheServicoModal } from "./saidas-mobile-detalhe-servico-modal";
import { useSaidasMobileFilterDate } from "./saidas-mobile-filter-date-context";
import { SteeringWheelIcon } from "./steering-wheel-icon";

export function SaidasLayout() {
  const { mergeDeparturesFromBackup } = useDepartures();
  const { filterDatePtBr } = useSaidasMobileFilterDate();
  const [detalheServicoOpen, setDetalheServicoOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const parsed: unknown = JSON.parse(text);
        const rows = Array.isArray(parsed)
          ? normalizeDepartureRows(parsed)
          : mapSotBackupJsonToDepartures(parsed);
        if (rows.length === 0) {
          window.alert("Nenhuma saída reconhecida neste ficheiro.");
          return;
        }
        mergeDeparturesFromBackup(rows);
        window.alert(`${rows.length} registo(s) importado(s). Os que já existiam foram ignorados.`);
      } catch {
        window.alert("JSON inválido. Use o backup exportado pelo SOT ou um array de saídas.");
      }
    };
    reader.readAsText(f);
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 max-w-full flex-col overflow-x-hidden bg-[hsl(var(--background))]">
      <SaidasMobileDetalheServicoModal
        open={detalheServicoOpen}
        onOpenChange={setDetalheServicoOpen}
        filterDatePtBr={filterDatePtBr}
      />
      <header
        className="sticky top-0 z-20 w-full min-w-0 overflow-x-hidden border-b border-[hsl(var(--border))]/90 bg-[hsl(var(--card))]/85 px-3 pb-3 pt-[calc(0.75rem+var(--safe-top))] backdrop-blur-xl sm:px-4"
        style={{ paddingTop: "max(0.75rem, var(--safe-top))" }}
      >
        <div className="relative mx-auto flex max-w-lg items-center justify-center gap-1.5 min-[400px]:gap-2">
          <div className="absolute left-0 top-1/2 flex min-w-0 -translate-y-1/2 items-center">
            <button
              type="button"
              onClick={() => setDetalheServicoOpen(true)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 text-[hsl(var(--foreground))] transition active:scale-[0.98]"
              aria-label="Detalhe de Serviço — serviço e rotina no dia do filtro"
              title="Detalhe de Serviço"
            >
              <SteeringWheelIcon className="h-[1.15rem] w-[1.15rem] text-[hsl(var(--primary))]" />
            </button>
          </div>
          <div className="min-w-0 max-w-[calc(100%-11rem)] px-1 text-center sm:max-w-[calc(100%-12rem)]">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">
              SOT
            </p>
            <h1 className="truncate text-lg font-bold tracking-tight text-[hsl(var(--foreground))]">Saídas</h1>
          </div>
          <div className="absolute right-0 top-1/2 flex min-w-0 -translate-y-1/2 items-center gap-1.5 min-[400px]:gap-2">
            <SaidasHeaderEscalaPao />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 text-[hsl(var(--foreground))] transition active:scale-[0.98]"
              aria-label="Importar saídas (JSON)"
            >
              <Upload className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden />
            </button>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={handleFile} />
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full min-w-0 max-w-lg flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain overscroll-x-none px-3 pb-28 pt-2 min-[480px]:px-4">
        <Outlet />
      </main>

      <nav
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-[hsl(var(--border))]/80 bg-[hsl(var(--card))]/90 px-2 pb-[calc(0.5rem+var(--safe-bottom))] pt-2 backdrop-blur-2xl"
        style={{ paddingBottom: "max(0.5rem, var(--safe-bottom))" }}
        aria-label="Tipo de saída"
      >
        <div className="mx-auto flex max-w-lg gap-2">
          <NavLink
            to="/saidas/administrativas"
            className={({ isActive }) =>
              cn(
                "flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[0.7rem] font-semibold transition",
                isActive
                  ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-lg shadow-[hsl(var(--primary))]/25"
                  : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]/50",
              )
            }
          >
            <Building2 className="h-5 w-5" aria-hidden />
            <span className="leading-none">Administrativas</span>
          </NavLink>
          <NavLink
            to="/saidas/ambulancia"
            className={({ isActive }) =>
              cn(
                "flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[0.7rem] font-semibold transition",
                isActive
                  ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-lg shadow-[hsl(var(--primary))]/25"
                  : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]/50",
              )
            }
          >
            <Ambulance className="h-5 w-5" aria-hidden />
            <span className="leading-none">Ambulância</span>
          </NavLink>
        </div>
      </nav>
    </div>
  );
}
