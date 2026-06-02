import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  MobileLoadingOverlayContext,
  type MobileProgressReporter,
  type RunWithProgressOptions,
  type SystemSyncOverlayState,
  useMobileLoadingOverlay,
} from "./mobile-loading-context";
import { clampMobileProgress, MobileProgressOverlayPanel } from "./mobile-progress-overlay-panel";

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
  return clampMobileProgress(value);
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

  return (
    <MobileProgressOverlayPanel
      progress={overlayProgress}
      label={overlayLabel}
      subtitle="Sincronização"
      className="z-[980]"
    />
  );
}
