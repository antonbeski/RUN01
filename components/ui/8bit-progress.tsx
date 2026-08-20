"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProgressProps extends React.ComponentPropsWithoutRef<"div"> {
  value?: number;
  variant?: "default" | "retro";
  progressBg?: string;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, variant = "default", progressBg = "bg-primary", ...props }, ref) => {
    // Clamp the percentage value between 0 and 100
    const clampedValue = Math.min(100, Math.max(0, value));

    const isRetro = variant === "retro";

    return (
      <div
        ref={ref}
        className={cn(
          "relative w-full overflow-hidden bg-muted",
          isRetro
            ? "border-4 border-foreground p-0.5 bg-background shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] rounded-none"
            : "rounded-full h-4",
          className
        )}
        {...props}
      >
        <div
          className={cn(
            "h-full w-full flex-1 transition-all duration-300 ease-in-out",
            isRetro ? "transition-none" : "",
            progressBg
          )}
          style={{
            transform: `translateX(-${100 - clampedValue}%)`,
            imageRendering: isRetro ? "pixelated" : "auto",
          }}
        />
      </div>
    );
  }
);

Progress.displayName = "Progress";

export { Progress };
