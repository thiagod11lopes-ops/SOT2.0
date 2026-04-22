import { createContext, useContext } from "react";

export type RunWithProgressOptions = {
  label?: string;
  minDurationMs?: number;
};

export type MobileLoadingOverlayContextValue = {
  runWithProgress: <T>(task: () => Promise<T> | T, options?: RunWithProgressOptions) => Promise<T>;
  runWithTrackedProgress: <T>(
    task: (reporter: MobileProgressReporter) => Promise<T> | T,
    options?: RunWithProgressOptions,
  ) => Promise<T>;
  isVisible: boolean;
  progress: number;
  label: string;
};

export type MobileProgressReporter = {
  setProgress: (value: number) => void;
  setLabel: (value: string) => void;
};

export const MobileLoadingOverlayContext = createContext<MobileLoadingOverlayContextValue | null>(null);

export function useMobileLoadingOverlay(): MobileLoadingOverlayContextValue {
  const ctx = useContext(MobileLoadingOverlayContext);
  if (!ctx) {
    throw new Error("useMobileLoadingOverlay só pode ser usado dentro de MobileLoadingOverlayProvider");
  }
  return ctx;
}
