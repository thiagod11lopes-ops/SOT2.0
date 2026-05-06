import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../lib/utils";
import { Header } from "./header";
import { HomeViewportScale } from "./home-viewport-scale";

interface LayoutProps {
  tabs: string[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  /** Hash `#/carro-quebrado` ativo — destaca o botão RDV no cabeçalho. */
  rdvRouteActive?: boolean;
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

    const showAndScheduleHide = () => {
      setHeaderVisible(true);
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = window.setTimeout(() => {
        setHeaderVisible(false);
        hideTimerRef.current = null;
      }, 20_000);
    };

    const events: Array<keyof WindowEventMap> = ["mousemove", "keydown", "touchstart", "wheel"];
    for (const ev of events) window.addEventListener(ev, showAndScheduleHide, { passive: true });
    return () => {
      for (const ev of events) window.removeEventListener(ev, showAndScheduleHide);
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [autoHideHeader]);

  return (
    <div
      className={cn(
        "bg-[hsl(var(--background))]",
        fitHomeViewport ? "flex h-[100dvh] min-h-0 flex-col overflow-hidden" : "min-h-screen",
      )}
    >
      <Header
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={onTabChange}
        rdvRouteActive={rdvRouteActive}
        hidden={!headerVisible}
      />
      <main
        className={cn(
          "mx-auto max-w-[1600px] px-6 pb-8",
          headerVisible ? "pt-64 xl:pt-44" : "pt-3",
          homeTickerActive && "pb-32 sm:pb-36",
          fitHomeViewport && "flex min-h-0 w-full flex-1 flex-col overflow-hidden",
        )}
      >
        {fitHomeViewport ? <HomeViewportScale>{children}</HomeViewportScale> : children}
      </main>
    </div>
  );
}
