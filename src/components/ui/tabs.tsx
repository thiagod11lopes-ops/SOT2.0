import { tabsMatch } from "../../lib/tabMatch";
import { cn } from "../../lib/utils";

interface TabsListProps {
  items: string[];
  active: string;
  onChange: (value: string) => void;
}

function normalizeTabLabel(label: string) {
  const normalized = label.trim().toLowerCase();
  if (normalized === "cadastro" || normalized === "cadatrar saída" || normalized === "cadastrar saída") {
    return "Cadastrar Saída";
  }
  return label;
}

export function TabsList({ items, active, onChange }: TabsListProps) {
  const normalizedActive = normalizeTabLabel(active);
  const isActive = (item: string) =>
    tabsMatch(normalizedActive, normalizeTabLabel(item)) ||
    tabsMatch(active, item);
  return (
    <div className="w-full overflow-x-auto" translate="no">
      <div className="flex w-full justify-center">
        <div
          className="flex min-w-max items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2"
          translate="no"
        >
          {items.map((item) => {
            const displayLabel = normalizeTabLabel(item);
            return (
              <button
                key={item}
                type="button"
                translate="no"
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                onClick={() => onChange(displayLabel)}
                className={cn(
                  "shrink-0 rounded-md px-3 py-2 text-sm font-medium transition-all",
                  isActive(item)
                    ? "bg-[hsl(var(--primary))] text-white shadow-sm"
                    : "text-slate-500 hover:bg-[hsl(var(--muted))] hover:text-slate-900",
                )}
              >
                <span translate="no">{displayLabel}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
