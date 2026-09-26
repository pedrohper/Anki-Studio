"use client";

import { ExternalLinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";

export const ANKI_CONNECT_CODE = "2055492159";

function Step({ number, title, children }: { number: number; title: string; children?: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[1.75rem_1fr] gap-3">
      <span className="grid size-7 place-items-center rounded-full bg-primary/10 font-semibold text-primary text-xs">
        {number}
      </span>
      <div className="grid gap-1.5 pt-0.5">
        <p className="font-medium text-sm">{title}</p>
        {children && <div className="grid gap-2 text-muted-foreground text-sm">{children}</div>}
      </div>
    </li>
  );
}

function CodeLine({ value, copyLabel }: { value: string; copyLabel: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border bg-muted/60 py-1.5 pr-1.5 pl-3">
      <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre font-mono text-foreground text-xs leading-5">
        {value}
      </pre>
      <CopyButton value={value} label={copyLabel} />
    </div>
  );
}

/**
 * Passo a passo para ligar o Anki ao app. No modo "proxy" (rodando no próprio
 * PC) não precisa liberar CORS; no site publicado, o navegador fala direto
 * com o AnkiConnect e a origem do site precisa estar liberada.
 */
export function AnkiSetupGuide({ mode, className }: { mode: "direct" | "proxy"; className?: string }) {
  const origin = typeof window === "undefined" ? "https://seu-site" : window.location.origin;
  const corsLine = `"webCorsOriginList": ${JSON.stringify(["http://localhost", origin])}`;

  return (
    <ol className={cn("grid gap-5", className)}>
      <Step number={1} title="Instale o Anki Desktop">
        <p>
          Se ainda não tiver, baixe em{" "}
          <a
            className="inline-flex items-center gap-1 text-primary hover:underline"
            href="https://apps.ankiweb.net"
            target="_blank"
            rel="noreferrer"
          >
            apps.ankiweb.net <ExternalLinkIcon className="size-3" />
          </a>
          .
        </p>
      </Step>
      <Step number={2} title="Adicione o complemento AnkiConnect">
        <p>No Anki: Ferramentas → Complementos → Obter complementos, cole o código abaixo e reinicie o Anki.</p>
        <CodeLine value={ANKI_CONNECT_CODE} copyLabel="Copiar código do AnkiConnect" />
      </Step>
      {mode === "direct" && (
        <Step number={3} title="Libere este site no AnkiConnect">
          <p>
            Em Ferramentas → Complementos → AnkiConnect → Configurar, troque a linha{" "}
            <code className="font-mono text-foreground">webCorsOriginList</code> por esta e reinicie o Anki:
          </p>
          <CodeLine value={corsLine} copyLabel="Copiar configuração de CORS" />
          <p className="text-xs">Se o navegador pedir permissão para acessar a rede local, aceite.</p>
        </Step>
      )}
      <Step number={mode === "direct" ? 4 : 3} title="Deixe o Anki aberto enquanto usa o Anki Studio" />
    </ol>
  );
}
