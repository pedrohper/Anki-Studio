"use client";

import { Loader2Icon, LockIcon } from "lucide-react";
import { useId, useState } from "react";
import { Logo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/client/api";

/** Só aceita voltar para um caminho do próprio site. */
function returnPath(): string {
  const value = new URLSearchParams(window.location.search).get("voltar");
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}

/** Tela do PIN: aparece quando você criou um PIN nas Configurações. */
export function LoginForm() {
  const id = useId();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await api.login(pin);
      window.location.replace(returnPath());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não deu para entrar.");
      setPin("");
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid w-full max-w-sm gap-5 rounded-2xl border bg-card p-6 shadow-sm">
      <Logo />
      <div className="grid gap-1">
        <h1 className="flex items-center gap-2 font-semibold text-lg">
          <LockIcon className="size-4 text-primary" /> Digite o seu PIN
        </h1>
        <p className="text-muted-foreground text-sm">O mesmo PIN que você criou nas Configurações do Anki Studio.</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-pin`}>PIN</Label>
        <Input
          id={`${id}-pin`}
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={12}
          autoComplete="current-password"
          className="text-center text-lg tracking-[0.5em]"
          autoFocus
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
          aria-invalid={Boolean(error)}
        />
        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
      </div>
      <Button type="submit" disabled={pending || pin.length < 4}>
        {pending && <Loader2Icon className="animate-spin" />} Entrar
      </Button>
      <p className="text-muted-foreground text-xs">Este aparelho fica conectado por 90 dias.</p>
    </form>
  );
}
