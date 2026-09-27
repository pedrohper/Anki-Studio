"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GlobeIcon, KeyRoundIcon, Loader2Icon, LogOutIcon, PowerIcon, ShieldCheckIcon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/client/api";
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
      ["installing", "starting"].includes(query.state.data?.tunnel.status ?? "") ? 1_500 : false,
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
  const busy = status === "installing" || status === "starting" || tunnel.isPending;

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
              O link muda toda vez que você liga. Por ele (https) dá para instalar como app e usar o Compartilhar.
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
          {status === "error" && error && <p className="text-destructive text-sm">{error}</p>}
          <div>
            <Button onClick={() => tunnel.mutate(true)} disabled={busy} data-testid="tunnel-on">
              {busy ? <Loader2Icon className="animate-spin" /> : <PowerIcon />}
              {busy ? "Ligando…" : status === "error" ? "Tentar de novo" : "Ligar acesso fora de casa"}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Gera um link https (Cloudflare, grátis e sem conta) enquanto o Anki Studio estiver aberto no PC.
          </p>
        </div>
      )}

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
