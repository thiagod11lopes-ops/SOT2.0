import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { CatalogSuccessModal } from "./catalog-success-modal";
import type { CatalogCategory } from "../context/catalog-items-context";
import { useCatalogItems } from "../context/catalog-items-context";
import { Button } from "./ui/button";
import { TabsList } from "./ui/tabs";

const innerTabs = [
  "Setor",
  "Responsável pelo Pedido",
  "OM",
  "Hospital de Destino",
  "Itens cadastrados",
] as const;

const categoryByTab: Record<(typeof innerTabs)[number], CatalogCategory | null> = {
  Setor: "setores",
  "Responsável pelo Pedido": "responsaveis",
  OM: "oms",
  "Hospital de Destino": "hospitais",
  "Itens cadastrados": null,
};

const categoryLabel: Record<CatalogCategory, string> = {
  setores: "Setor",
  responsaveis: "Responsável pelo Pedido",
  oms: "OM",
  hospitais: "Hospital de Destino",
  motoristas: "Motorista",
  viaturas: "Viatura",
};

export function CatalogItemsPanel() {
  const { items, addItem, removeItem } = useCatalogItems();
  const [activeInner, setActiveInner] = useState<string>(innerTabs[0]);
  const [draft, setDraft] = useState("");
  const [successOpen, setSuccessOpen] = useState(false);

  const activeCategory = categoryByTab[activeInner as (typeof innerTabs)[number]];

  const canAdd = useMemo(() => draft.trim().length > 0, [draft]);

  function handleAdd() {
    if (!activeCategory || !canAdd) return;
    const added = addItem(activeCategory, draft);
    if (added) {
      setDraft("");
      setSuccessOpen(true);
    }
  }

  return (
    <div className="space-y-4">
      <TabsList items={[...innerTabs]} active={activeInner} onChange={setActiveInner} />

      {activeInner === "Itens cadastrados" ? (
        <div className="grid gap-6 sm:grid-cols-2">
          {(Object.keys(categoryLabel) as CatalogCategory[]).map((cat) => (
            <div
              key={cat}
              className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-sm"
            >
              <h4 className="mb-3 text-sm font-semibold text-[hsl(var(--foreground))]">
                {categoryLabel[cat]}
              </h4>
              {items[cat].length === 0 ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">Nenhum item cadastrado.</p>
              ) : (
                <ul className="space-y-1.5">
                  {items[cat].map((entry) => (
                    <li
                      key={entry}
                      className="flex items-center justify-between gap-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-sm"
                    >
                      <span className="min-w-0 flex-1 break-words">{entry}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-slate-500 hover:text-red-600"
                        aria-label={`Remover ${entry}`}
                        onClick={() => removeItem(cat, entry)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Digite um novo item e clique em <span className="font-medium text-[hsl(var(--foreground))]">+</span>{" "}
            para incluir em <strong>{activeInner}</strong>. Os itens ficam disponíveis nos selects de{" "}
            <strong>Cadastrar Nova Saída</strong> e na visão <strong>Itens cadastrados</strong>.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-2">
              <label className="text-sm font-medium" htmlFor="catalog-item-draft">
                Novo item
              </label>
              <div className="flex gap-2">
                <input
                  id="catalog-item-draft"
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAdd();
                    }
                  }}
                  placeholder={`Ex.: ${activeInner === "Setor" ? "SAMU Central" : "…"}`}
                  className="h-10 min-w-0 flex-1 rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm text-[hsl(var(--foreground))] shadow-sm placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                />
                <Button
                  type="button"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  disabled={!canAdd}
                  onClick={handleAdd}
                  title="Adicionar item"
                  aria-label="Adicionar item à lista"
                >
                  <Plus className="h-5 w-5" strokeWidth={2.5} />
                </Button>
              </div>
            </div>
          </div>

          {activeCategory && items[activeCategory].length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                Itens nesta categoria
              </p>
              <ul className="flex flex-wrap gap-2">
                {items[activeCategory].map((entry) => (
                  <li
                    key={entry}
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/50 py-1 pl-3 pr-1 text-sm"
                  >
                    <span className="min-w-0 truncate">{entry}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-slate-500 hover:text-red-600"
                      aria-label={`Remover ${entry}`}
                      onClick={() => removeItem(activeCategory, entry)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
      <CatalogSuccessModal open={successOpen} onClose={() => setSuccessOpen(false)} />
    </div>
  );
}
