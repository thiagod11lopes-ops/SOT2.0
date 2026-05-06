import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../lib/utils";
import { Header } from "./header";
import { HomeViewportScale } from "./home-viewport-scale";
import { Button } from "./ui/button";

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
      <div className="fixed right-3 top-3 z-[80]">
        <Button type="button" variant="outline" size="sm" onClick={toggleHeaderVisibility}>
          {headerVisible ? "Ocultar" : "Expandir"}
        </Button>
      </div>
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
