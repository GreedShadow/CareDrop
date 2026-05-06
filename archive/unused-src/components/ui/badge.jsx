import { cn } from "@/lib/utils";

const variants = {
  default: "bg-slate-900 text-white",
  secondary: "bg-slate-100 text-slate-700",
  outline: "border border-slate-300 bg-white text-slate-700",
};

export function Badge({ className, variant = "default", ...props }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold transition",
        variants[variant] ?? variants.default,
        className
      )}
      {...props}
    />
  );
}
