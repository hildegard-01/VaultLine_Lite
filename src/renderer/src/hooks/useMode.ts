/**
 * 오프라인/커넥티드 모드 상태 훅
 *
 * 역할: 현재 앱의 연결 모드(offline/connected)를 제공합니다.
 *       server:status IPC를 10초마다 폴링하여 최신 상태를 유지합니다.
 */
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { invoke } from '@renderer/services/ipcClient';

export type AppMode = 'offline' | 'connected';

export interface ConnectedUser {
  id: number;
  userId: number;
  username: string;
  role: string;
}

interface ModeContextValue {
  mode: AppMode;
  connected: boolean;
  user: ConnectedUser | null;
  serverUrl: string | null;
  isAdmin: boolean;
  setMode: (mode: AppMode) => void;
  refresh: () => void;
}

const ModeContext = createContext<ModeContextValue | null>(null);

export const ModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<AppMode>('offline');
  const [user, setUser] = useState<ConnectedUser | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const status = await invoke('server:status' as any) as any;
      setModeState(status.mode === 'connected' ? 'connected' : 'offline');
      if (status.user) {
        setUser({ ...status.user, id: status.user.userId });
      } else {
        setUser(null);
      }
      setServerUrl(status.serverUrl ?? null);
    } catch {
      // 오프라인 유지
    }
  }, []);

  // 초기 로드 및 10초 폴링
  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, 10000);
    return () => clearInterval(timer);
  }, [fetchStatus]);

  // Main Process에서 모드 변경 이벤트 수신
  useEffect(() => {
    const api = (window as any).api;
    if (api?.on) {
      const unsubscribe = api.on('server:mode-changed', () => {
        fetchStatus();
      });
      return unsubscribe;
    }
  }, [fetchStatus]);

  const setMode = useCallback((newMode: AppMode) => {
    setModeState(newMode);
  }, []);

  const value: ModeContextValue = {
    mode,
    connected: mode === 'connected',
    user,
    serverUrl,
    isAdmin: user?.role === 'admin',
    setMode,
    refresh: fetchStatus,
  };

  return React.createElement(ModeContext.Provider, { value }, children);
};

export const useMode = (): ModeContextValue => {
  const ctx = useContext(ModeContext);
  if (!ctx) {
    throw new Error('useMode는 ModeProvider 내부에서 사용해야 합니다.');
  }
  return ctx;
};
