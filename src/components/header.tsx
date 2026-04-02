import { Bell, LogOut, Shield } from "lucide-react";
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
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[hsl(var(--primary))] text-white">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold">SOT</p>
            <p className="text-sm text-slate-500">Sistema de Organização de Transporte</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
        <TabsList items={tabs} active={activeTab} onChange={onTabChange} />
      </div>
    </header>
  );
}
