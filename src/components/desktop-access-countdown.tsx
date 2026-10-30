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
    <>
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-semibold text-[hsl(var(--foreground))]">{session.nomeGuerra}</span>
        <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-[hsl(var(--primary))]">
          {formatCountdown(remainingMs)}
        </span>
      </span>
      <span
        className="hidden h-6 w-px shrink-0 bg-gradient-to-b from-transparent via-[hsl(var(--primary))]/35 to-transparent sm:block"
        aria-hidden
      />
    </>
  );
}
