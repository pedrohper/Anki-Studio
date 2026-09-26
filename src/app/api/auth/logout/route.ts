import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/server/auth";

export function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
