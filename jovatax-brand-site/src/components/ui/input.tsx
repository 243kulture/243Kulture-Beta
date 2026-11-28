import * as React from "react";
import { clsx } from "clsx";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={clsx(
      "flex h-11 w-full rounded-xl border border-[#E8F2EE]/15 bg-[#0a1f1a]/55 px-4 text-sm text-[#E8F2EE] placeholder:text-[#7F9B90] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4B740]",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
