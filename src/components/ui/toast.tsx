"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type ToastVariant = "success" | "error" | "info";

type ToastItem = {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
};

type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
};

type ToastContextValue = {
  toast: (input: ToastInput) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_STYLES: Record<
  ToastVariant,
  { container: string; icon: string; Icon: typeof CheckCircle2 }
> = {
  success: {
    container: "border-emerald-200 bg-white",
    icon: "text-emerald-500",
    Icon: CheckCircle2,
  },
  error: {
    container: "border-red-200 bg-white",
    icon: "text-red-500",
    Icon: AlertCircle,
  },
  info: {
    container: "border-purple-200 bg-white",
    icon: "text-purple-500",
    Icon: Info,
  },
};

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const styles = VARIANT_STYLES[item.variant];
  const { Icon } = styles;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border p-4 shadow-lg shadow-black/10 toast-enter",
        styles.container,
      )}
    >
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", styles.icon)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900">{item.title}</p>
        {item.description ? (
          <p className="mt-1 text-sm leading-relaxed text-gray-600">{item.description}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        className="shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback(
    ({ title, description, variant = "info", durationMs = 5000 }: ToastInput) => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current, { id, title, description, variant }]);

      const timer = setTimeout(() => dismiss(id), durationMs);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  const success = useCallback(
    (title: string, description?: string) => toast({ title, description, variant: "success" }),
    [toast],
  );

  const error = useCallback(
    (title: string, description?: string) => toast({ title, description, variant: "error" }),
    [toast],
  );

  const info = useCallback(
    (title: string, description?: string) => toast({ title, description, variant: "info" }),
    [toast],
  );

  const value = useMemo(
    () => ({ toast, success, error, info }),
    [toast, success, error, info],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-label="Notifications"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2"
      >
        {toasts.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
