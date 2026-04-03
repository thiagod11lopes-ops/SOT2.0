import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  normalizarMapaOficinaCarregado,
  OFICINA_STORAGE_KEY,
  type MapaOficinaPorViatura,
  type RegistroOficina,
  viaturaEstaNaOficina,
} from "../lib/oficinaVisits";
import { idbGetJson, idbSetJson } from "../lib/indexedDb";

type OficinaVisitasContextValue = {
  mapaOficina: MapaOficinaPorViatura;
  setVisitasParaPlaca: (placa: string, visitas: RegistroOficina[]) => void;
  /** True se existe registro com data de entrada e sem data de saída. */
  estaNaOficina: (placa: string) => boolean;
};

const OficinaVisitasContext = createContext<OficinaVisitasContextValue | null>(null);

export function OficinaVisitasProvider({ children }: { children: ReactNode }) {
  const [mapaOficina, setMapaOficina] = useState<MapaOficinaPorViatura>({});
  const hidratado = useRef(false);

  useEffect(() => {
    let cancel = false;
    void idbGetJson<unknown>(OFICINA_STORAGE_KEY).then((raw) => {
      if (cancel) return;
      setMapaOficina(normalizarMapaOficinaCarregado(raw));
      hidratado.current = true;
    });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!hidratado.current) return;
    void idbSetJson(OFICINA_STORAGE_KEY, mapaOficina);
  }, [mapaOficina]);

  const setVisitasParaPlaca = useCallback((placa: string, visitas: RegistroOficina[]) => {
    setMapaOficina((prev) => ({ ...prev, [placa]: visitas }));
  }, []);

  const estaNaOficina = useCallback(
    (placa: string) => {
      const t = placa.trim();
      if (!t) return false;
      const key = Object.keys(mapaOficina).find((k) => k.toLowerCase() === t.toLowerCase());
      if (!key) return false;
      return viaturaEstaNaOficina(mapaOficina[key]);
    },
    [mapaOficina],
  );

  const value = useMemo(
    () => ({ mapaOficina, setVisitasParaPlaca, estaNaOficina }),
    [mapaOficina, setVisitasParaPlaca, estaNaOficina],
  );

  return (
    <OficinaVisitasContext.Provider value={value}>{children}</OficinaVisitasContext.Provider>
  );
}

export function useOficinaVisitas() {
  const ctx = useContext(OficinaVisitasContext);
  if (!ctx) {
    throw new Error("useOficinaVisitas deve ser usado dentro de OficinaVisitasProvider");
  }
  return ctx;
}
