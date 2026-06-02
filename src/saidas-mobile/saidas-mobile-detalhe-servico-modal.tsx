import { useEffect, useId, useMemo, useState } from "react";
import { useSyncPreference } from "../context/sync-preference-context";
import { listMotoristasComServicoOuRotinaNoDia } from "../lib/detalheServicoDayMarkers";
import {
  emptyRodapeAssinatura,
  loadDetalheServicoBundleFromIdb,
  normalizeDetalheServicoBundle,
  saveDetalheServicoBundleToIdb,
  type DetalheServicoBundle,
} from "../lib/detalheServicoBundle";
import { ensureFirebaseAuth } from "../lib/firebase/auth";
import { isFirebaseConfigured } from "../lib/firebase/config";
import { SOT_STATE_DOC, subscribeSotStateDoc } from "../lib/firebase/sotStateFirestore";
import { ptBrToIsoDate } from "../lib/dateFormat";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";
import { MOBILE_MODAL_OVERLAY_CLASS } from "./mobileModalOverlayClass";
import { DetalheServicoReadonlyTable } from "./detalhe-servico-readonly-table";
import { clampMobileProgress } from "./mobileProgressUtils";
import { MobileProgressOverlayPanel } from "./mobile-progress-overlay-panel";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filterDatePtBr: string;
};

const LOAD_LABEL = "A carregar Detalhe de Serviço…";
const MIN_OVERLAY_MS = 450;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isCompleteDatePtBr(value: string) {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(value);
}

export function SaidasMobileDetalheServicoModal({ open, onOpenChange, filterDatePtBr }: Props) {
  const { firebaseOnlyEnabled } = useSyncPreference();
  const titleId = useId();
  const [bundle, setBundle] = useState<DetalheServicoBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [progressOverlayVisible, setProgressOverlayVisible] = useState(false);
  const [fullDetail, setFullDetail] = useState(false);

  const isoDate = useMemo(() => ptBrToIsoDate(filterDatePtBr.trim()), [filterDatePtBr]);
  const dateOk = isCompleteDatePtBr(filterDatePtBr.trim()) && isoDate.length > 0;
  const monthKey = isoDate.slice(0, 7);

  const marcados = useMemo(() => {
    if (!bundle || !dateOk) return [];
    return listMotoristasComServicoOuRotinaNoDia(bundle, isoDate);
  }, [bundle, dateOk, isoDate]);

  const comS = useMemo(() => marcados.filter((m) => m.servico), [marcados]);
  const comRo = useMemo(() => marcados.filter((m) => m.rotina), [marcados]);

  useEffect(() => {
    if (!open) {
      setFullDetail(false);
      setProgressOverlayVisible(false);
      setLoadProgress(0);
      return;
    }
    let cancelled = false;
    let unsub: (() => void) | undefined;
    const startedAt = Date.now();

    const bumpProgress = (pct: number) => {
      setLoadProgress((prev) => Math.max(prev, clampMobileProgress(pct)));
    };

    const finishLoad = async () => {
      bumpProgress(100);
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_OVERLAY_MS) {
        await sleep(MIN_OVERLAY_MS - elapsed);
      }
      if (cancelled) return;
      await sleep(160);
      if (cancelled) return;
      setLoading(false);
      setProgressOverlayVisible(false);
      setLoadProgress(0);
    };

    setLoading(true);
    setProgressOverlayVisible(true);
    bumpProgress(12);
    void (async () => {
      try {
        bumpProgress(28);
        const useCloud = isFirebaseConfigured() && firebaseOnlyEnabled;
        if (!useCloud) {
          const local = await loadDetalheServicoBundleFromIdb();
          if (cancelled) return;
          bumpProgress(82);
          setBundle(local);
          await finishLoad();
          return;
        }

        bumpProgress(42);
        await ensureFirebaseAuth();
        if (cancelled) return;
        bumpProgress(55);

        unsub = subscribeSotStateDoc(
          SOT_STATE_DOC.detalheServico,
          (payload) => {
            void (async () => {
              if (cancelled) return;
              if (payload === null) {
                await finishLoad();
                return;
              }
              bumpProgress(72);
              const next = normalizeDetalheServicoBundle(payload);
              setBundle(next);
              await saveDetalheServicoBundleToIdb(next);
              bumpProgress(88);
              await finishLoad();
            })();
          },
          (err) => {
            console.error("[SOT] Firestore detalhe serviço (mobile):", err);
            if (!cancelled) void finishLoad();
          },
          { ignoreCachedSnapshotWhenOnline: true },
        );
      } catch (e) {
        console.error("[SOT] Carregar detalhe serviço (mobile):", e);
        if (!cancelled) {
          setBundle(null);
          await finishLoad();
        }
      }
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [open, firebaseOnlyEnabled]);

  const sheetForMonth = bundle?.sheets[monthKey];
  const rodapeForMonth = bundle?.rodapes[monthKey] ?? emptyRodapeAssinatura();
  const columnGray = bundle?.columnGrayByMonth[monthKey] ?? {};

  if (!open) return null;

  return (
    <>
      {progressOverlayVisible ? (
        <MobileProgressOverlayPanel
          progress={loadProgress}
          label={LOAD_LABEL}
          subtitle="Detalhe de Serviço"
          className="z-[990]"
        />
      ) : null}
      <div
        className={cn(MOBILE_MODAL_OVERLAY_CLASS, "z-[500]")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onOpenChange(false);
        }}
      >
        <div
          className="flex max-h-[min(92vh,720px)] w-full max-w-lg flex-col rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-2xl sm:max-w-xl"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="shrink-0 border-b border-[hsl(var(--border))] px-5 py-4">
            <h2 id={titleId} className="text-lg font-semibold text-[hsl(var(--foreground))]">
              {fullDetail ? "Detalhe de Serviço — tabela completa" : "Detalhe de Serviço"}
            </h2>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
              {fullDetail ? (
                <>
                  Mês de <span className="font-medium text-[hsl(var(--foreground))]">{monthKey}</span> ·
                  referência do dia{" "}
                  <span className="font-medium text-[hsl(var(--foreground))]">
                    {dateOk ? filterDatePtBr.trim() : "—"}
                  </span>
                </>
              ) : (
                <>
                  Serviço (<strong className="text-[hsl(var(--foreground))]">S</strong>) e rotina (
                  <strong className="text-[hsl(var(--foreground))]">RO</strong>) no dia{" "}
                  <span className="font-medium text-[hsl(var(--foreground))]">
                    {dateOk ? filterDatePtBr.trim() : "—"}
                  </span>
                  {dateOk ? null : (
                    <span className="mt-1 block text-amber-800 dark:text-amber-200/90">
                      Defina a data completa (dd/mm/aaaa) no filtro «Data da saída» acima da lista.
                    </span>
                  )}
                </>
              )}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
            {loading ? null : fullDetail ? (
              !dateOk ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">Data inválida para mostrar a tabela.</p>
              ) : (
                <DetalheServicoReadonlyTable
                  monthKey={monthKey}
                  sheet={
                    sheetForMonth ?? {
                      rows: [],
                      cells: {},
                    }
                  }
                  columnGray={columnGray}
                  rodape={rodapeForMonth}
                />
              )
            ) : !dateOk ? null : comS.length === 0 && comRo.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Ninguém com <strong>S</strong> ou <strong>RO</strong> neste dia na grelha «Detalhe de Serviço».
              </p>
            ) : (
              <div className="space-y-5">
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-[hsl(var(--foreground))]">Serviço (S)</h3>
                  {comS.length === 0 ? (
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">Nenhum motorista com S neste dia.</p>
                  ) : (
                    <ul className="space-y-2">
                      {comS.map((row, i) => (
                        <li
                          key={`s-${row.motorista}-${i}`}
                          className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.08)] px-3 py-2 text-sm font-medium text-[hsl(var(--foreground))]"
                        >
                          {row.motorista}
                          {row.rotina ? (
                            <span className="ml-2 text-xs font-normal text-[hsl(var(--muted-foreground))]">
                              (também RO)
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-[hsl(var(--foreground))]">Rotina (RO)</h3>
                  {comRo.length === 0 ? (
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">Nenhum motorista com RO neste dia.</p>
                  ) : (
                    <ul className="space-y-2">
                      {comRo.map((row, i) => (
                        <li
                          key={`ro-${row.motorista}-${i}`}
                          className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.08)] px-3 py-2 text-sm font-medium text-[hsl(var(--foreground))]"
                        >
                          {row.motorista}
                          {row.servico ? (
                            <span className="ml-2 text-xs font-normal text-[hsl(var(--muted-foreground))]">
                              (também S)
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            )}
          </div>

          <div className="shrink-0 flex flex-col gap-2 border-t border-[hsl(var(--border))] px-5 py-3 sm:flex-row sm:flex-wrap sm:items-center">
            {fullDetail ? (
              <Button type="button" className="w-full font-medium sm:w-auto" onClick={() => setFullDetail(false)}>
                Voltar ao resumo
              </Button>
            ) : (
              <Button
                type="button"
                variant="default"
                className="w-full sm:flex-1"
                disabled={!dateOk || loading}
                onClick={() => setFullDetail(true)}
              >
                Detalhe Completo
              </Button>
            )}
            <Button
              type="button"
              className="w-full font-medium sm:w-auto sm:min-w-[7rem]"
              onClick={() => onOpenChange(false)}
            >
              Fechar
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
