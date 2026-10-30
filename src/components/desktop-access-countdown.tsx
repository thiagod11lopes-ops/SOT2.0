import { useEffect, useState } from "react";
import { useSotDesktopAccess } from "../context/sot-desktop-access-context";

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function DesktopAccessCountdown() {
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
      className="pointer-events-none relative z-20 flex max-w-[min(42vw,16rem)] shrink-0 items-center gap-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/95 px-3 py-2 shadow-lg backdrop-blur-sm"
      aria-live="polite"
    >
      <p className="truncate text-sm font-semibold text-[hsl(var(--foreground))]">{session.nomeGuerra}</p>
      <p className="shrink-0 font-mono text-sm tabular-nums text-[hsl(var(--muted-foreground))]">
        {formatCountdown(remainingMs)}
      </p>
    </div>
  );
}
