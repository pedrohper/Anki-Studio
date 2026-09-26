"use client";

import { useEffect } from "react";

/**
 * Registra o service worker (necessário para o "Compartilhar" do celular).
 * O navegador só permite isso em https ou localhost; no Wi-Fi (http) o app
 * funciona normal, só sem instalar/compartilhar.
 */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Sem service worker o app continua funcionando; só o compartilhamento de arquivos fica indisponível.
    });
  }, []);
  return null;
}
