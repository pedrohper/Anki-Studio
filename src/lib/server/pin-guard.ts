import { ApiError } from "./errors";
import { checkRateLimit, clientIp } from "./rate-limit";

/**
 * Proteção contra quem tenta adivinhar o PIN pelo link público.
 * Um PIN de 4 números tem só 10 mil combinações, então além do limite por IP
 * há um bloqueio geral: 10 erros seguidos travam o login por 15 min, e cada
 * novo bloqueio dobra o tempo. Acertar o PIN zera tudo.
 */
const MAX_FAILURES = 10;
const BASE_LOCK_MS = 15 * 60_000;

type GuardState = { failures: number; lockedUntil: number; locks: number };

// globalThis: as rotas do Next podem carregar este módulo mais de uma vez.
const store = globalThis as typeof globalThis & { __ankiPinGuard?: GuardState };
const state = () => {
  store.__ankiPinGuard ??= { failures: 0, lockedUntil: 0, locks: 0 };
  return store.__ankiPinGuard;
};

export function assertPinAttemptAllowed(request: Request, now = Date.now()) {
  const current = state();
  if (current.lockedUntil > now) {
    const minutes = Math.ceil((current.lockedUntil - now) / 60_000);
    throw new ApiError(429, `Muitas tentativas erradas. Tente de novo em ${minutes} min.`, "pin_locked");
  }
  checkRateLimit(`pin:${clientIp(request)}`, 5);
}

export function registerPinFailure(now = Date.now()) {
  const current = state();
  current.failures += 1;
  if (current.failures >= MAX_FAILURES) {
    current.lockedUntil = now + BASE_LOCK_MS * 2 ** current.locks;
    current.locks += 1;
    current.failures = 0;
  }
}

export function registerPinSuccess() {
  store.__ankiPinGuard = { failures: 0, lockedUntil: 0, locks: 0 };
}

export function resetPinGuard() {
  store.__ankiPinGuard = undefined;
}
