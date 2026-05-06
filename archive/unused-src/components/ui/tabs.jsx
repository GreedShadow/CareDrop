import { createContext, useContext } from "react";
import { cn } from "@/lib/utils";

const TabsContext = createContext(null);

export function Tabs({ value, onValueChange, className, children }) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ className, ...props }) {
  return <div className={cn("inline-grid gap-1 bg-slate-100 p-1", className)} {...props} />;
}

export function TabsTrigger({ value, className, children, ...props }) {
  const context = useContext(TabsContext);
  const active = context?.value === value;

  return (
    <button
      type="button"
      className={cn(
        "rounded-xl px-3 py-2 text-sm font-medium transition",
        active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800",
        className
      )}
      onClick={() => context?.onValueChange?.(value)}
      {...props}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, className, children, ...props }) {
  const context = useContext(TabsContext);
  if (context?.value !== value) return null;
  return (
    <div className={className} {...props}>
      {children}
    </div>
  );
}
