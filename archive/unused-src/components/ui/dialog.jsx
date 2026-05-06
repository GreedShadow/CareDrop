import { createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const DialogContext = createContext({ open: false, onOpenChange: () => {} });

export function Dialog({ open, onOpenChange, children }) {
  return (
    <DialogContext.Provider value={{ open, onOpenChange }}>
      {children}
    </DialogContext.Provider>
  );
}

export function DialogContent({ className, children }) {
  const { open, onOpenChange } = useContext(DialogContext);
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className={cn("relative w-full max-w-lg bg-white p-6 shadow-2xl", className)}>
        <button
          type="button"
          className="absolute right-4 top-4 rounded-full px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
          onClick={() => onOpenChange?.(false)}
          aria-label="Close dialog"
        >
          ×
        </button>
        {children}
      </div>
    </div>,
    document.body
  );
}

export function DialogHeader({ className, ...props }) {
  return <div className={cn("mb-4 space-y-1.5", className)} {...props} />;
}

export function DialogTitle({ className, ...props }) {
  return <h2 className={cn("text-lg font-semibold", className)} {...props} />;
}

export function DialogDescription({ className, ...props }) {
  return <p className={cn("text-sm text-slate-500", className)} {...props} />;
}
