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

/** Tela de senha: aparece quando o app está protegido (APP_PASSWORD no .env). */
export function LoginForm() {
  const id = useId();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await api.login(password);
      window.location.replace(returnPath());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não deu para entrar.");
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid w-full max-w-sm gap-5 rounded-2xl border bg-card p-6 shadow-sm">
      <Logo />
      <div className="grid gap-1">
        <h1 className="flex items-center gap-2 font-semibold text-lg">
          <LockIcon className="size-4 text-primary" /> Este Anki Studio é protegido
        </h1>
        <p className="text-muted-foreground text-sm">Digite a senha definida em APP_PASSWORD no PC.</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-password`}>Senha</Label>
        <Input
          id={`${id}-password`}
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={Boolean(error)}
        />
        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
      </div>
      <Button type="submit" disabled={pending || !password}>
        {pending && <Loader2Icon className="animate-spin" />} Entrar
      </Button>
      <p className="text-muted-foreground text-xs">Você continua conectado neste aparelho por 30 dias.</p>
    </form>
  );
}
