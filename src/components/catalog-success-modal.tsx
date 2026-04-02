import { createPortal } from "react-dom";
import { useEffect } from "react";
import { Button } from "./ui/button";

interface CatalogSuccessModalProps {
  open: boolean;
  onClose: () => void;
}

export function CatalogSuccessModal({ open, onClose }: CatalogSuccessModalProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-success-title"
        className="w-full max-w-sm rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-lg"
      >
        <p
          id="catalog-success-title"
          className="text-center text-base font-medium text-[hsl(var(--foreground))]"
        >
          Item Cadastrado com Sucesso
        </p>
        <div className="mt-6 flex justify-center">
          <Button type="button" className="min-w-[5.5rem]" onClick={onClose}>
            OK
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
