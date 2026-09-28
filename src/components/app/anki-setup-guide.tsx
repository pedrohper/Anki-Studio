"use client";

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
  Loader2Icon,
  MousePointerClickIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useEffect } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useAnkiStatus } from "@/hooks/use-studio";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";

export const ANKI_CONNECT_CODE = "2055492159";

/**
 * Tutorial "para qualquer pessoa" de como instalar o AnkiConnect no Anki
 * Desktop. Cada passo tem um desenho simplificado da tela do Anki mostrando
 * onde clicar (com o nome em português e em inglês, porque o Anki pode estar
 * em qualquer um dos dois), e no fim o app confere sozinho se deu certo.
 */

function Step({ number, title, children }: { number: number; title: string; children?: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[2rem_1fr] gap-3">
      <span className="grid size-8 place-items-center rounded-full bg-primary font-semibold text-primary-foreground text-sm">
        {number}
      </span>
      <div className="grid min-w-0 gap-2 pt-1">
        <p className="font-medium">{title}</p>
        {children && <div className="grid gap-2.5 text-muted-foreground text-sm">{children}</div>}
      </div>
    </li>
  );
}

function CodeLine({ value, copyLabel, big = false }: { value: string; copyLabel: string; big?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/60 py-1.5 pr-1.5 pl-3">
      <pre
        className={cn(
          "min-w-0 flex-1 overflow-x-auto whitespace-pre font-mono text-foreground",
          big ? "font-semibold text-lg tracking-widest" : "text-xs leading-5",
        )}
      >
        {value}
      </pre>
      <CopyButton value={value} label={copyLabel} />
    </div>
  );
}

/** Nome do botão/menu em português com o equivalente em inglês. */
function Ui({ pt, en }: { pt: string; en: string }) {
  return (
    <span className="whitespace-nowrap">
      <strong className="font-medium text-foreground">{pt}</strong> <span className="text-xs">({en})</span>
    </span>
  );
}

/** Janelinha desenhada imitando o Anki, só para mostrar onde clicar. */
function MockWindow({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="max-w-md overflow-hidden rounded-lg border bg-background text-foreground text-xs shadow-sm"
      aria-hidden
    >
      <div className="flex items-center gap-1.5 border-b bg-muted/70 px-2.5 py-1.5">
        <span className="size-2 rounded-full bg-red-400" />
        <span className="size-2 rounded-full bg-amber-400" />
        <span className="size-2 rounded-full bg-emerald-400" />
        <span className="ml-2 text-muted-foreground">{title}</span>
      </div>
      {children}
    </div>
  );
}

/** Destaque pulsando em volta do lugar certo para clicar. */
function Target({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex items-center gap-1 rounded bg-primary px-1.5 py-0.5 font-medium text-primary-foreground ring-4 ring-primary/25 motion-safe:animate-pulse",
        className,
      )}
    >
      {children}
      <MousePointerClickIcon className="size-3.5" />
    </span>
  );
}

/** Confere o AnkiConnect a cada 3 s enquanto o tutorial estiver aberto. */
function LiveCheck() {
  const { data, refetch, isFetching } = useAnkiStatus();
  const connected = data?.connected ?? false;
  useEffect(() => {
    if (connected) return;
    const timer = setInterval(() => void refetch(), 3_000);
    return () => clearInterval(timer);
  }, [connected, refetch]);

  return (
    <output
      aria-live="polite"
      data-testid="anki-live-check"
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3 text-sm",
        connected
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
          : "border-amber-500/30 bg-amber-500/10",
      )}
    >
      {connected ? (
        <CheckCircle2Icon className="size-5 shrink-0" />
      ) : (
        <Loader2Icon className="size-5 shrink-0 animate-spin text-amber-600 dark:text-amber-400" />
      )}
      <span className="flex-1 font-medium">
        {connected
          ? `Pronto! Anki conectado com ${data?.decks.length ?? 0} baralhos.`
          : "Esperando o Anki… assim que você terminar os passos, isto fica verde sozinho."}
      </span>
      {!connected && (
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          Testar agora
        </Button>
      )}
    </output>
  );
}

export function AnkiSetupGuide({
  mode,
  className,
  liveCheck = false,
}: {
  mode: "direct" | "proxy";
  className?: string;
  /** Mostra no fim um aviso que fica verde quando o Anki conecta. */
  liveCheck?: boolean;
}) {
  const origin = typeof window === "undefined" ? "https://seu-site" : window.location.origin;
  const corsLine = `"webCorsOriginList": ${JSON.stringify(["http://localhost", origin])}`;
  const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);
  const shortcut = isMac ? "⌘ Cmd + Shift + A" : "Ctrl + Shift + A";

  return (
    <div className={cn("grid gap-6", className)}>
      <ol className="grid gap-7" data-testid="anki-setup-guide">
        <Step number={1} title="Instale o Anki no computador">
          <p>
            Precisa ser o <strong className="text-foreground">Anki Desktop</strong> (Windows, Mac ou Linux). O site
            AnkiWeb e o app do celular não servem para isto. É grátis:
          </p>
          <div>
            <a
              href="https://apps.ankiweb.net"
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ size: "sm" })}
            >
              Baixar o Anki <ExternalLinkIcon />
            </a>
          </div>
          <p>Já tem? Só abra o Anki e siga para o passo 2.</p>
        </Step>

        <Step number={2} title="Abra a janela de complementos">
          <p>
            No menu de cima do Anki, clique em <Ui pt="Ferramentas" en="Tools" /> e depois em{" "}
            <Ui pt="Complementos" en="Add-ons" />. Atalho:{" "}
            <kbd className="rounded border px-1 font-mono">{shortcut}</kbd>.
          </p>
          <MockWindow title="Anki">
            <div className="flex gap-3 border-b px-2.5 py-1 text-muted-foreground">
              <span>Arquivo</span>
              <span>Editar</span>
              <span>Ver</span>
              <span className="rounded bg-muted px-1 text-foreground">Ferramentas</span>
              <span>Ajuda</span>
            </div>
            <div className="ml-[9.5rem] w-44 -translate-y-px rounded-b border border-t-0 bg-background p-1 shadow-sm">
              <p className="px-1.5 py-1 text-muted-foreground">Estudo filtrado…</p>
              <p className="px-1.5 py-1 text-muted-foreground">Gerenciar tipos de nota</p>
              <p className="px-1 py-1">
                <Target>Complementos</Target>
              </p>
              <p className="px-1.5 py-1 text-muted-foreground">Preferências…</p>
            </div>
          </MockWindow>
        </Step>

        <Step number={3} title="Clique em “Obter complementos…”">
          <p>
            Na janela que abrir, o botão fica do lado direito: <Ui pt="Obter complementos…" en="Get Add-ons…" />.
          </p>
          <MockWindow title="Complementos">
            <div className="grid grid-cols-[1fr_auto] gap-3 p-3">
              <div className="h-20 rounded border bg-muted/40" />
              <div className="grid content-start gap-1.5">
                <Target>Obter complementos…</Target>
                <span className="rounded border px-1.5 py-0.5 text-muted-foreground">Verificar atualizações</span>
                <span className="rounded border px-1.5 py-0.5 text-muted-foreground">Configurar</span>
              </div>
            </div>
          </MockWindow>
        </Step>

        <Step number={4} title="Cole o código do AnkiConnect e clique em OK">
          <p>Copie o código abaixo, cole no campo “Código” e clique em OK. O Anki baixa sozinho.</p>
          <CodeLine value={ANKI_CONNECT_CODE} copyLabel="Copiar código do AnkiConnect" big />
          <MockWindow title="Instalar complemento">
            <div className="grid gap-2 p-3">
              <span className="text-muted-foreground">Para navegar pelos complementos, visite o site.</span>
              <div className="flex items-center gap-2">
                <span>Código:</span>
                <span className="flex-1 rounded border bg-muted/40 px-2 py-0.5 font-mono">{ANKI_CONNECT_CODE}</span>
              </div>
              <div className="flex justify-end gap-2">
                <span className="rounded border px-2 py-0.5 text-muted-foreground">Cancelar</span>
                <Target>OK</Target>
              </div>
            </div>
          </MockWindow>
          <p className="text-xs">Se aparecer um aviso perguntando se quer instalar, clique em Sim.</p>
        </Step>

        <Step number={5} title="Feche e abra o Anki de novo">
          <p className="flex items-start gap-2">
            <RotateCcwIcon className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              O complemento só liga depois de reiniciar. Feche o Anki por completo (não é só minimizar) e abra de novo.
              Depois disso, <strong className="text-foreground">deixe o Anki aberto</strong> enquanto usa o Anki Studio.
            </span>
          </p>
        </Step>

        {mode === "direct" && (
          <Step number={6} title="Libere este site no AnkiConnect">
            <p>
              Como você está usando o site pela internet, o AnkiConnect precisa saber que pode confiar nele. No Anki:{" "}
              <Ui pt="Ferramentas › Complementos" en="Tools › Add-ons" />, selecione{" "}
              <strong className="text-foreground">AnkiConnect</strong>, clique em <Ui pt="Configurar" en="Config" /> e
              troque a linha <code className="font-mono text-foreground">webCorsOriginList</code> por esta:
            </p>
            <CodeLine value={corsLine} copyLabel="Copiar configuração de CORS" />
            <p className="text-xs">Salve, reinicie o Anki e, se o navegador pedir para acessar a rede local, aceite.</p>
          </Step>
        )}
      </ol>

      {liveCheck && <LiveCheck />}

      <details className="rounded-xl border p-4 text-sm">
        <summary className="flex cursor-pointer items-center gap-2 font-medium">
          <AlertTriangleIcon className="size-4 text-amber-500" /> Fiz tudo e não conecta
        </summary>
        <ul className="mt-3 grid list-disc gap-1.5 pl-5 text-muted-foreground">
          <li>O Anki está aberto? Ele precisa ficar aberto (pode estar em segundo plano).</li>
          <li>Reiniciou o Anki depois de instalar? Sem reiniciar, o complemento não liga.</li>
          <li>
            Em <Ui pt="Ferramentas › Complementos" en="Tools › Add-ons" /> deve aparecer <strong>AnkiConnect</strong> na
            lista, sem estar desativado. Se estiver com “(desativado)”, selecione e clique em “Ativar/Desativar”.
          </li>
          <li>Anki muito antigo? Atualize para a versão mais nova em apps.ankiweb.net.</li>
          <li>Antivírus ou firewall pode bloquear a porta 8765 do AnkiConnect: permita o Anki.</li>
          {isMac && <li>No Mac, não deixe o Anki minimizado por muito tempo: o macOS pode pausar o complemento.</li>}
          <li>Sem Anki no computador? Tudo bem: use o botão “Baixar .apkg” e importe no Anki (até no celular).</li>
        </ul>
      </details>
    </div>
  );
}
