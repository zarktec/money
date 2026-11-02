import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Service role: SOLO en servidor (webhooks, cron, tareas de admin). Ignora RLS. */
export const createAdminClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
