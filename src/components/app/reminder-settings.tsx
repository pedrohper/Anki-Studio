"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellIcon, BellOffIcon, Loader2Icon, SendIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/client/api";

/** Converte a chave VAPID (base64url) no formato que o navegador pede. */
function keyToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function pushSupported() {
  return (
    typeof window !== "undefined" && window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window
  );
}

/** Nome curto do aparelho para aparecer na lista ("Android · Chrome"). */
function deviceLabel() {
  const ua = navigator.userAgent;
  const system = /Android/i.test(ua)
    ? "Android"
    : /iPhone|iPad/i.test(ua)
      ? "iPhone"
      : /Windows/i.test(ua)
        ? "Windows"
        : "Outro";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : "Safari";
  return `${system} · ${browser}`;
}

/**
 * Lembrete diário: o PC manda uma notificação no horário escolhido com os cards
 * do dia e a sequência. Cada aparelho ativa o seu.
 */
export function ReminderSettings({ open }: { open: boolean }) {
  const timeId = useId();
  const queryClient = useQueryClient();
  const { data: reminder, isLoading } = useQuery({ queryKey: ["reminder"], queryFn: api.reminder, enabled: open });
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    if (!open || !pushSupported()) return;
    setSupported(true);
    void navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setEndpoint(subscription?.endpoint ?? null));
  }, [open]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["reminder"] });
  const subscribedHere = Boolean(endpoint && reminder?.endpoints.includes(endpoint));

  const toggleDevice = useMutation({
    mutationFn: async (on: boolean) => {
      const registration = await navigator.serviceWorker.ready;
      if (!on) {
        const current = await registration.pushManager.getSubscription();
        if (current) {
          await api.removeReminderDevice(current.endpoint);
          await current.unsubscribe();
        }
        setEndpoint(null);
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted")
        throw new Error("Permita as notificações para este site nas configurações do navegador.");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyToBytes(reminder?.publicKey ?? ""),
      });
      await api.addReminderDevice(subscription.toJSON(), deviceLabel());
      setEndpoint(subscription.endpoint);
    },
    onSuccess: (_, on) => {
      toast.success(on ? "Lembrete ativado neste aparelho" : "Lembrete desativado neste aparelho");
      void refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const saveSettings = useMutation({
    mutationFn: api.saveReminder,
    onSuccess: () => void refresh(),
    onError: (error) => toast.error(error.message),
  });

  const test = useMutation({
    mutationFn: api.testReminder,
    onSuccess: () => toast.success("Lembrete de teste enviado"),
    onError: (error) => toast.error(error.message),
  });

  if (isLoading) return <p className="text-muted-foreground text-sm">Carregando…</p>;
  if (!reminder) return null;

  return (
    <div className="grid gap-3 text-sm">
      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor={timeId}>Horário</Label>
          <Input
            id={timeId}
            type="time"
            className="w-32"
            defaultValue={reminder.time}
            onBlur={(event) => {
              if (event.target.value && event.target.value !== reminder.time) {
                saveSettings.mutate({ time: event.target.value });
              }
            }}
          />
        </div>
        <Label className="flex items-center gap-2 pb-2 font-normal">
          <Switch checked={reminder.enabled} onCheckedChange={(checked) => saveSettings.mutate({ enabled: checked })} />
          Lembrete ligado
        </Label>
      </div>

      {supported ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={subscribedHere ? "outline" : "default"}
            onClick={() => toggleDevice.mutate(!subscribedHere)}
            disabled={toggleDevice.isPending}
            data-testid="reminder-device"
          >
            {toggleDevice.isPending ? (
              <Loader2Icon className="animate-spin" />
            ) : subscribedHere ? (
              <BellOffIcon />
            ) : (
              <BellIcon />
            )}
            {subscribedHere ? "Parar neste aparelho" : "Receber neste aparelho"}
          </Button>
          {reminder.endpoints.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => test.mutate()} disabled={test.isPending}>
              <SendIcon /> Mandar um teste
            </Button>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground">
          Para receber no celular, abra o Anki Studio pelo link de fora de casa (https): o navegador só permite
          notificações em sites seguros.
        </p>
      )}
      <p className="text-muted-foreground text-xs">
        {reminder.endpoints.length === 0
          ? "Nenhum aparelho recebe ainda."
          : `${reminder.endpoints.length} ${reminder.endpoints.length === 1 ? "aparelho recebe" : "aparelhos recebem"}.`}{" "}
        O PC precisa estar ligado com o Anki Studio aberto. Se você já zerou o dia, o lembrete não é enviado.
      </p>
    </div>
  );
}
