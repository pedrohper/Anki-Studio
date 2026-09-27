"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GlobeIcon, KeyRoundIcon, Loader2Icon, LogOutIcon, PowerIcon, ShieldCheckIcon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/client/api";
import type { AccessStatus, TunnelProvider } from "@/lib/schemas/api";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";
import { QrImage } from "./qr-image";

const PIN_OK = /^\d{4,12}$/;

/** Campo de PIN: só números, teclado numérico no celular. */
function PinInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={12}
        autoComplete="new-password"
        className="max-w-48 tracking-[0.4em]"
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, ""))}
      />
    </div>
  );
}

/**
 * "Fora de casa": crie um PIN e ligue um link https (Cloudflare) direto pelo
 * site, sem mexer em arquivo nem terminal. Quem abrir o link precisa do PIN.
 */
export function RemoteAccess({ open }: { open: boolean }) {
  const queryClient = useQueryClient();
  const { data: access, isLoading } = useQuery({
    queryKey: ["access"],
    queryFn: api.access,
    enabled: open,
    // Enquanto liga, pergunta ao servidor a cada 1,5 s até o link aparecer.
    refetchInterval: (query) =>
      ["installing", "starting", "reconnecting"].includes(query.state.data?.tunnel.status ?? "") ? 1_500 : false,
  });
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["access"] });
    void queryClient.invalidateQueries({ queryKey: ["config"] });
  };

  const createPin = useMutation({
    mutationFn: () => {
      if (!PIN_OK.test(pin)) throw new Error("O PIN precisa ter de 4 a 12 números.");
      if (pin !== confirm) throw new Error("Os dois PINs não são iguais.");
      return api.savePin(pin);
    },
    onSuccess: () => {
      setPin("");
      setConfirm("");
      toast.success("PIN criado", { description: "Este aparelho já está conectado. Os outros vão pedir o PIN." });
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const changePin = useMutation({
    mutationFn: () => {
      if (!PIN_OK.test(newPin)) throw new Error("O novo PIN precisa ter de 4 a 12 números.");
      return api.savePin(newPin, currentPin);
    },
    onSuccess: () => {
      setCurrentPin("");
      setNewPin("");
      toast.success("PIN trocado", { description: "Os outros aparelhos vão pedir o PIN novo." });
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const removePin = useMutation({
    mutationFn: () => api.removePin(currentPin),
    onSuccess: () => {
      setCurrentPin("");
      toast.success("PIN removido", { description: "O acesso fora de casa foi desligado." });
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const tunnel = useMutation({
    mutationFn: (on: boolean) => api.setTunnel(on),
    onSuccess: refresh,
    onError: (error) => toast.error(error.message),
  });

  if (isLoading) return <p className="text-muted-foreground text-sm">Carregando…</p>;
  if (!access?.manageable) return null;

  if (!access.pinSet) {
    return (
      <div className="grid gap-3">
        <p className="text-muted-foreground text-sm">
          Primeiro crie um PIN. Quem abrir o link de fora de casa vai precisar dele, então ninguém gasta as suas chaves
          de IA. Cada aparelho digita o PIN uma vez.
        </p>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            createPin.mutate();
          }}
        >
          <PinInput label="Novo PIN (4 a 12 números)" value={pin} onChange={setPin} />
          <PinInput label="Repita o PIN" value={confirm} onChange={setConfirm} />
          <Button type="submit" disabled={createPin.isPending || pin.length < 4} data-testid="create-pin">
            {createPin.isPending ? <Loader2Icon className="animate-spin" /> : <KeyRoundIcon />} Criar PIN
          </Button>
        </form>
      </div>
    );
  }

  const { status, url, error } = access.tunnel;
  const busy = status === "installing" || status === "starting" || status === "reconnecting" || tunnel.isPending;

  return (
    <div className="grid gap-4">
      <p className="flex items-center gap-1.5 text-muted-foreground text-sm">
        <ShieldCheckIcon className="size-4 text-emerald-600" /> Protegido por PIN.
      </p>

      {status === "on" && url ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <QrImage url={url} />
          <div className="grid min-w-0 gap-2 text-sm">
            <p className="flex items-center gap-1.5 font-medium">
              <GlobeIcon className="size-4 text-primary" /> Ligado: abra de qualquer lugar
            </p>
            <div className="flex items-center gap-1">
              <code className="truncate rounded bg-muted px-2 py-1 font-mono text-xs" data-testid="tunnel-url">
                {url}
              </code>
              <CopyButton value={url} label="Copiar link" />
            </div>
            <p className="text-muted-foreground text-xs">
              {access.tunnel.provider === "ngrok"
                ? "Link fixo: instale como app no celular e ele sempre abre."
                : "Este link muda toda vez que liga. Para um link fixo, use o ngrok abaixo."}{" "}
              Se cair, religa sozinho; se você fechar o app, volta ligado ao abrir.
            </p>
            <div>
              <Button size="sm" variant="outline" onClick={() => tunnel.mutate(false)} disabled={tunnel.isPending}>
                <PowerIcon /> Desligar
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-2">
          {status === "installing" && (
            <p className="text-muted-foreground text-sm">
              Baixando o conector da Cloudflare (só na primeira vez, uns 60 MB)…
            </p>
          )}
          {status === "starting" && <p className="text-muted-foreground text-sm">Criando o link seguro…</p>}
          {status === "reconnecting" && (
            <p className="text-amber-600 text-sm dark:text-amber-400">
              {error ?? "Reconectando…"} Tentando de novo sozinho.
            </p>
          )}
          {status === "error" && error && <p className="text-destructive text-sm">{error}</p>}
          <div>
            <Button onClick={() => tunnel.mutate(true)} disabled={busy} data-testid="tunnel-on">
              {busy ? <Loader2Icon className="animate-spin" /> : <PowerIcon />}
              {status === "reconnecting"
                ? "Religando…"
                : busy
                  ? "Ligando…"
                  : status === "error"
                    ? "Tentar de novo"
                    : "Ligar acesso fora de casa"}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Gera um link https enquanto o Anki Studio estiver aberto no PC. Deixe o PC sem hibernar.
          </p>
        </div>
      )}

      <TunnelProviderForm access={access} onSaved={refresh} />

      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Trocar ou remover o PIN</summary>
        <div className="mt-3 grid gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <PinInput label="PIN atual" value={currentPin} onChange={setCurrentPin} />
            <PinInput label="Novo PIN" value={newPin} onChange={setNewPin} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => changePin.mutate()}
              disabled={changePin.isPending || currentPin.length < 4 || newPin.length < 4}
            >
              Trocar PIN
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => removePin.mutate()}
              disabled={removePin.isPending || currentPin.length < 4}
            >
              Remover PIN
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                api
                  .logout()
                  .then(() => window.location.assign("/entrar"))
                  .catch((caught: Error) => toast.error(caught.message))
              }
            >
              <LogOutIcon /> Sair neste aparelho
            </Button>
          </div>
        </div>
      </details>
    </div>
  );
}

const NGROK_TOKEN_URL = "https://dashboard.ngrok.com/get-started/your-authtoken";

/** Tipo de link: Cloudflare (sem conta, muda) ou ngrok (conta grátis, fixo). */
function TunnelProviderForm({ access, onSaved }: { access: AccessStatus; onSaved: () => void }) {
  const tokenId = useId();
  const domainId = useId();
  const [provider, setProvider] = useState<TunnelProvider>(access.config.provider);
  const [token, setToken] = useState("");
  const [domain, setDomain] = useState(access.config.ngrokDomain);
  const save = useMutation({
    mutationFn: () =>
      api.setTunnelConfig({
        provider,
        ...(provider === "ngrok" ? { ngrokToken: token || undefined, ngrokDomain: domain } : {}),
      }),
    onSuccess: () => {
      setToken("");
      toast.success(provider === "ngrok" ? "Link fixo do ngrok salvo" : "Usando o link da Cloudflare");
      onSaved();
    },
    onError: (error) => toast.error(error.message),
  });
  const needsToken = provider === "ngrok" && !access.config.hasNgrokToken && !token;
  const changed =
    provider !== access.config.provider ||
    Boolean(token) ||
    (provider === "ngrok" && domain !== access.config.ngrokDomain);

  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium">Tipo de link</summary>
      <div className="mt-3 grid gap-3">
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="sr-only">Tipo de link</legend>
          {(
            [
              ["cloudflare", "Muda a cada vez", "Cloudflare. Sem conta, liga na hora."],
              ["ngrok", "Link fixo", "ngrok. Conta grátis; o app instalado no celular nunca quebra."],
            ] as const
          ).map(([value, title, hint]) => (
            <button
              key={value}
              type="button"
              aria-pressed={provider === value}
              onClick={() => setProvider(value)}
              className={cn(
                "grid gap-0.5 rounded-lg border p-3 text-left transition-colors",
                provider === value ? "border-primary bg-primary/5" : "hover:bg-muted",
              )}
            >
              <span className="font-medium">{title}</span>
              <span className="text-muted-foreground text-xs">{hint}</span>
            </button>
          ))}
        </fieldset>
        {provider === "ngrok" && (
          <div className="grid gap-3">
            <ol className="list-decimal pl-5 text-muted-foreground text-xs">
              <li>
                Crie uma conta grátis e copie o seu token em{" "}
                <a href={NGROK_TOKEN_URL} target="_blank" rel="noreferrer" className="text-primary underline">
                  dashboard.ngrok.com
                </a>
                .
              </li>
              <li>Cole abaixo. O token fica só no seu PC, nunca volta para o navegador.</li>
            </ol>
            <div className="grid gap-1.5">
              <Label htmlFor={tokenId}>Token do ngrok</Label>
              <Input
                id={tokenId}
                type="password"
                autoComplete="off"
                placeholder={access.config.hasNgrokToken ? "Token salvo (cole outro para trocar)" : "Cole o token aqui"}
                value={token}
                onChange={(event) => setToken(event.target.value.trim())}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={domainId}>Domínio (opcional)</Label>
              <Input
                id={domainId}
                placeholder="Vazio = o domínio grátis da sua conta"
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
              />
              <span className="text-muted-foreground text-xs">
                A conta grátis já tem um domínio fixo. Na primeira visita pelo navegador o ngrok mostra um aviso: é só
                tocar em "Visit Site".
              </span>
            </div>
          </div>
        )}
        <div>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || needsToken || !changed}>
            {save.isPending && <Loader2Icon className="animate-spin" />} Salvar tipo de link
          </Button>
        </div>
      </div>
    </details>
  );
}
