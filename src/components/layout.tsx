import type { ReactNode } from "react";
import { cn } from "../lib/utils";
import { Header } from "./header";

interface LayoutProps {
  tabs: string[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  /** Espaço extra em baixo para o telão fixo da página inicial. */
  homeTickerActive?: boolean;
  children: ReactNode;
}

export function Layout({ tabs, activeTab, onTabChange, homeTickerActive, children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <Header tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} />
      <main
        className={cn(
          "mx-auto max-w-[1600px] px-6 pb-8 pt-64 xl:pt-44",
          homeTickerActive && "pb-32 sm:pb-36",
        )}
      >
        {children}
      </main>
    </div>
  );
}
