"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyButton({
  value,
  label = "Copiar",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="icon-xs"
      variant="ghost"
      className={className}
      aria-label={copied ? "Copiado" : label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1_500);
        } catch {
          toast.error("Não consegui copiar. Selecione o texto e copie manualmente.");
        }
      }}
    >
      {copied ? <CheckIcon className="text-emerald-600" /> : <CopyIcon />}
    </Button>
  );
}
