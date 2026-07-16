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
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`max-w-sm rounded border px-4 py-3 text-left text-sm shadow-lg bg-raised ${
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
