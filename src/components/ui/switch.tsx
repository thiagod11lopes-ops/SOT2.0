import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export type SwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "role" | "type"> & {
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
};

/**
 * Alternador estilo iOS/ Material (foco, role="switch", `aria-checked`).
 */
export function Switch({ className, checked, onCheckedChange, disabled, id, "aria-label": ariaLabel, ...rest }: SwitchProps) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={() => {
        if (!disabled) onCheckedChange(!checked);
      }}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent shadow-inner transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--background))]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked
          ? "bg-[hsl(var(--primary))] shadow-sm"
          : "bg-[hsl(var(--muted))]",
        className,
      )}
      {...rest}
    >
      <span
        className={cn(
          "pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] dark:ring-white/10",
          checked ? "translate-x-6" : "translate-x-0",
        )}
        aria-hidden
      />
    </button>
  );
}
