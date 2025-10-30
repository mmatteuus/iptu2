import {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
  type Dispatch,
  type ReactNode,
  type SetStateAction
} from "react";
import type { DebitoResumo, Identificacao } from "../services/prodata";

type AppContextValue = {
  identificacao?: Identificacao;
  setIdentificacao: (value?: Identificacao) => void;
  debitosSelecionados: DebitoResumo[];
  setDebitosSelecionados: Dispatch<SetStateAction<DebitoResumo[]>>;
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
  const [identificacao, setIdentificacao] = useState<Identificacao | undefined>(undefined);
  const [debitosSelecionados, setDebitosSelecionados] = useState<DebitoResumo[]>([]);
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
      identificacao,
      setIdentificacao,
      debitosSelecionados,
      setDebitosSelecionados,
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
    [identificacao, debitosSelecionados, lastDocumento, fontScale, highContrast]
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
