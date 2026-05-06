import { forwardRef } from "react";
import { cn } from "@/lib/utils";

const variants = {
  default: "bg-slate-900 text-white hover:bg-slate-800",
  secondary: "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50",
  outline: "border border-slate-300 bg-white/70 text-slate-800 hover:bg-slate-50",
};

export const Button = forwardRef(function Button(
  { className, variant = "default", type = "button", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant] ?? variants.default,
        className
      )}
      {...props}
    />
  );
});
