"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { onUsageRecorded } from "@/lib/client/api";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // Ao voltar para o app, busca de novo: com os dados no PC, outro aparelho pode ter mudado algo.
          queries: { staleTime: 5_000, refetchOnWindowFocus: true },
          mutations: { retry: false },
        },
      }),
  );

  // Gasto novo com IA? Atualiza o painel de custos.
  useEffect(() => onUsageRecorded(() => void queryClient.invalidateQueries({ queryKey: ["usage"] })), [queryClient]);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          {children}
          <Toaster richColors position="bottom-right" />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
