import { createContext, useContext } from 'react';

export type ToastTone = 'success' | 'error';
export type ShowToast = (message: string, tone?: ToastTone) => void;

export const ToastContext = createContext<ShowToast>(() => {});

export function useToast(): ShowToast {
  return useContext(ToastContext);
}
