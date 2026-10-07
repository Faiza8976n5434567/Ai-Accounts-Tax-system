/** Short confirmation / error messages for the live app (same look as the demo's). */
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cx } from "../components/ui";

type Tone = "ok" | "err";
const ToastCtx = createContext<(msg: string, tone?: Tone) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; msg: string; tone: Tone }[]>([]);
  const toast = useCallback((msg: string, tone: Tone = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((x) => [...x, { id, msg, tone }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="fixed bottom-5 end-5 start-5 sm:start-auto z-[60] space-y-2" role="status" aria-live="polite">
        {toasts.map((x) => (
          <div key={x.id} className={cx("page-enter flex items-start gap-2.5 rounded-2xl px-4 py-3 text-sm shadow-2xl max-w-sm text-white", x.tone === "err" ? "bg-gradient-to-r from-rose-600 to-rose-500" : "bg-gradient-to-r from-emerald-600 to-teal-600")}>
            {x.tone === "err" ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={16} className="mt-0.5 shrink-0" />}
            <span>{x.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
