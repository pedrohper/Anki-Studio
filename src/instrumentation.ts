/**
 * Roda uma vez quando o servidor do Next liga. Se o acesso fora de casa estava
 * ligado quando você fechou o app, ele volta sozinho (com o mesmo link, no ngrok),
 * e começa a checagem do lembrete diário.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.VERCEL) return;
  const [{ pinIsSet }, { resumeTunnelIfEnabled }, { startReminderScheduler }] = await Promise.all([
    import("./lib/server/access-store"),
    import("./lib/server/tunnel"),
    import("./lib/server/reminder"),
  ]);
  resumeTunnelIfEnabled(process.env.PORT ?? "3000", pinIsSet());
  // Lembrete diário no celular: confere o horário a cada minuto.
  startReminderScheduler();
}
