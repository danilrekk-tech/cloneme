import { cn } from "@/lib/utils";

/**
 * Animated text-only wordmark for Clone Studio.
 * - No icon, only typography
 * - Custom Space Grotesk display font
 * - Animated conic-gradient shimmer + subtle dot pulse
 * - Fully theme-aware (uses foreground / primary tokens)
 */
export function Logo({
  className,
  size = "md",
  compact = false,
}: {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  compact?: boolean;
}) {
  const sizes = {
    sm: "text-base",
    md: "text-xl",
    lg: "text-3xl",
    xl: "text-5xl",
    hero: "text-[clamp(3.5rem,10vw,8rem)]",
  } as const;

  return (
    <span
      className={cn(
        "logo-wordmark inline-flex items-baseline gap-[0.15em] font-display font-semibold tracking-tight",
        sizes[size],
        className,
      )}
      aria-label="Clone Studio"
    >
      <span className="logo-shimmer relative">
        clone
        <span className="logo-underline" aria-hidden="true" />
      </span>
      {!compact && (
        <span className="text-muted-foreground/70 font-medium">studio</span>
      )}
      <span className="logo-dot" aria-hidden="true" />
    </span>
  );
}
