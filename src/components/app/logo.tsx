import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Marca do Anki Studio: dois flashcards empilhados e uma faísca de IA no card
 * da frente. Desenhada em SVG para ficar nítida em qualquer tamanho e tema.
 */
export function LogoMark({ className, variant = "color" }: { className?: string; variant?: "color" | "onDark" }) {
  const id = useId().replace(/:/g, "");
  const gradient = `logo-gradient-${id}`;
  const onDark = variant === "onDark";

  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="Anki Studio" className={cn("size-8 shrink-0", className)}>
      <defs>
        <linearGradient id={gradient} x1="8" y1="4" x2="58" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="0.55" stopColor="#4f46e5" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      {onDark ? (
        <rect width="64" height="64" rx="16" fill="#ffffff" fillOpacity="0.14" />
      ) : (
        <rect width="64" height="64" rx="16" fill={`url(#${gradient})`} />
      )}
      {/* card de trás */}
      <rect
        x="15"
        y="15"
        width="30"
        height="36"
        rx="6"
        fill="#ffffff"
        fillOpacity="0.35"
        transform="rotate(-12 30 33)"
      />
      {/* card da frente */}
      <rect x="21" y="12" width="30" height="38" rx="6" fill="#ffffff" transform="rotate(6 36 31)" />
      {/* faísca de IA */}
      <path
        d="M36.5 20.5c.9 6.1 2.6 7.8 8.7 8.7-6.1.9-7.8 2.6-8.7 8.7-.9-6.1-2.6-7.8-8.7-8.7 6.1-.9 7.8-2.6 8.7-8.7Z"
        fill={onDark ? "#4f46e5" : `url(#${gradient})`}
        transform="rotate(6 36 31)"
      />
      <circle cx="44" cy="40.5" r="1.9" fill={onDark ? "#7c3aed" : `url(#${gradient})`} transform="rotate(6 36 31)" />
    </svg>
  );
}

export function Logo({ className, variant = "color" }: { className?: string; variant?: "color" | "onDark" }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <LogoMark variant={variant} />
      <span className="font-semibold tracking-tight">
        Anki <span className={variant === "onDark" ? "text-white/75" : "text-primary"}>Studio</span>
      </span>
    </span>
  );
}
