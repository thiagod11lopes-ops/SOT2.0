import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { getCurrentDatePtBr } from "../lib/dateFormat";

type Ctx = { filterDatePtBr: string; setFilterDatePtBr: Dispatch<SetStateAction<string>> };

const SaidasMobileFilterDateContext = createContext<Ctx | null>(null);

export function SaidasMobileFilterDateProvider({ children }: { children: ReactNode }) {
  const [filterDatePtBr, setFilterDatePtBr] = useState(() => getCurrentDatePtBr());
  return (
    <SaidasMobileFilterDateContext.Provider value={{ filterDatePtBr, setFilterDatePtBr }}>
      {children}
    </SaidasMobileFilterDateContext.Provider>
  );
}

export function useSaidasMobileFilterDate(): Ctx {
  const c = useContext(SaidasMobileFilterDateContext);
  if (!c) {
    throw new Error("useSaidasMobileFilterDate só pode ser usado dentro de SaidasMobileFilterDateProvider");
  }
  return c;
}
