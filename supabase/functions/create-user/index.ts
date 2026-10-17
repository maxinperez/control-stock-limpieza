// Edge Function: el administrador crea usuarios (email + contraseña + rol).
// Deploy:  supabase functions deploy create-user
/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = Deno.env.get("SUPABASE_URL")!;
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: u } = await caller.auth.getUser();
  if (!u?.user) return json({ error: "No autenticado" }, 401);
  const { data: me } = await admin.from("profiles").select("rol, activo").eq("id", u.user.id).single();
  if (!me || me.rol !== "admin" || !me.activo) return json({ error: "Solo el administrador" }, 403);

  const { email, password, nombre, rol } = await req.json();
  if (!email || !password || password.length < 6) return json({ error: "Email y contraseña (mín. 6) requeridos" }, 400);

  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) return json({ error: error.message }, 400);

  await admin.from("profiles")
    .update({ nombre: nombre || email.split("@")[0], rol: rol === "admin" ? "admin" : "contador" })
    .eq("id", data.user.id);
  return json({ ok: true, id: data.user.id });
});
