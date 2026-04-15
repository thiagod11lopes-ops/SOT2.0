import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Ambulance, Building2, ClipboardCheck, ShieldCheck, Upload } from "lucide-react";
import { useDepartures } from "../context/departures-context";
import { useCatalogItems } from "../context/catalog-items-context";
import { CloudSyncIndicator } from "../components/cloud-sync-indicator";
import { Button } from "../components/ui/button";
import { mapSotBackupJsonToDepartures } from "../lib/sotBackupImport";
import { normalizeDepartureRows } from "../lib/normalizeDepartures";
import { VISTORIA_ADMINISTRATIVA_SENHA_PADRAO } from "../lib/vistoriaAdminMobile";
import { cn } from "../lib/utils";
import { SaidasHeaderEscalaPao } from "./saidas-header-escala-pao";
import { MobileVistoriaFullscreen } from "./mobile-vistoria-fullscreen";
import { SaidasMobileDetalheServicoModal } from "./saidas-mobile-detalhe-servico-modal";
import { useSaidasMobileFilterDate } from "./saidas-mobile-filter-date-context";
import { SteeringWheelIcon } from "./steering-wheel-icon";
import { MOBILE_MODAL_OVERLAY_CLASS } from "./mobileModalOverlayClass";

export function SaidasLayout() {
  const { mergeDeparturesFromBackup } = useDepartures();
  const { items: catalogItems } = useCatalogItems();
  const { filterDatePtBr } = useSaidasMobileFilterDate();
  const [detalheServicoOpen, setDetalheServicoOpen] = useState(false);
  const [vistoriaMobileOpen, setVistoriaMobileOpen] = useState(false);
  const [vistoriaAdministrativaMotorista, setVistoriaAdministrativaMotorista] = useState<string | null>(null);
  const [vistoriaAdminModalOpen, setVistoriaAdminModalOpen] = useState(false);
  const [vistoriaAdminStep, setVistoriaAdminStep] = useState<"motorista" | "senha">("motorista");
  const [vistoriaAdminMotoristaId, setVistoriaAdminMotoristaId] = useState("");
  const [vistoriaAdminSenha, setVistoriaAdminSenha] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const motoristasCatalogoOrdenados = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const m of catalogItems.motoristas) {
      const t = m.trim();
      if (!t) continue;
      const k = t.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(m);
    }
    return out.sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [catalogItems.motoristas]);

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

  function closeVistoriaAdminModal() {
    setVistoriaAdminModalOpen(false);
    setVistoriaAdminStep("motorista");
    setVistoriaAdminMotoristaId("");
    setVistoriaAdminSenha("");
  }

  function handleVistoriaAdminMotoristaOk() {
    const m = vistoriaAdminMotoristaId.trim();
    if (!m) {
      window.alert("Selecione o motorista que será o vistoriador.");
      return;
    }
    setVistoriaAdminStep("senha");
    setVistoriaAdminSenha("");
  }

  function handleVistoriaAdminSenhaOk() {
    if (vistoriaAdminSenha !== VISTORIA_ADMINISTRATIVA_SENHA_PADRAO) {
      window.alert("Senha incorreta.");
      return;
    }
    const m = vistoriaAdminMotoristaId.trim();
    setVistoriaAdministrativaMotorista(m);
    closeVistoriaAdminModal();
    setVistoriaMobileOpen(true);
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 max-w-full flex-col overflow-x-hidden bg-[hsl(var(--background))]">
      {vistoriaAdminModalOpen ? (
        <div
          className={`${MOBILE_MODAL_OVERLAY_CLASS} z-[520]`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="vistoria-admin-titulo"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeVistoriaAdminModal();
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id="vistoria-admin-titulo" className="mb-1 text-lg font-semibold text-[hsl(var(--foreground))]">
              Vistoria administrativa
            </h2>
            <p className="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
              {vistoriaAdminStep === "motorista"
                ? "Escolha o motorista que será o vistoriador nesta vistoria avulsa."
                : "Introduza a senha para abrir o formulário."}
            </p>
            {vistoriaAdminStep === "motorista" ? (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Vistoriador (motorista)</label>
                <select
                  className="min-h-12 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-base text-[hsl(var(--foreground))] outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/40"
                  value={vistoriaAdminMotoristaId}
                  onChange={(e) => setVistoriaAdminMotoristaId(e.target.value)}
                  aria-label="Motorista vistoriador"
                >
                  <option value="">— Selecionar —</option>
                  {motoristasCatalogoOrdenados.map((nome) => (
                    <option key={nome} value={nome}>
                      {nome}
                    </option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    className="min-h-11 flex-1 rounded-xl border border-red-600/90 bg-red-500 font-semibold text-white"
                    onClick={closeVistoriaAdminModal}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    className="min-h-11 flex-1 rounded-xl border border-emerald-600/90 bg-emerald-500 font-semibold text-white"
                    onClick={handleVistoriaAdminMotoristaOk}
                  >
                    OK
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Senha</label>
                <input
                  type="password"
                  autoComplete="off"
                  value={vistoriaAdminSenha}
                  onChange={(e) => setVistoriaAdminSenha(e.target.value)}
                  className="min-h-12 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-base text-[hsl(var(--foreground))] outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/40"
                  aria-label="Senha da vistoria administrativa"
                />
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 flex-1 rounded-xl font-semibold"
                    onClick={() => {
                      setVistoriaAdminStep("motorista");
                      setVistoriaAdminSenha("");
                    }}
                  >
                    Voltar
                  </Button>
                  <Button type="button" className="min-h-11 flex-1 rounded-xl font-semibold" onClick={handleVistoriaAdminSenhaOk}>
                    OK
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
      <MobileVistoriaFullscreen
        open={vistoriaMobileOpen}
        onOpenChange={(next) => {
          setVistoriaMobileOpen(next);
          if (!next) setVistoriaAdministrativaMotorista(null);
        }}
        administrativeVistoriadorMotorista={vistoriaAdministrativaMotorista}
      />
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
          <div className="absolute left-0 top-1/2 flex min-w-0 -translate-y-1/2 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setDetalheServicoOpen(true)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 text-[hsl(var(--foreground))] transition active:scale-[0.98]"
              aria-label="Detalhe de Serviço — serviço e rotina no dia do filtro"
              title="Detalhe de Serviço"
            >
              <SteeringWheelIcon className="h-[1.15rem] w-[1.15rem] text-[hsl(var(--primary))]" />
            </button>
            <button
              type="button"
              onClick={() => {
                setVistoriaAdministrativaMotorista(null);
                setVistoriaMobileOpen(true);
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 text-[hsl(var(--foreground))] transition active:scale-[0.98]"
              aria-label="Vistoria — calendário e checklist"
              title="Vistoria"
            >
              <ClipboardCheck className="h-[1.15rem] w-[1.15rem] text-[hsl(var(--primary))]" />
            </button>
          </div>
          <div className="min-w-0 max-w-[calc(100%-15rem)] px-1 text-center sm:max-w-[calc(100%-16rem)]">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">
              SOT
            </p>
            <h1 className="truncate text-lg font-bold tracking-tight text-[hsl(var(--foreground))]">Saídas</h1>
          </div>
          <div className="absolute right-0 top-1/2 flex min-w-0 -translate-y-1/2 items-center gap-1.5 min-[400px]:gap-2">
            <SaidasHeaderEscalaPao />
            <button
              type="button"
              onClick={() => {
                setVistoriaAdminStep("motorista");
                setVistoriaAdminMotoristaId("");
                setVistoriaAdminSenha("");
                setVistoriaAdminModalOpen(true);
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 text-[hsl(var(--foreground))] transition active:scale-[0.98]"
              aria-label="Vistoria administrativa — motorista e senha"
              title="Vistoria administrativa"
            >
              <ShieldCheck className="h-[1.15rem] w-[1.15rem] text-[hsl(var(--primary))]" aria-hidden />
            </button>
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
        <div className="mt-2 flex justify-center">
          <CloudSyncIndicator compact />
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
