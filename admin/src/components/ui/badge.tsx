import * as React from "react";
import { cn } from "../../lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border border-[rgba(228,179,99,0.35)] bg-[rgba(228,179,99,0.12)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--accent)]",
        className,
      )}
      {...props}
    />
  );
}
