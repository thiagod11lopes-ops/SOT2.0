import { Plus } from "lucide-react";
import { useId, useMemo, useState } from "react";
import type { CatalogCategory } from "../context/catalog-items-context";
import { isValueInCatalog, useCatalogItems } from "../context/catalog-items-context";
import { cn } from "../lib/utils";
import { CatalogSuccessModal } from "./catalog-success-modal";
import { Button } from "./ui/button";

interface CatalogComboFieldProps {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  category: CatalogCategory;
  disabled?: boolean;
  placeholder?: string;
  /** Só após clicar em Cadastrar Saída com valor fora do catálogo o + é exibido. */
  showPlusAfterAttempt: boolean;
}

export function CatalogComboField({
  id,
  label,
  value,
  onChange,
  options,
  category,
  disabled,
  placeholder = "",
  showPlusAfterAttempt,
}: CatalogComboFieldProps) {
  const { addItem } = useCatalogItems();
  const [successOpen, setSuccessOpen] = useState(false);
  const listId = useId();
  const fieldId = id ?? `catalog-field-${category}`;

  const inCatalog = useMemo(() => isValueInCatalog(value, options), [value, options]);
  const trimmed = value.trim();
  const needsCatalogEntry = trimmed.length > 0 && !inCatalog;
  const showPlusButton = showPlusAfterAttempt && needsCatalogEntry;

  function handleAdd() {
    if (!needsCatalogEntry) return;
    const added = addItem(category, trimmed);
    if (added) {
      setSuccessOpen(true);
    }
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor={fieldId}>
        {label}
      </label>
      <div className={cn("flex gap-2", !showPlusButton && "w-full")}>
        <input
          id={fieldId}
          type="text"
          list={listId}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "h-10 min-w-0 rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm text-[hsl(var(--foreground))] shadow-sm placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:bg-slate-100",
            showPlusButton ? "flex-1" : "w-full",
            showPlusAfterAttempt && needsCatalogEntry && "border-red-500/90",
          )}
        />
        <datalist id={listId}>
          {options.map((opt) => (
            <option key={opt} value={opt} />
          ))}
        </datalist>
        {showPlusButton ? (
          <Button
            type="button"
            size="icon"
            variant="default"
            className={cn(
              "h-10 w-10 shrink-0 border-0 bg-red-600 text-white hover:bg-red-700",
              "catalog-plus-blink",
            )}
            disabled={disabled}
            title="Adicionar este texto a Cadastrar Itens"
            aria-label={`Adicionar "${trimmed}" aos itens cadastrados`}
            onClick={handleAdd}
          >
            <Plus className="h-5 w-5" strokeWidth={2.5} />
          </Button>
        ) : null}
      </div>
      {showPlusAfterAttempt && needsCatalogEntry ? (
        <p className="text-xs text-red-700 dark:text-red-300/90">
          Este texto ainda não está em <strong>Cadastrar Itens</strong>. Clique no botão <strong>+</strong>{" "}
          (vermelho) para cadastrá-lo antes de salvar.
        </p>
      ) : null}
      <CatalogSuccessModal open={successOpen} onClose={() => setSuccessOpen(false)} />
    </div>
  );
}
