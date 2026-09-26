import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodType, z } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "error",
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: { message: error.message, code: error.code } }, { status: error.status });
  }
  if (error instanceof ZodError) {
    const first = error.issues[0];
    const message = first?.message ?? "Dados inválidos.";
    return NextResponse.json(
      { error: { message, code: "invalid_request", issues: z.treeifyError(error) } },
      { status: 400 },
    );
  }
  console.error("[api] erro inesperado:", error instanceof Error ? error.message : error);
  return NextResponse.json(
    { error: { message: "Erro inesperado no servidor. Tente de novo.", code: "internal" } },
    { status: 500 },
  );
}

/** Lê e valida o corpo JSON da requisição com um schema Zod. */
export async function readJson<T extends ZodType>(request: Request, schema: T): Promise<z.output<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "O corpo da requisição precisa ser um JSON válido.", "invalid_json");
  }
  return schema.parse(body);
}
