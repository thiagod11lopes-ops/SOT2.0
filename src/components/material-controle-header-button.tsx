import { Boxes } from "lucide-react";
import { useState } from "react";
import { HEADER_INFO_CARD_CLASS } from "./header-info-card";
import { MaterialControleModal } from "./material-controle-modal";
import { cn } from "../lib/utils";

export function MaterialControleHeaderButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          HEADER_INFO_CARD_CLASS,
          "items-center justify-center p-2 transition-all hover:border-[hsl(var(--primary))]/40 hover:shadow-[0_0_28px_hsl(var(--primary)/0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        )}
        aria-label="Controle de Material"
        title="Controle de Material"
      >
        <Boxes className="h-5 w-5 text-[hsl(var(--primary))]" strokeWidth={1.75} />
      </button>
      <MaterialControleModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
