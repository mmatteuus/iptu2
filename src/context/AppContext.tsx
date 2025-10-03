import { createContext, useContext, useMemo, useState, useEffect, type ReactNode } from "react";
import type { ImovelPesquisa } from "../services/sig";

export type PrefillDevedor = {
  tipo: "I" | "P";
  codigo: number;
  duams?: string;
};

type AppContextValue = {
  selectedImovel?: ImovelPesquisa;
  setSelectedImovel: (value?: ImovelPesquisa) => void;
  prefillDevedor?: PrefillDevedor;
  setPrefillDevedor: (value?: PrefillDevedor) => void;
  lastDocumento?: string;
  setLastDocumento: (value?: string) => void;
  fontScale: number;
  updateFontScale: (delta: number) => void;
  resetFontScale: () => void;
  highContrast: boolean;
  toggleHighContrast: () => void;
};

const MIN_FONT_SCALE = 0.9;
const MAX_FONT_SCALE = 1.3;

const AppContext = createContext<AppContextValue | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [selectedImovel, setSelectedImovel] = useState<ImovelPesquisa | undefined>(undefined);
  const [prefillDevedor, setPrefillDevedor] = useState<PrefillDevedor | undefined>(undefined);
  const [lastDocumento, setLastDocumento] = useState<string | undefined>(undefined);
  const [fontScale, setFontScale] = useState<number>(1);
  const [highContrast, setHighContrast] = useState<boolean>(false);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.style.setProperty("--app-font-scale", fontScale.toString());
      document.documentElement.style.fontSize = `${16 * fontScale}px`;
    }
  }, [fontScale]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.body.classList.toggle("high-contrast", highContrast);
    }
  }, [highContrast]);

  const value = useMemo<AppContextValue>(
    () => ({
      selectedImovel,
      setSelectedImovel,
      prefillDevedor,
      setPrefillDevedor,
      lastDocumento,
      setLastDocumento,
      fontScale,
      updateFontScale: (delta: number) =>
        setFontScale((current) =>
          Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, Number((current + delta).toFixed(2))))
        ),
      resetFontScale: () => setFontScale(1),
      highContrast,
      toggleHighContrast: () => setHighContrast((prev) => !prev)
    }),
    [selectedImovel, prefillDevedor, lastDocumento, fontScale, highContrast]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext deve ser utilizado dentro de AppProvider");
  }
  return context;
}
