import { tabsMatch } from "../../lib/tabMatch";
import { departuresTableShadowClass } from "../../lib/uiShadows";
import { cn } from "../../lib/utils";

interface TabsListProps {
  items: string[];
  active: string;
  onChange: (value: string) => void;
  /** Abas do cabeçalho principal: negrito + sombra no texto. */
  variant?: "default" | "main";
}

function normalizeTabLabel(label: string) {
  const normalized = label.trim().toLowerCase();
  if (normalized === "cadastro" || normalized === "cadatrar saída" || normalized === "cadastrar saída") {
    return "Cadastrar Saída";
  }
  return label;
}

export function TabsList({ items, active, onChange, variant = "default" }: TabsListProps) {
  const normalizedActive = normalizeTabLabel(active);
  const isMain = variant === "main";
  const isActive = (item: string) =>
    tabsMatch(normalizedActive, normalizeTabLabel(item)) ||
    tabsMatch(active, item);
  return (
    <div className="w-full overflow-x-auto" translate="no">
      <div className="flex w-full justify-center">
        <div
          className={cn(
            "flex min-w-max items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2",
            isMain && departuresTableShadowClass,
          )}
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
                  "shrink-0 rounded-md px-3 py-2 text-sm transition-all",
                  isMain ? "font-bold" : "font-medium",
                  isActive(item)
                    ? cn(
                        "bg-[hsl(var(--primary))] text-white shadow-sm",
                        isMain &&
                          "[text-shadow:0_1px_2px_rgba(0,0,0,0.45),0_3px_10px_rgba(0,0,0,0.35)]",
                      )
                    : cn(
                        "text-slate-500 hover:bg-[hsl(var(--muted))] hover:text-slate-900",
                        isMain &&
                          "[text-shadow:0_1px_2px_rgba(0,0,0,0.28),0_2px_8px_rgba(0,0,0,0.18)]",
                      ),
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
