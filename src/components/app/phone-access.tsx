"use client";

import { useQuery } from "@tanstack/react-query";
import { SmartphoneIcon, WifiIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppConfig } from "@/hooks/use-studio";
import { api } from "@/lib/client/api";
import { CopyButton } from "./copy-button";
import { QrImage } from "./qr-image";
import { RemoteAccess } from "./remote-access";

/**
 * Seção "Abrir no celular" das configurações: endereço do Wi-Fi com QR code,
 * dicas de firewall e o caminho para usar fora de casa com senha.
 */
export function PhoneAccess({ open }: { open: boolean }) {
  const { data: config } = useAppConfig();
  const [index, setIndex] = useState(0);
  const { data: addresses = [], isLoading } = useQuery({
    queryKey: ["network"],
    queryFn: api.network,
    enabled: open && Boolean(config?.lanAccess),
  });

  if (!config?.lanAccess) {
    return (
      <p className="text-muted-foreground text-sm">
        Este é o site público: é só abrir o mesmo endereço no navegador do celular.
      </p>
    );
  }

  const current = addresses[Math.min(index, addresses.length - 1)];

  return (
    <div className="grid gap-4">
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Procurando o endereço do PC na rede…</p>
      ) : current ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <QrImage url={current.url} />
          <div className="grid min-w-0 gap-2 text-sm">
            <p className="flex items-center gap-1.5 font-medium">
              <WifiIcon className="size-4 text-primary" /> No mesmo Wi-Fi do PC
            </p>
            <p className="text-muted-foreground">Aponte a câmera do celular para o QR ou digite:</p>
            <div className="flex items-center gap-1">
              <code className="truncate rounded bg-muted px-2 py-1 font-mono text-sm" data-testid="lan-url">
                {current.url}
              </code>
              <CopyButton value={current.url} label="Copiar endereço" />
            </div>
            {addresses.length > 1 && (
              <div className="flex flex-wrap gap-1">
                {addresses.map((address, position) => (
                  <Button
                    key={address.ip}
                    size="xs"
                    variant={position === index ? "secondary" : "ghost"}
                    onClick={() => setIndex(position)}
                    title={address.label}
                  >
                    {address.ip}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Não achei uma rede Wi-Fi/cabo ativa neste PC. Conecte-se a uma rede e reabra as configurações.
        </p>
      )}

      <details className="text-muted-foreground text-sm">
        <summary className="cursor-pointer font-medium text-foreground">Não abriu no celular?</summary>
        <ul className="mt-2 grid list-disc gap-1 pl-5">
          <li>Use http:// (não https://) e confira se o celular está no mesmo Wi-Fi.</li>
          <li>No Windows, deixe a rede como “Privada” (Configurações › Rede e Internet › Wi-Fi).</li>
          <li>Na primeira vez, permita o Node.js no aviso do Firewall do Windows.</li>
          <li>
            Para instalar como app e usar o “Compartilhar”, o navegador exige https: ligue o acesso fora de casa abaixo.
          </li>
        </ul>
      </details>

      <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
        <p className="flex items-center gap-1.5 font-medium">
          <SmartphoneIcon className="size-4 text-primary" /> Fora de casa (4G ou outra rede)
        </p>
        <RemoteAccess open={open} />
      </div>
    </div>
  );
}
