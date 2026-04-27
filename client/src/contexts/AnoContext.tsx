import { createContext, useContext, useState, ReactNode } from "react";

interface AnoContextType {
  ano: number;
  setAno: (ano: number) => void;
}

const AnoContext = createContext<AnoContextType>({
  ano: new Date().getFullYear(),
  setAno: () => {},
});

export function AnoProvider({ children }: { children: ReactNode }) {
  const [ano, setAno] = useState<number>(new Date().getFullYear());
  return (
    <AnoContext.Provider value={{ ano, setAno }}>
      {children}
    </AnoContext.Provider>
  );
}

export function useAno() {
  return useContext(AnoContext);
}
