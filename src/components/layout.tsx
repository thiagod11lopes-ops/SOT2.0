import type { ReactNode } from "react";
import { Header } from "./header";

interface LayoutProps {
  tabs: string[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  children: ReactNode;
}

export function Layout({ tabs, activeTab, onTabChange, children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <Header tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} />
      <main className="mx-auto max-w-[1600px] px-6 pb-8 pt-64 xl:pt-44">{children}</main>
    </div>
  );
}
