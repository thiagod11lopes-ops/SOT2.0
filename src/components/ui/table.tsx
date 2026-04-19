import type {
  HTMLAttributes,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";
import { cn } from "../../lib/utils";

export type TableProps = TableHTMLAttributes<HTMLTableElement> & {
  /** Envolve a `<table>`; por omissão `overflow-x-auto`. Use `overflow-visible` p.ex. para PDF/captura. */
  wrapperClassName?: string;
};

export function Table({ className, wrapperClassName, ...props }: TableProps) {
  return (
    <div className={cn("w-full", wrapperClassName ?? "overflow-x-auto")}>
      <table className={cn("w-full text-sm", className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "border-b bg-[hsl(var(--muted))]/45 [&_tr]:bg-transparent [&_tr:hover]:bg-[hsl(var(--muted))]/65",
        className,
      )}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      className={cn(
        "[&_tr:nth-child(odd)]:bg-[hsl(var(--card))] [&_tr:nth-child(even)]:bg-[hsl(var(--muted))]/55",
        className,
      )}
      {...props}
    />
  );
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "border-b transition-colors hover:bg-[hsl(var(--muted))]/90",
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cn("p-3 text-left text-xs font-semibold uppercase text-slate-500", className)} {...props} />
  );
}

export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("p-3", className)} {...props} />;
}
