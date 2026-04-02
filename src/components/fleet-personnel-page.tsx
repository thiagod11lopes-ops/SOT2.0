import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { CatalogCategory } from "../context/catalog-items-context";
import { useCatalogItems } from "../context/catalog-items-context";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { TabsList } from "./ui/tabs";

const subTabs = ["Cadastro de Motorista", "Cadastro de Viatura"] as const;

const categoryByTab: Record<(typeof subTabs)[number], CatalogCategory> = {
  "Cadastro de Motorista": "motoristas",
  "Cadastro de Viatura": "viaturas",
};

const tabLabel: Record<(typeof subTabs)[number], string> = {
  "Cadastro de Motorista": "motorista",
  "Cadastro de Viatura": "viatura",
};

export function FleetPersonnelPage() {
  const { items, addItem, removeItem } = useCatalogItems();
  const [activeSubTab, setActiveSubTab] = useState<string>(subTabs[0]);
  const [draft, setDraft] = useState("");

  const category = categoryByTab[activeSubTab as (typeof subTabs)[number]];
  const list = items[category];
  const kind = tabLabel[activeSubTab as (typeof subTabs)[number]];

  const canAdd = useMemo(() => draft.trim().length > 0, [draft]);

  function handleAdd() {
    if (!canAdd) return;
    const added = addItem(category, draft);
    if (added) setDraft("");
  }

  return (
    <div className="space-y-4">
      <TabsList items={[...subTabs]} active={activeSubTab} onChange={setActiveSubTab} />
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle>Frota e Pessoal</CardTitle>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Cadastros usados nos campos <strong>Viaturas</strong> e <strong>Motoristas</strong> em{" "}
            <strong>Cadastrar Nova Saída</strong>.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Inclua um {kind} por vez. Os itens aparecem como opções nos selects do cadastro de saída.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-2">
              <label className="text-sm font-medium" htmlFor="fleet-draft">
                Novo cadastro
              </label>
              <div className="flex gap-2">
                <input
                  id="fleet-draft"
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAdd();
                    }
                  }}
                  placeholder={activeSubTab === "Cadastro de Viatura" ? "Ex.: TTP-2G26" : "Ex.: SG Silva"}
                  className="h-10 min-w-0 flex-1 rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm text-[hsl(var(--foreground))] shadow-sm placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                />
                <Button
                  type="button"
                  variant="default"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  aria-label="Adicionar"
                  disabled={!canAdd}
                  onClick={handleAdd}
                >
                  <Plus className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.12)] p-3">
            <h4 className="mb-2 text-sm font-semibold text-[hsl(var(--foreground))]">
              {activeSubTab} ({list.length})
            </h4>
            {list.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Nenhum item ainda.</p>
            ) : (
              <ul className="space-y-1.5">
                {list.map((entry) => (
                  <li
                    key={entry}
                    className="flex items-center justify-between gap-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 py-1.5 text-sm"
                  >
                    <span className="min-w-0 flex-1 break-words">{entry}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-slate-500 hover:text-red-600"
                      aria-label={`Remover ${entry}`}
                      onClick={() => removeItem(category, entry)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
