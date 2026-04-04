import { Bell, LogOut } from "lucide-react";
import { HeaderDateTime } from "./header-datetime";
import { HeaderPaoMotorista } from "./header-pao-motorista";
import { Button } from "./ui/button";
import { TabsList } from "./ui/tabs";

interface HeaderProps {
  tabs: string[];
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function Header({ tabs, activeTab, onTabChange }: HeaderProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b bg-[hsl(var(--background))/0.95] backdrop-blur">
      <div className="relative mx-auto flex min-h-[4.25rem] max-w-[1600px] items-center justify-between gap-3 px-6 py-3 sm:min-h-[4.5rem] sm:gap-4">
        <div className="relative z-10 shrink-0">
          <HeaderDateTime />
        </div>

        <h1
          className="pointer-events-none absolute left-1/2 top-1/2 z-0 w-[min(92vw,48rem)] -translate-x-1/2 -translate-y-1/2 px-2 text-center text-[1.05rem] font-bold leading-tight text-[hsl(var(--primary))] sm:w-[min(90vw,52rem)] sm:text-[1.35rem] md:text-[1.55rem] [text-shadow:0_2px_4px_rgba(0,0,0,0.4),0_4px_16px_rgba(0,0,0,0.28)]"
        >
          SISTEMA DE ORGANIZAÇÃO DE TRANSPORTE
        </h1>

        <div className="relative z-10 flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
          <HeaderPaoMotorista />
          <Button variant="ghost" size="icon" aria-label="Notificações">
            <Bell className="h-5 w-5" />
          </Button>
          <Button variant="outline" size="sm">
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </div>
      </div>

      <div className="border-t px-4 py-3">
        <TabsList variant="main" items={tabs} active={activeTab} onChange={onTabChange} />
      </div>
    </header>
  );
}
