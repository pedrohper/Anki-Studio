import { afterEach } from "vitest";
import { resetEnvCache } from "@/lib/server/env";
import { resetRateLimit } from "@/lib/server/rate-limit";

afterEach(() => {
  resetEnvCache();
  resetRateLimit();
});
