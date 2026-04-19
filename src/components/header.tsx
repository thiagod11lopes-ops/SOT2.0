import { HeaderDateTime } from "./header-datetime";
import { HeaderPaoMotorista } from "./header-pao-motorista";
import { CloudSyncIndicator } from "./cloud-sync-indicator";
import { BrokenCarIcon } from "./icons/broken-car-icon";
import { useAppTab } from "../context/app-tab-context";
import { Button } from "./ui/button";
import { TabsList } from "./ui/tabs";
import { cn } from "../lib/utils";

interface HeaderProps {
  tabs: string[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  /** RDV visível (rota `#/carro-quebrado`). */
  rdvRouteActive?: boolean;
}

export function Header({ tabs, activeTab, onTabChange, rdvRouteActive }: HeaderProps) {
  const { setActiveTab } = useAppTab();

  function openRdvInApp() {
    setActiveTab(null);
    window.location.hash = "#/carro-quebrado";
  }
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b bg-[hsl(var(--background))/0.95] backdrop-blur">
      <div className="relative mx-auto flex min-h-[5rem] max-w-[1600px] items-center justify-between gap-3 px-6 py-3 sm:min-h-[5.25rem] sm:gap-4">
        <div className="relative z-10 shrink-0">
          <HeaderDateTime />
        </div>

        <div className="absolute left-1/2 top-1/2 z-0 flex w-[min(92vw,48rem)] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 px-2 text-center sm:w-[min(90vw,52rem)]">
          <h1 className="pointer-events-none text-[1.05rem] font-bold leading-tight text-[hsl(var(--primary))] sm:text-[1.35rem] md:text-[1.55rem] [text-shadow:0_2px_4px_rgba(0,0,0,0.4),0_4px_16px_rgba(0,0,0,0.28)]">
            SISTEMA DE ORGANIZAÇÃO DE TRANSPORTE
          </h1>
          <div className="pointer-events-auto">
            <CloudSyncIndicator compact />
          </div>
        </div>

        <div className="relative z-10 flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
          <HeaderPaoMotorista />
          <Button
            type="button"
            variant={rdvRouteActive ? "default" : "outline"}
            size="icon"
            aria-label="Relatório Diário de Viaturas (RDV)"
            aria-pressed={rdvRouteActive}
            onClick={openRdvInApp}
            className={cn(rdvRouteActive && "shadow-sm")}
          >
            <BrokenCarIcon />
          </Button>
        </div>
      </div>

      <div className="border-t px-4 py-3">
        <TabsList variant="main" items={tabs} active={activeTab} onChange={onTabChange} />
      </div>
    </header>
  );
}
