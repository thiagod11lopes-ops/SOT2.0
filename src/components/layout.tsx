import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../lib/utils";
import { Header } from "./header";
import { HomeViewportScale } from "./home-viewport-scale";
import { Button } from "./ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";

interface LayoutProps {
  tabs: string[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  /** Hash `#/carro-quebrado` ativo — destaca o botão RDV no cabeçalho. */
  rdvRouteActive?: boolean;
  /** Slot no canto superior direito, entre o pão e o botão RDV (ex.: mapa de viaturas). */
  driverLocationsMapButton?: ReactNode;
  /** Espaço extra em baixo para o telão fixo da página inicial. */
  homeTickerActive?: boolean;
  /** Página inicial: preenche a altura da janela e escala o conteúdo para evitar scroll da página. */
  fitHomeViewport?: boolean;
  children: ReactNode;
}

export function Layout({
  tabs,
  activeTab,
  onTabChange,
  rdvRouteActive,
  driverLocationsMapButton,
  homeTickerActive,
  fitHomeViewport,
  children,
}: LayoutProps) {
  const autoHideHeader = true;
  const [headerVisible, setHeaderVisible] = useState(() => !autoHideHeader);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (!autoHideHeader) {
      setHeaderVisible(true);
      return;
    }
    setHeaderVisible(false);
    return () => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [autoHideHeader]);

  function toggleHeaderVisibility() {
    setHeaderVisible((prev) => {
      const next = !prev;
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      if (next) {
        hideTimerRef.current = window.setTimeout(() => {
          setHeaderVisible(false);
          hideTimerRef.current = null;
        }, 20_000);
      }
      return next;
    });
  }

  return (
    <div
      data-ui-chrome-visible={headerVisible ? "true" : "false"}
      className={cn(
        "bg-[hsl(var(--background))]",
        fitHomeViewport ? "flex h-[100dvh] min-h-0 flex-col overflow-hidden" : "min-h-screen",
      )}
    >
      <div className="fixed right-0 top-0 z-[80]">
        <Button
          type="button"
          variant="ghost"
          onClick={toggleHeaderVisibility}
          aria-label={headerVisible ? "Ocultar cabeçalho" : "Expandir cabeçalho"}
          title={headerVisible ? "Ocultar" : "Expandir"}
          className="h-6 min-w-[5.6rem] rounded-none rounded-bl-xl border border-r-0 border-t-0 border-[hsl(var(--border))] bg-[hsl(var(--background))/0.78] px-3 text-[hsl(var(--foreground))] opacity-85 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.55)] backdrop-blur-md transition-all duration-300 hover:min-w-[6rem] hover:bg-[hsl(var(--background))/0.9] hover:opacity-100"
        >
          {headerVisible ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>
      <Header
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={onTabChange}
        rdvRouteActive={rdvRouteActive}
        driverLocationsMapButton={driverLocationsMapButton}
        hidden={!headerVisible}
      />
      <main
        className={cn(
          "mx-auto max-w-[1600px] px-6 pb-8",
          headerVisible ? "pt-64 xl:pt-44" : "pt-20 xl:pt-20",
          homeTickerActive && "pb-32 sm:pb-36",
          fitHomeViewport && "flex min-h-0 w-full flex-1 flex-col overflow-hidden",
        )}
      >
        {fitHomeViewport ? <HomeViewportScale>{children}</HomeViewportScale> : children}
      </main>
    </div>
  );
}
