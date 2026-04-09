/**
 * 오프라인/커넥티드 모드 상태 훅
 *
 * 역할: 현재 앱의 연결 모드(offline/connected)를 제공합니다.
 *       Main Process의 ModeManager에서 server:mode-changed 이벤트를 수신하여 자동 갱신.
 * 구성: ModeProvider (Context) / useMode (Hook)
 */
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

export type AppMode = 'offline' | 'connected';

interface ModeContextValue {
  /** 현재 모드 */
  mode: AppMode;
  /** 커넥티드 모드 여부 */
  connected: boolean;
  /** 모드 전환 */
  setMode: (mode: AppMode) => void;
}

const ModeContext = createContext<ModeContextValue | null>(null);

export const ModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<AppMode>('offline');

  const setMode = useCallback((newMode: AppMode) => {
    setModeState(newMode);
  }, []);

  // Main Process에서 모드 변경 이벤트 수신
  useEffect(() => {
    const api = (window as any).api;
    if (api?.on) {
      const unsubscribe = api.on('server:mode-changed', (data: { mode: AppMode }) => {
        setModeState(data.mode);
      });
      return unsubscribe;
    }
  }, []);

  const value: ModeContextValue = {
    mode,
    connected: mode === 'connected',
    setMode,
  };

  return React.createElement(ModeContext.Provider, { value }, children);
};

/**
 * 현재 앱 모드를 반환하는 훅
 *
 * @example
 * const { connected, mode } = useMode();
 * {connected && <NotificationBell />}
 */
export const useMode = (): ModeContextValue => {
  const ctx = useContext(ModeContext);
  if (!ctx) {
    throw new Error('useMode는 ModeProvider 내부에서 사용해야 합니다.');
  }
  return ctx;
};
