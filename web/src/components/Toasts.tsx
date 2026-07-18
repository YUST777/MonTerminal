import { create } from "zustand";

export interface Toast {
  id: number;
  kind: "info" | "success" | "error";
  text: string;
}

interface ToastState {
  toasts: Toast[];
  push: (kind: Toast["kind"], text: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, text) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 6000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function Toasts() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] left-3 right-3 z-50 flex flex-col items-end gap-2 lg:bottom-4 lg:left-auto lg:right-4">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`w-fit max-w-[min(24rem,calc(100vw-1.5rem))] break-words rounded border bg-raised px-3 py-2.5 text-left text-xs leading-relaxed shadow-lg ${
            t.kind === "error"
              ? "border-down text-down"
              : t.kind === "success"
                ? "border-up text-up"
                : "border-line text-fg"
          }`}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}
