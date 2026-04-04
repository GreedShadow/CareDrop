import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Textarea = forwardRef(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn("w-full resize-y border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none", className)}
      {...props}
    />
  );
});
