import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Respuesta de descarga: nunca se cachea (son datos personales) y el nombre del archivo es seguro. */
export function download(body: BodyInit, filename: string, type: string) {
  const safe = filename.replace(/[^\w.\-]+/g, "_");
  return new NextResponse(body, { headers: { "content-type": type, "content-disposition": `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}

export async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}
export const unauthorized = () => NextResponse.json({ error: "No autenticado" }, { status: 401 });
export const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });
