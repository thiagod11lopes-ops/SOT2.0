import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type RunWithProgressOptions = {
  label?: string;
  minDurationMs?: number;
};

type MobileLoadingOverlayContextValue = {
  runWithProgress: <T>(task: () => Promise<T> | T, options?: RunWithProgressOptions) => Promise<T>;
  isVisible: boolean;
  progress: number;
  label: string;
};

const DEFAULT_LABEL = "A carregar...";
const MobileLoadingOverlayContext = createContext<MobileLoadingOverlayContextValue | null>(null);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function MobileLoadingOverlayProvider({ children }: { children: ReactNode }) {
  const [isVisible, setIsVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState(DEFAULT_LABEL);

  const runWithProgress = useCallback(
    async <T,>(task: () => Promise<T> | T, options?: RunWithProgressOptions): Promise<T> => {
      const startedAt = Date.now();
      const minDurationMs = Math.max(450, options?.minDurationMs ?? 700);
      const nextLabel = options?.label?.trim() || DEFAULT_LABEL;
      setLabel(nextLabel);
      setProgress(0);
      setIsVisible(true);

      const ticker = window.setInterval(() => {
        setProgress((prev) => {
          if (prev >= 92) return prev;
          return Math.min(92, prev + 7);
        });
      }, 70);

      try {
        const result = await task();
        const elapsed = Date.now() - startedAt;
        if (elapsed < minDurationMs) {
          await sleep(minDurationMs - elapsed);
        }
        setProgress(100);
        await sleep(220);
        return result;
      } finally {
        window.clearInterval(ticker);
        setIsVisible(false);
        setProgress(0);
      }
    },
    [],
  );

  const value = useMemo(
    () => ({
      runWithProgress,
      isVisible,
      progress,
      label,
    }),
    [runWithProgress, isVisible, progress, label],
  );

  return (
    <MobileLoadingOverlayContext.Provider value={value}>
      {children}
    </MobileLoadingOverlayContext.Provider>
  );
}

export function useMobileLoadingOverlay(): MobileLoadingOverlayContextValue {
  const ctx = useContext(MobileLoadingOverlayContext);
  if (!ctx) {
    throw new Error("useMobileLoadingOverlay só pode ser usado dentro de MobileLoadingOverlayProvider");
  }
  return ctx;
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
