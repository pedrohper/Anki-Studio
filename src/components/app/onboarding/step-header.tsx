import type { LucideIcon } from "lucide-react";
import { forwardRef } from "react";

/** Cabeçalho de cada etapa. Recebe o foco quando a etapa muda (leitores de tela anunciam o título). */
export const StepHeader = forwardRef<
  HTMLHeadingElement,
  { icon: LucideIcon; eyebrow: string; title: string; description: React.ReactNode }
>(function StepHeader({ icon: Icon, eyebrow, title, description }, ref) {
  return (
    <div className="grid gap-4">
      <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="size-6" />
      </span>
      <div className="grid gap-2">
        <p className="font-medium text-primary text-xs uppercase tracking-wider">{eyebrow}</p>
        <h2 ref={ref} tabIndex={-1} className="font-semibold text-2xl tracking-tight outline-none sm:text-3xl">
          {title}
        </h2>
        <div className="text-muted-foreground leading-relaxed">{description}</div>
      </div>
    </div>
  );
});
