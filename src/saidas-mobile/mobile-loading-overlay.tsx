import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  MobileLoadingOverlayContext,
  type MobileProgressReporter,
  type RunWithProgressOptions,
  type SystemSyncOverlayState,
  useMobileLoadingOverlay,
} from "./mobile-loading-context";

const DEFAULT_LABEL = "A carregar...";
const DEFAULT_SYSTEM_SYNC: SystemSyncOverlayState = {
  active: false,
  progress: 0,
  label: "A sincronizar…",
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function MobileLoadingOverlayProvider({ children }: { children: ReactNode }) {
  const [isVisible, setIsVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState(DEFAULT_LABEL);
  const [systemSync, setSystemSyncState] = useState<SystemSyncOverlayState>(DEFAULT_SYSTEM_SYNC);

  const setSystemSync = useCallback((state: SystemSyncOverlayState) => {
    setSystemSyncState({
      active: state.active,
      progress: clampProgress(state.progress),
      label: state.label.trim() || DEFAULT_SYSTEM_SYNC.label,
    });
  }, []);

  const runWithTrackedProgress = useCallback(
    async <T,>(
      task: (reporter: MobileProgressReporter) => Promise<T> | T,
      options?: RunWithProgressOptions,
    ): Promise<T> => {
      const startedAt = Date.now();
      const minDurationMs = Math.max(350, options?.minDurationMs ?? 500);
      const nextLabel = options?.label?.trim() || DEFAULT_LABEL;
      setLabel(nextLabel);
      setProgress(0);
      setIsVisible(true);

      const reporter: MobileProgressReporter = {
        setProgress: (value: number) => {
          setProgress((prev) => {
            const next = clampProgress(value);
            return next < prev ? prev : next;
          });
        },
        setLabel: (value: string) => {
          const next = value.trim();
          if (next) setLabel(next);
        },
      };

      try {
        const result = await task(reporter);
        reporter.setProgress(100);
        const elapsed = Date.now() - startedAt;
        if (elapsed < minDurationMs) {
          await sleep(minDurationMs - elapsed);
        }
        await sleep(180);
        return result;
      } finally {
        setIsVisible(false);
        setProgress(0);
      }
    },
    [],
  );

  const runWithProgress = useCallback(
    async <T,>(task: () => Promise<T> | T, options?: RunWithProgressOptions): Promise<T> => {
      return runWithTrackedProgress(async (reporter) => {
        const ticker = window.setInterval(() => {
          setProgress((prev) => {
            if (prev >= 92) return prev;
            return Math.min(92, prev + 7);
          });
        }, 70);
        try {
          const result = await task();
          reporter.setProgress(100);
          return result;
        } finally {
          window.clearInterval(ticker);
        }
      }, options);
    },
    [runWithTrackedProgress],
  );

  const overlayActive = isVisible || systemSync.active;
  const overlayProgress = isVisible ? progress : systemSync.progress;
  const overlayLabel = isVisible ? label : systemSync.label;

  const value = useMemo(
    () => ({
      runWithProgress,
      runWithTrackedProgress,
      isVisible,
      progress,
      label,
      systemSync,
      setSystemSync,
      overlayActive,
      overlayProgress,
      overlayLabel,
    }),
    [
      runWithProgress,
      runWithTrackedProgress,
      isVisible,
      progress,
      label,
      systemSync,
      setSystemSync,
      overlayActive,
      overlayProgress,
      overlayLabel,
    ],
  );

  return (
    <MobileLoadingOverlayContext.Provider value={value}>
      {children}
    </MobileLoadingOverlayContext.Provider>
  );
}

export function MobileLoadingOverlayHost() {
  const { overlayActive, overlayProgress, overlayLabel } = useMobileLoadingOverlay();
  if (!overlayActive) return null;

  const pct = clampProgress(overlayProgress);

  return (
    <div
      className="mobile-sync-overlay fixed inset-0 z-[980] flex items-center justify-center bg-[hsl(222_47%_4%/0.38)] backdrop-blur-md"
      role="presentation"
      aria-hidden={false}
    >
      <div
        className="mobile-sync-overlay-card w-[min(92vw,22rem)] rounded-[1.35rem] border border-white/10 bg-[hsl(var(--card)/0.88)] px-5 py-5 shadow-[0_24px_80px_-20px_hsl(222_47%_2%/0.85)] backdrop-blur-2xl"
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label={overlayLabel}
      >
        <div className="mb-4 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
              Sincronização
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-[hsl(var(--foreground))]">{overlayLabel}</p>
          </div>
          <p className="shrink-0 text-2xl font-bold tabular-nums leading-none text-[hsl(var(--foreground))]">
            {pct}
            <span className="text-sm font-semibold text-[hsl(var(--muted-foreground))]">%</span>
          </p>
        </div>

        <div
          className="mobile-sync-overlay-track relative h-2.5 overflow-hidden rounded-full bg-[hsl(var(--muted))]/55"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={overlayLabel}
        >
          <div
            className="mobile-sync-overlay-fill absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-400 via-sky-400 to-cyan-300 shadow-[0_0_18px_hsl(152_72%_48%/0.45)] transition-[width] duration-200 ease-out"
            style={{ width: `${pct}%` }}
          />
          <div className="mobile-sync-overlay-shimmer pointer-events-none absolute inset-0 rounded-full" aria-hidden />
        </div>
      </div>
    </div>
  );
}
