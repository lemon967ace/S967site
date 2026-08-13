import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")!);
const SUPABASE_ADMIN_KEY = SUPABASE_SECRET_KEYS["default"];

const supabase = createClient(SUPABASE_URL, SUPABASE_ADMIN_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const encoder = new TextEncoder();

function bearerToken(req: Request): string | null {
  const match = req.headers.get("Authorization")?.match(/^Bearer ([A-Za-z0-9_-]+)$/);
  return match?.[1] || null;
}

async function sha256(value: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(value)),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

type AdminVerification =
  | { ok: true; tokenHash: string }
  | { ok: false; error: string; status: number };

async function verifyAdminSession(req: Request): Promise<AdminVerification> {
  const token = bearerToken(req);
  if (!token) return { ok: false, error: "UNAUTHORIZED", status: 401 };

  const tokenHash = await sha256(token);
  const { data, error } = await supabase.from("admin_sessions")
    .select("expires_at").eq("token_hash", tokenHash).maybeSingle();

  if (error) return { ok: false, error: "DATABASE_ERROR", status: 500 };
  if (!data) return { ok: false, error: "INVALID_SESSION", status: 401 };

  const expiresAt = new Date(data.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    await supabase.from("admin_sessions").delete().eq("token_hash", tokenHash);
    return { ok: false, error: "SESSION_EXPIRED", status: 401 };
  }

  return { ok: true, tokenHash };
}

const ALLOWED_ORIGINS = new Set([
  "https://s967.org",
  "https://www.s967.org",
]);

function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://s967.org",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

function jsonResponse(req: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors(req),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors(req) });
  }

  const origin = req.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return jsonResponse(req, { error: "Origin not allowed." }, 403);
  }

  const admin = await verifyAdminSession(req);
  if (!admin.ok) {
    return jsonResponse(req, { error: admin.error }, admin.status);
  }

  try {
    if (req.method === "GET") {
      const [uploadsResult, controlResult, blockedResult] = await Promise.all([
        supabase.from("upload_events")
          .select("id, reference_code, ip_hash, file_count, storage_paths, created_at")
          .order("created_at", { ascending: false }).limit(100),
        supabase.from("upload_control").select("paused_until").eq("id", 1).single(),
        supabase.from("blocked_upload_ips")
          .select("ip_hash, reason, blocked_at, blocked_until"),
      ]);

      if (uploadsResult.error) throw uploadsResult.error;
      if (controlResult.error) throw controlResult.error;
      if (blockedResult.error) throw blockedResult.error;

      return jsonResponse(req, {
        success: true,
        uploads: uploadsResult.data ?? [],
        control: controlResult.data,
        blocked: blockedResult.data ?? [],
      });
    }

    if (req.method !== "POST") {
      return jsonResponse(req, { error: "Method not allowed." }, 405);
    }

    const body = await req.json();
    const action = body?.action;

    if (action === "delete_image") {
      const uploadId = Number(body.uploadId);
      const storagePath = String(body.storagePath ?? "").trim();

      if (!Number.isInteger(uploadId) || uploadId <= 0) {
        return jsonResponse(req, { error: "Invalid uploadId." }, 400);
      }
      if (!storagePath) {
        return jsonResponse(req, { error: "Missing storagePath." }, 400);
      }

      const { data: uploadEvent, error: uploadError } = await supabase
        .from("upload_events").select("id, storage_paths").eq("id", uploadId).maybeSingle();
      if (uploadError) throw uploadError;
      if (!uploadEvent) {
        return jsonResponse(req, { error: "Upload event not found." }, 404);
      }

      const currentPaths = Array.isArray(uploadEvent.storage_paths) ? uploadEvent.storage_paths : [];
      if (!currentPaths.includes(storagePath)) {
        return jsonResponse(req, { error: "Image does not belong to this upload." }, 403);
      }

      const { error: storageError } = await supabase.storage
        .from("inquiry-uploads").remove([storagePath]);
      if (storageError) throw storageError;

      const remainingPaths = currentPaths.filter((path) => path !== storagePath);
      if (remainingPaths.length === 0) {
        const { error: deleteEventError } = await supabase
          .from("upload_events").delete().eq("id", uploadId);
        if (deleteEventError) throw deleteEventError;
      } else {
        const { error: updateEventError } = await supabase.from("upload_events")
          .update({ storage_paths: remainingPaths, file_count: remainingPaths.length })
          .eq("id", uploadId);
        if (updateEventError) throw updateEventError;
      }
      return jsonResponse(req, { success: true });
    }

    if (action === "block_ip_7d") {
      const ipHash = String(body.ipHash ?? "");
      if (!ipHash) return jsonResponse(req, { error: "Missing ipHash." }, 400);
      const blockedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase.from("blocked_upload_ips").upsert({
        ip_hash: ipHash,
        reason: "Admin block",
        blocked_at: new Date().toISOString(),
        blocked_until: blockedUntil,
      }, { onConflict: "ip_hash" });
      if (error) throw error;
      return jsonResponse(req, { success: true });
    }

    if (action === "block_ip_forever") {
      const ipHash = String(body.ipHash ?? "");
      if (!ipHash) return jsonResponse(req, { error: "Missing ipHash." }, 400);
      const { error } = await supabase.from("blocked_upload_ips").upsert({
        ip_hash: ipHash,
        reason: "Admin block",
        blocked_at: new Date().toISOString(),
        blocked_until: null,
      }, { onConflict: "ip_hash" });
      if (error) throw error;
      return jsonResponse(req, { success: true });
    }

    if (action === "unblock_ip") {
      const ipHash = String(body.ipHash ?? "");
      if (!ipHash) return jsonResponse(req, { error: "Missing ipHash." }, 400);
      const { error } = await supabase.from("blocked_upload_ips").delete().eq("ip_hash", ipHash);
      if (error) throw error;
      return jsonResponse(req, { success: true });
    }

    if (action === "pause_uploads") {
      const hours = Number(body.hours);
      if (!Number.isFinite(hours) || hours <= 0 || hours > 168) {
        return jsonResponse(req, { error: "Invalid pause duration." }, 400);
      }
      const pausedUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
      const { error } = await supabase.from("upload_control").update({
        paused_until: pausedUntil,
        updated_at: new Date().toISOString(),
      }).eq("id", 1);
      if (error) throw error;
      return jsonResponse(req, { success: true, pausedUntil });
    }

    if (action === "resume_uploads") {
      const { error } = await supabase.from("upload_control").update({
        paused_until: null,
        updated_at: new Date().toISOString(),
      }).eq("id", 1);
      if (error) throw error;
      return jsonResponse(req, { success: true });
    }

    return jsonResponse(req, { error: "Unknown action." }, 400);
  } catch (error) {
    console.error(error);
    return jsonResponse(req, { error: "Admin request failed." }, 500);
  }
});
