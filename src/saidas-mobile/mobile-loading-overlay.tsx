import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  MobileLoadingOverlayContext,
  type MobileProgressReporter,
  type RunWithProgressOptions,
  useMobileLoadingOverlay,
} from "./mobile-loading-context";

const DEFAULT_LABEL = "A carregar...";

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

  const value = useMemo(
    () => ({
      runWithProgress,
      runWithTrackedProgress,
      isVisible,
      progress,
      label,
    }),
    [runWithProgress, runWithTrackedProgress, isVisible, progress, label],
  );

  return (
    <MobileLoadingOverlayContext.Provider value={value}>
      {children}
    </MobileLoadingOverlayContext.Provider>
  );
}

export function MobileLoadingOverlayHost() {
  const { isVisible, progress, label } = useMobileLoadingOverlay();
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[980] flex items-center justify-center bg-black/45 backdrop-blur-[1px]">
      <div className="w-[min(92vw,26rem)] rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-4 shadow-2xl">
        <p className="mb-2 text-center text-sm font-semibold text-[hsl(var(--foreground))]">{label}</p>
        <div
          className="h-3 w-full overflow-hidden rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/45"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          aria-label={label}
        >
          <div
            className="h-full bg-[hsl(var(--primary))] transition-[width] duration-100 ease-linear"
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
        <p className="mt-2 text-center text-xs font-semibold tabular-nums text-[hsl(var(--muted-foreground))]">
          {Math.round(progress)}%
        </p>
      </div>
    </div>
  );
}
