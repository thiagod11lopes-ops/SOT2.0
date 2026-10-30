import { useEffect, useState } from "react";
import { useSotDesktopAccess } from "../context/sot-desktop-access-context";
import { cn } from "../lib/utils";

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function DesktopAccessCountdown({ aboveTicker }: { aboveTicker?: boolean }) {
  const { session, idleDeadlineRef } = useSotDesktopAccess();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [session]);
  if (!session) return null;
  const remainingMs = Math.max(0, idleDeadlineRef.current - now);

  return (
    <div
      className={cn(
        "pointer-events-none flex max-w-[min(calc(100vw-2rem),22rem)] items-center justify-end gap-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/95 px-3 py-2 shadow-lg backdrop-blur-sm",
        aboveTicker ? "absolute bottom-full right-4 z-[1] mb-2" : "fixed bottom-12 right-4 z-[130]",
      )}
      aria-live="polite"
    >
      <p className="truncate text-sm font-semibold text-[hsl(var(--foreground))]">{session.nomeGuerra}</p>
      <p className="shrink-0 font-mono text-sm tabular-nums text-[hsl(var(--muted-foreground))]">
        {formatCountdown(remainingMs)}
      </p>
    </div>
  );
}
