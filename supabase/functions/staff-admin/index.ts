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

const STAFF_AUTH_DOMAIN = "s967.org";

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

function validPassword(password: string): boolean {
  return password.length >= 6 && password.length <= 128;
}

function validStaffId(value: string): boolean {
  return value.length >= 1 && value.length <= 50 && /^[A-Za-z0-9._-]+$/.test(value);
}

function makeInternalEmail(staffId: string): string {
  return staffId.trim().toLowerCase() + "@" + STAFF_AUTH_DOMAIN;
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
      const { data: staffRows, error: staffError } = await supabase
        .from("staff_accounts")
        .select("user_id, display_name, role, is_active, created_at, updated_at")
        .eq("role", "staff")
        .order("created_at", { ascending: true });

      if (staffError) throw staffError;
      const accounts = (staffRows ?? []).map((row) => ({
        ...row,
        staff_id: row.display_name,
      }));
      return jsonResponse(req, { success: true, accounts });
    }

    if (req.method !== "POST") {
      return jsonResponse(req, { error: "Method not allowed." }, 405);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");

    if (action === "create_staff") {
      const staffId = String(body.staffId ?? "").trim();
      const password = String(body.password ?? "");

      if (!validStaffId(staffId)) {
        return jsonResponse(req, { error: "Invalid Staff ID." }, 400);
      }
      if (!validPassword(password)) {
        return jsonResponse(req, { error: "Password must be between 6 and 128 characters." }, 400);
      }

      const normalizedStaffId = staffId.toLowerCase();
      const internalEmail = makeInternalEmail(staffId);
      const { data: existingStaff, error: existingStaffError } = await supabase
        .from("staff_accounts").select("user_id")
        .ilike("display_name", normalizedStaffId)
        .eq("role", "staff").limit(1).maybeSingle();
      if (existingStaffError) throw existingStaffError;
      if (existingStaff) {
        return jsonResponse(req, { error: "Staff ID already exists." }, 409);
      }

      const { data: createResult, error: createError } = await supabase.auth.admin.createUser({
        email: internalEmail,
        password,
        email_confirm: true,
        app_metadata: { role: "staff", staff_id: staffId },
      });

      if (createError || !createResult.user) {
        if (createError?.message?.toLowerCase().includes("already")) {
          return jsonResponse(req, { error: "Staff ID already exists." }, 409);
        }
        throw createError ?? new Error("Could not create Auth user.");
      }

      const userId = createResult.user.id;
      const { error: insertError } = await supabase.from("staff_accounts").insert({
        user_id: userId,
        display_name: staffId,
        role: "staff",
        is_active: true,
      });

      if (insertError) {
        try {
          await supabase.auth.admin.deleteUser(userId);
        } catch {}
        throw insertError;
      }

      return jsonResponse(req, { success: true, userId, staffId });
    }

    const userId = String(body.userId ?? "").trim();
    if (!userId) return jsonResponse(req, { error: "Missing userId." }, 400);

    const { data: staffAccount, error: accountError } = await supabase
      .from("staff_accounts")
      .select("user_id, display_name, role, is_active")
      .eq("user_id", userId)
      .eq("role", "staff")
      .maybeSingle();
    if (accountError) throw accountError;
    if (!staffAccount) {
      return jsonResponse(req, { error: "Staff account not found." }, 404);
    }

    if (action === "disable_staff") {
      const { error: authError } = await supabase.auth.admin.updateUserById(userId, {
        ban_duration: "876000h",
      });
      if (authError) throw authError;
      const { error: dbError } = await supabase.from("staff_accounts").update({
        is_active: false,
        updated_at: new Date().toISOString(),
      }).eq("user_id", userId);
      if (dbError) throw dbError;
      return jsonResponse(req, { success: true });
    }

    if (action === "enable_staff") {
      const { error: authError } = await supabase.auth.admin.updateUserById(userId, {
        ban_duration: "none",
      });
      if (authError) throw authError;
      const { error: dbError } = await supabase.from("staff_accounts").update({
        is_active: true,
        updated_at: new Date().toISOString(),
      }).eq("user_id", userId);
      if (dbError) throw dbError;
      return jsonResponse(req, { success: true });
    }

    if (action === "reset_password") {
      const newPassword = String(body.password ?? "");
      if (!validPassword(newPassword)) {
        return jsonResponse(req, { error: "Password must be between 6 and 128 characters." }, 400);
      }
      const { error: passwordError } = await supabase.auth.admin.updateUserById(userId, {
        password: newPassword,
      });
      if (passwordError) throw passwordError;
      const { error: revokeError } = await supabase.rpc("revoke_all_sessions_for_user", {
        target_user_id: userId,
      });
      if (revokeError) throw revokeError;
      return jsonResponse(req, { success: true });
    }

    if (action === "delete_staff") {
      const { error } = await supabase.auth.admin.deleteUser(userId);
      if (error) throw error;
      return jsonResponse(req, { success: true });
    }

    return jsonResponse(req, { error: "Unknown action." }, 400);
  } catch (error) {
    console.error("staff-admin error:", error);
    return jsonResponse(req, { error: "Staff administration request failed." }, 500);
  }
});
