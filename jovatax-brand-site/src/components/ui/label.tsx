import * as React from "react";
import { clsx } from "clsx";

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={clsx("text-sm font-medium text-[#A8C0B6]", className)}
      {...props}
    />
  );
}
