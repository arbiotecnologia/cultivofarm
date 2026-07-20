import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user_ids, title, body, url, tag } = await req.json();
    
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Buscar assinaturas
    const { data: subs, error: subError } = await supabaseAdmin
      .from("push_subscriptions")
      .select("*")
      .in("user_id", user_ids);

    if (subError) throw subError;

    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:contato@ar-bio.com";

    if (!vapidPublic || !vapidPrivate) {
      throw new Error("VAPID keys not configured");
    }

    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    const payload = JSON.stringify({
      title,
      body,
      url: url || "/app",
      tag: tag || "default"
    });

    const results = await Promise.all(
      subs.map(async (sub) => {
        try {
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth
            }
          };
          await webpush.sendNotification(pushSubscription, payload);
          
          await supabaseAdmin
            .from("push_subscriptions")
            .update({ last_used_at: new Date().toISOString() })
            .eq("id", sub.id);
            
          return { id: sub.id, success: true };
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            // Assinatura expirada ou inválida
            await supabaseAdmin.from("push_subscriptions").delete().eq("id", sub.id);
          }
          return { id: sub.id, success: false, error: err.message };
        }
      })
    );

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
