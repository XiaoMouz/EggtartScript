import * as React from "react";
import { cn } from "../../lib/utils";

export function Alert({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "destructive" }): React.JSX.Element {
  return (
    <div
      className={cn(
        "rounded-[22px] border px-4 py-3 text-sm",
        variant === "destructive"
          ? "border-[#a6452d]/70 bg-[#a6452d]/12 text-[#ffd5c7]"
          : "border-[rgba(228,179,99,0.24)] bg-[rgba(228,179,99,0.08)] text-[var(--foreground)]",
        className,
      )}
      {...props}
    />
  );
}

export const AlertTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>): React.JSX.Element => (
  <h5 className={cn("mb-1 font-medium", className)} {...props} />
);

export const AlertDescription = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element => (
  <div className={cn("text-sm leading-6 text-inherit/90", className)} {...props} />
);
