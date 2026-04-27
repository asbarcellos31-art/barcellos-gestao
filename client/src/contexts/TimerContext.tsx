import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

interface TimerState {
  id: number;
  segundos: number;
  pausado: boolean;
  titulo?: string;
  duracaoMin?: number | null;
}

interface TimerContextType {
  timerAtivo: TimerState | null;
  setTimerAtivo: (timer: TimerState | null) => void;
  timerSegundos: number; // segundos atualizados em tempo real
}

const TimerContext = createContext<TimerContextType>({
  timerAtivo: null,
  setTimerAtivo: () => {},
  timerSegundos: 0,
});

export function TimerProvider({ children, userId }: { children: ReactNode; userId: number }) {
  const [timerAtivo, setTimerAtivoState] = useState<TimerState | null>(() => {
    if (!userId) return null;
    try {
      const saved = localStorage.getItem(`timer-${userId}`);
      if (!saved) return null;
      const data = JSON.parse(saved);
      if (!data || typeof data.id !== "number") return null;
      const segundosAcumulados = typeof data.segundosAcumulados === "number" ? data.segundosAcumulados : 0;
      if (!data.pausado && data.startedAt && typeof data.startedAt === "number") {
        const decorrido = Math.floor((Date.now() - data.startedAt) / 1000);
        return { id: data.id, segundos: segundosAcumulados + decorrido, pausado: false, titulo: data.titulo, duracaoMin: data.duracaoMin };
      }
      return { id: data.id, segundos: segundosAcumulados, pausado: true, titulo: data.titulo, duracaoMin: data.duracaoMin };
    } catch {
      return null;
    }
  });

  const [timerSegundos, setTimerSegundos] = useState(timerAtivo?.segundos ?? 0);

  const setTimerAtivo = useCallback((timer: TimerState | null) => {
    setTimerAtivoState(timer);
    setTimerSegundos(timer?.segundos ?? 0);
  }, []);

  // Atualizar segundos em tempo real quando timer está rodando
  useEffect(() => {
    if (!timerAtivo || timerAtivo.pausado) {
      setTimerSegundos(timerAtivo?.segundos ?? 0);
      return;
    }
    // Ler startedAt do localStorage para calcular tempo real
    const tick = () => {
      try {
        const saved = localStorage.getItem(`timer-${userId}`);
        if (!saved) return;
        const data = JSON.parse(saved);
        if (!data.pausado && data.startedAt) {
          const decorrido = Math.floor((Date.now() - data.startedAt) / 1000);
          setTimerSegundos((data.segundosAcumulados ?? 0) + decorrido);
        }
      } catch {
        // ignore
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [timerAtivo?.id, timerAtivo?.pausado, userId]);

  // Sincronizar com localStorage quando mudar externamente (ex: ao voltar para a aba)
  useEffect(() => {
    if (!userId) return;
    const handleStorage = () => {
      try {
        const saved = localStorage.getItem(`timer-${userId}`);
        if (!saved) {
          setTimerAtivoState(null);
          setTimerSegundos(0);
          return;
        }
        const data = JSON.parse(saved);
        if (!data || typeof data.id !== "number") return;
        const segundosAcumulados = typeof data.segundosAcumulados === "number" ? data.segundosAcumulados : 0;
        if (!data.pausado && data.startedAt) {
          const decorrido = Math.floor((Date.now() - data.startedAt) / 1000);
          setTimerAtivoState({ id: data.id, segundos: segundosAcumulados + decorrido, pausado: false, titulo: data.titulo, duracaoMin: data.duracaoMin });
        } else {
          setTimerAtivoState({ id: data.id, segundos: segundosAcumulados, pausado: true, titulo: data.titulo, duracaoMin: data.duracaoMin });
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [userId]);

  return (
    <TimerContext.Provider value={{ timerAtivo, setTimerAtivo, timerSegundos }}>
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer() {
  return useContext(TimerContext);
}
