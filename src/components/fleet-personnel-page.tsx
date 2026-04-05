import { Plus, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { CatalogCategory } from "../context/catalog-items-context";
import { useCatalogItems } from "../context/catalog-items-context";
import { useLimpezaPendente } from "../context/limpeza-pendente-context";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { TabsList } from "./ui/tabs";
import { DetalheServicoSheet } from "./detalhe-servico-sheet";
import { VehicleMaintenancePanel } from "./vehicle-maintenance-panel";

const subTabs = ["Viaturas", "Motorista", "Detalhe de Serviço"] as const;

const viaturaSubTabs = ["Cadastrar Viatura", "Manutenções"] as const;

const motoristaCategory: CatalogCategory = "motoristas";

export function FleetPersonnelPage() {
  const { items, addItem, removeItem } = useCatalogItems();
  const { isPendente, setPendente } = useLimpezaPendente();
  const [activeSubTab, setActiveSubTab] = useState<string>(subTabs[0]);
  const [draftMotorista, setDraftMotorista] = useState("");
  const [draftViaturaAdmin, setDraftViaturaAdmin] = useState("");
  const [draftViaturaAmb, setDraftViaturaAmb] = useState("");
  const [viaturaInnerTab, setViaturaInnerTab] = useState<string>(viaturaSubTabs[0]);

  const isMotorista = activeSubTab === "Motorista";
  const isViatura = activeSubTab === "Viaturas";
  const isDetalheServico = activeSubTab === "Detalhe de Serviço";
  const isCadastrarViatura = viaturaInnerTab === "Cadastrar Viatura";

  const canAddMotorista = useMemo(() => draftMotorista.trim().length > 0, [draftMotorista]);
  const canAddAdmin = useMemo(() => draftViaturaAdmin.trim().length > 0, [draftViaturaAdmin]);
  const canAddAmb = useMemo(() => draftViaturaAmb.trim().length > 0, [draftViaturaAmb]);

  function handleAddMotorista() {
    if (!canAddMotorista) return;
    const added = addItem(motoristaCategory, draftMotorista);
    if (added) setDraftMotorista("");
  }

  function handleAddViaturaAdmin() {
    if (!canAddAdmin) return;
    const added = addItem("viaturasAdministrativas", draftViaturaAdmin);
    if (added) setDraftViaturaAdmin("");
  }

  function handleAddViaturaAmb() {
    if (!canAddAmb) return;
    const added = addItem("ambulancias", draftViaturaAmb);
    if (added) setDraftViaturaAmb("");
  }

  return (
    <div className="space-y-4">
      <TabsList items={[...subTabs]} active={activeSubTab} onChange={setActiveSubTab} />
      <Card>
        <CardContent className="space-y-4">
          {isMotorista ? (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1 space-y-2">
                  <label className="text-sm font-medium" htmlFor="fleet-draft-motorista">
                    Novo motorista
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="fleet-draft-motorista"
                      type="text"
                      value={draftMotorista}
                      onChange={(e) => setDraftMotorista(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddMotorista();
                        }
                      }}
                      placeholder="Ex.: SG Silva"
                      className="h-10 min-w-0 flex-1 rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm text-[hsl(var(--foreground))] shadow-sm placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                    />
                    <Button
                      type="button"
                      variant="default"
                      size="icon"
                      className="h-10 w-10 shrink-0"
                      aria-label="Adicionar motorista"
                      disabled={!canAddMotorista}
                      onClick={handleAddMotorista}
                    >
                      <Plus className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.12)] p-3">
                <h4 className="mb-2 text-sm font-semibold text-[hsl(var(--foreground))]">
                  Motorista ({items.motoristas.length})
                </h4>
                {items.motoristas.length === 0 ? (
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">Nenhum item ainda.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {items.motoristas.map((entry) => (
                      <li
                        key={entry}
                        className="flex items-center justify-between gap-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 py-1.5 text-sm"
                      >
                        <span className="min-w-0 flex-1 break-words">{entry}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-slate-500 hover:text-red-600"
                          aria-label={`Remover ${entry}`}
                          onClick={() => removeItem(motoristaCategory, entry)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : null}

          {isViatura ? (
            <>
              <TabsList items={[...viaturaSubTabs]} active={viaturaInnerTab} onChange={setViaturaInnerTab} />
              {isCadastrarViatura ? (
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="fleet-draft-viatura-admin">
                    Nova viatura administrativa
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="fleet-draft-viatura-admin"
                      type="text"
                      value={draftViaturaAdmin}
                      onChange={(e) => setDraftViaturaAdmin(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddViaturaAdmin();
                        }
                      }}
                      placeholder="Ex.: TTP-2G26"
                      className="h-10 min-w-0 flex-1 rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm text-[hsl(var(--foreground))] shadow-sm placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                    />
                    <Button
                      type="button"
                      variant="default"
                      size="icon"
                      className="h-10 w-10 shrink-0"
                      aria-label="Adicionar viatura administrativa"
                      disabled={!canAddAdmin}
                      onClick={handleAddViaturaAdmin}
                    >
                      <Plus className="h-5 w-5" />
                    </Button>
                  </div>
                  <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.12)] p-3">
                    <h4 className="mb-2 text-sm font-semibold text-[hsl(var(--foreground))]">
                      Viaturas administrativas ({items.viaturasAdministrativas.length})
                    </h4>
                    {items.viaturasAdministrativas.length === 0 ? (
                      <p className="text-sm text-[hsl(var(--muted-foreground))]">Nenhuma ainda.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {items.viaturasAdministrativas.map((entry) => (
                          <li
                            key={entry}
                            className="flex items-center justify-between gap-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 py-1.5 text-sm"
                          >
                            <span className="min-w-0 flex-1 break-words">{entry}</span>
                            <div className="flex shrink-0 items-center gap-0.5">
                              <label
                                className="flex cursor-pointer items-center gap-1 rounded-md p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
                                title="Pendência de limpeza (painel inicial)"
                              >
                                <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                <input
                                  type="checkbox"
                                  checked={isPendente(entry)}
                                  onChange={(e) => setPendente(entry, e.target.checked)}
                                  className="h-3.5 w-3.5 rounded border-[hsl(var(--border))]"
                                  aria-label={`Pendência de limpeza para ${entry}`}
                                />
                              </label>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0 text-slate-500 hover:text-red-600"
                                aria-label={`Remover ${entry}`}
                                onClick={() => {
                                  setPendente(entry, false);
                                  removeItem("viaturasAdministrativas", entry);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="fleet-draft-viatura-amb">
                    Nova ambulância
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="fleet-draft-viatura-amb"
                      type="text"
                      value={draftViaturaAmb}
                      onChange={(e) => setDraftViaturaAmb(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddViaturaAmb();
                        }
                      }}
                      placeholder="Ex.: AMB-01 / M-10234"
                      className="h-10 min-w-0 flex-1 rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm text-[hsl(var(--foreground))] shadow-sm placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                    />
                    <Button
                      type="button"
                      variant="default"
                      size="icon"
                      className="h-10 w-10 shrink-0"
                      aria-label="Adicionar ambulância"
                      disabled={!canAddAmb}
                      onClick={handleAddViaturaAmb}
                    >
                      <Plus className="h-5 w-5" />
                    </Button>
                  </div>
                  <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.12)] p-3">
                    <h4 className="mb-2 text-sm font-semibold text-[hsl(var(--foreground))]">
                      Ambulâncias ({items.ambulancias.length})
                    </h4>
                    {items.ambulancias.length === 0 ? (
                      <p className="text-sm text-[hsl(var(--muted-foreground))]">Nenhuma ainda.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {items.ambulancias.map((entry) => (
                          <li
                            key={entry}
                            className="flex items-center justify-between gap-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 py-1.5 text-sm"
                          >
                            <span className="min-w-0 flex-1 break-words">{entry}</span>
                            <div className="flex shrink-0 items-center gap-0.5">
                              <label
                                className="flex cursor-pointer items-center gap-1 rounded-md p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
                                title="Pendência de limpeza (painel inicial)"
                              >
                                <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                <input
                                  type="checkbox"
                                  checked={isPendente(entry)}
                                  onChange={(e) => setPendente(entry, e.target.checked)}
                                  className="h-3.5 w-3.5 rounded border-[hsl(var(--border))]"
                                  aria-label={`Pendência de limpeza para ${entry}`}
                                />
                              </label>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0 text-slate-500 hover:text-red-600"
                                aria-label={`Remover ${entry}`}
                                onClick={() => {
                                  setPendente(entry, false);
                                  removeItem("ambulancias", entry);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
              ) : (
                <VehicleMaintenancePanel />
              )}
            </>
          ) : null}

          {isDetalheServico ? <DetalheServicoSheet /> : null}
        </CardContent>
      </Card>
    </div>
  );
}
