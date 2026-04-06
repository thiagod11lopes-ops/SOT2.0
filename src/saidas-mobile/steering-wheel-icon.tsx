import { cn } from "../lib/utils";

/** Volante (anel + raios + cubo), estilo traço alinhado a Lucide. */
export function SteeringWheelIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn("shrink-0", className)}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="8.25" />
      <path d="M12 3.75v5.9M12 14.35v5.9M3.75 12h5.9M14.35 12h5.9" />
      <circle cx="12" cy="12" r="2.35" />
    </svg>
  );
}
