import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://s967.org",
  "https://www.s967.org",
]);

function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin":
      ALLOWED_ORIGINS.has(origin) ? origin : "https://s967.org",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(
  req: Request,
  data: unknown,
  status = 200,
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...cors(req),
        "Content-Type": "application/json",
      },
    },
  );
}

const supabaseUrl =
  Deno.env.get("SUPABASE_URL") ?? "";

const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase =
  createClient(
    supabaseUrl,
    serviceRoleKey,
  );

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


/*
  WK 회차 계산
  wk-submit과 동일한 기준을 사용한다.
*/
const FIRST_OPEN_KST =
  "2026-08-15T09:00:00+09:00";

const CYCLE_DAYS =
  14;

const DAY_MS =
  24 * 60 * 60 * 1000;

const cycleMs =
  CYCLE_DAYS * DAY_MS;

function getCurrentCycleNumber() {
  const now =
    Date.now();

  const firstOpen =
    new Date(
      FIRST_OPEN_KST,
    ).getTime();

  if (now < firstOpen) {
    return 1;
  }

  const elapsed =
    now - firstOpen;

  return (
    Math.floor(
      elapsed / cycleMs,
    ) + 1
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(
      "ok",
      {
        headers: cors(req),
      },
    );
  }

  const origin = req.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return json(req, { error: "Origin not allowed." }, 403);
  }

  const admin = await verifyAdminSession(req);
  if (!admin.ok) {
    return json(req, { error: admin.error }, admin.status);
  }

  try {

   if (req.method === "GET") {
  const currentCycleNumber =
    getCurrentCycleNumber();

  const [
    tiersResult,
    alliancesResult,
    settingsResult,
    emailRecipientsResult,
    emailExportsResult,
    applicationsResult,
  ] = await Promise.all([
    supabase
      .from("wk_tiers")
      .select("*")
      .order(
        "display_order",
        {
          ascending: true,
        },
      ),

    supabase
      .from("wk_alliances")
      .select("*")
      .order(
        "display_order",
        {
          ascending: true,
        },
      ),

    supabase
      .from("wk_settings")
      .select(
        "id,application_mode,email_auto_send_enabled,updated_at",
      )
      .eq(
        "id",
        1,
      )
      .maybeSingle(),

    supabase
      .from("wk_email_recipients")
      .select("*")
      .order(
        "display_order",
        {
          ascending: true,
        },
      ),

    supabase
      .from("wk_email_exports")
      .select("*")
      .order(
        "sent_at",
        {
          ascending: false,
        },
      )
      .limit(20),

    supabase
      .from("wk_applications")
      .select(
        [
          "id",
          "created_at",
          "language",
          "cycle_number",
          "player_name",
          "tier_name_snapshot",
          "alliance_name_snapshot",
          "troop_type",
          "troop_size",
          "rally_size",
          "realtime_response",
          "captain_role",
          "participation_time",
          "status",
        ].join(","),
      )
      .eq(
        "cycle_number",
        currentCycleNumber,
      )
      .order(
        "created_at",
        {
          ascending: false,
        },
      )
      .limit(500),
  ]);

  if (tiersResult.error) {
    throw tiersResult.error;
  }

  if (alliancesResult.error) {
    throw alliancesResult.error;
  }

  if (settingsResult.error) {
    throw settingsResult.error;
  }

  if (emailRecipientsResult.error) {
    throw emailRecipientsResult.error;
  }

  if (emailExportsResult.error) {
    throw emailExportsResult.error;
  }

  if (applicationsResult.error) {
    throw applicationsResult.error;
  }

  return json(req,{
    tiers:
      tiersResult.data ?? [],

    alliances:
      alliancesResult.data ?? [],

    settings: {
      application_mode:
        settingsResult.data
          ?.application_mode ??
        "auto",

      email_auto_send_enabled:
        settingsResult.data
          ?.email_auto_send_enabled ??
        true,

      updated_at:
        settingsResult.data
          ?.updated_at ??
        null,
    },

    email_recipients:
      emailRecipientsResult.data ??
      [],

    email_exports:
      emailExportsResult.data ??
      [],

    applications:
      applicationsResult.data ??
      [],

    current_cycle_number:
      currentCycleNumber,
  });
}

    if (req.method !== "POST") {
      return json(req,
        {
          error:
            "Method not allowed.",
        },
        405,
      );
    }

    const body =
      await req.json();

    const action =
      body?.action;

    switch (action) {
      case "delete_tier": {
  const id =
    Number(body?.id);

  if (
    !Number.isInteger(id)
  ) {
    return json(req,
      {
        error:
          "Invalid tier ID.",
      },
      400,
    );
  }

  const {
    error,
  } =
    await supabase
      .from(
        "wk_tiers",
      )
      .delete()
      .eq(
        "id",
        id,
      );

  if (error) {
    throw error;
  }

  return json(req,{
    ok: true,
  });
}
case "delete_alliance": {
  const id =
    Number(body?.id);

  if (
    !Number.isInteger(id)
  ) {
    return json(req,
      {
        error:
          "Invalid alliance ID.",
      },
      400,
    );
  }

  const {
    error,
  } =
    await supabase
      .from(
        "wk_alliances",
      )
      .delete()
      .eq(
        "id",
        id,
      );

  if (error) {
    throw error;
  }

  return json(req,{
    ok: true,
  });
}


      case "add_tier": {
        const name =
          String(
            body?.name ?? "",
          ).trim();

        if (!name) {
          return json(req,
            {
              error:
                "Tier name is required.",
            },
            400,
          );
        }

        const {
          data: lastRows,
          error: orderError,
        } =
          await supabase
            .from("wk_tiers")
            .select(
              "display_order",
            )
            .order(
              "display_order",
              {
                ascending: false,
              },
            )
            .limit(1);

        if (orderError) {
          throw orderError;
        }

        const nextOrder =
          (
            lastRows?.[0]
              ?.display_order ??
            0
          ) + 1;

        const {
          error,
        } =
          await supabase
            .from("wk_tiers")
            .insert({
              name,
              display_order:
                nextOrder,
              active: true,
              admin_note: "",
            });

        if (error) {
          throw error;
        }

        return json(req,{
          ok: true,
        });
      }


      case "update_tier": {
        const id =
          Number(body?.id);

        const name =
          String(
            body?.name ?? "",
          ).trim();

        const adminNote =
          String(
            body?.admin_note ?? "",
          ).trim();

        if (
          !Number.isInteger(id) ||
          !name
        ) {
          return json(req,
            {
              error:
                "Invalid tier.",
            },
            400,
          );
        }

        const {
          error,
        } =
          await supabase
            .from("wk_tiers")
            .update({
              name,
              admin_note:
                adminNote,
              updated_at:
                new Date()
                  .toISOString(),
            })
            .eq("id", id);

        if (error) {
          throw error;
        }

        return json(req,{
          ok: true,
        });
      }

      case "toggle_tier": {
        const id =
          Number(body?.id);

        const active =
          body?.active === true;

        if (
          !Number.isInteger(id)
        ) {
          return json(req,
            {
              error:
                "Invalid tier ID.",
            },
            400,
          );
        }

        const {
          error,
        } =
          await supabase
            .from("wk_tiers")
            .update({
              active,
              updated_at:
                new Date()
                  .toISOString(),
            })
            .eq("id", id);

        if (error) {
          throw error;
        }

        return json(req,{
          ok: true,
        });
      }

      case "reorder_tiers": {
        const ids =
          body?.ids;

        if (
          !Array.isArray(ids)
        ) {
          return json(req,
            {
              error:
                "Invalid tier order.",
            },
            400,
          );
        }

        for (
          let i = 0;
          i < ids.length;
          i += 1
        ) {
          const id =
            Number(ids[i]);

          if (
            !Number.isInteger(id)
          ) {
            return json(req,
              {
                error:
                  "Invalid tier ID.",
              },
              400,
            );
          }

          const {
            error,
          } =
            await supabase
              .from("wk_tiers")
              .update({
                display_order:
                  i + 1,
                updated_at:
                  new Date()
                    .toISOString(),
              })
              .eq(
                "id",
                id,
              );

          if (error) {
            throw error;
          }
        }

        return json(req,{
          ok: true,
        });
      }

      case "add_alliance": {
        const name =
          String(
            body?.name ?? "",
          ).trim();

        if (!name) {
          return json(req,
            {
              error:
                "Alliance name is required.",
            },
            400,
          );
        }

        const {
          data: lastRows,
          error: orderError,
        } =
          await supabase
            .from("wk_alliances")
            .select(
              "display_order",
            )
            .order(
              "display_order",
              {
                ascending: false,
              },
            )
            .limit(1);

        if (orderError) {
          throw orderError;
        }

        const nextOrder =
          (
            lastRows?.[0]
              ?.display_order ??
            0
          ) + 1;

        const {
          error,
        } =
          await supabase
            .from(
              "wk_alliances",
            )
            .insert({
              name,
              display_order:
                nextOrder,
              active: true,
            });

        if (error) {
          throw error;
        }

        return json(req,{
          ok: true,
        });
      }

      case "update_alliance": {
        const id =
          Number(body?.id);

        const name =
          String(
            body?.name ?? "",
          ).trim();

        if (
          !Number.isInteger(id) ||
          !name
        ) {
          return json(req,
            {
              error:
                "Invalid alliance.",
            },
            400,
          );
        }

        const {
          error,
        } =
          await supabase
            .from(
              "wk_alliances",
            )
            .update({
              name,
              updated_at:
                new Date()
                  .toISOString(),
            })
            .eq("id", id);

        if (error) {
          throw error;
        }

        return json(req,{
          ok: true,
        });
      }

      case "toggle_alliance": {
        const id =
          Number(body?.id);

        const active =
          body?.active === true;

        if (
          !Number.isInteger(id)
        ) {
          return json(req,
            {
              error:
                "Invalid alliance ID.",
            },
            400,
          );
        }

        const {
          error,
        } =
          await supabase
            .from(
              "wk_alliances",
            )
            .update({
              active,
              updated_at:
                new Date()
                  .toISOString(),
            })
            .eq("id", id);

        if (error) {
          throw error;
        }

        return json(req,{
          ok: true,
        });
      }

      case "reorder_alliances": {
        const ids =
          body?.ids;

        if (
          !Array.isArray(ids)
        ) {
          return json(req,
            {
              error:
                "Invalid alliance order.",
            },
            400,
          );
        }

        for (
          let i = 0;
          i < ids.length;
          i += 1
        ) {
          const id =
            Number(ids[i]);

          if (
            !Number.isInteger(id)
          ) {
            return json(req,
              {
                error:
                  "Invalid alliance ID.",
              },
              400,
            );
          }

          const {
            error,
          } =
            await supabase
              .from(
                "wk_alliances",
              )
              .update({
                display_order:
                  i + 1,
                updated_at:
                  new Date()
                    .toISOString(),
              })
              .eq(
                "id",
                id,
              );

          if (error) {
            throw error;
          }
        }

        return json(req,{
          ok: true,
        });
      }
     
     case "update_application_mode": {
  const mode =
    String(
      body?.application_mode ?? "",
    ).trim();

  if (
    ![
      "auto",
      "open",
      "closed",
    ].includes(mode)
  ) {
    return json(req,
      {
        error:
          "Invalid application mode.",
      },
      400,
    );
  }

  const {
    data,
    error,
  } =
    await supabase
      .from("wk_settings")
      .update({
        application_mode:
          mode,

        updated_at:
          new Date()
            .toISOString(),
      })
      .eq(
        "id",
        1,
      )
      .select(
  "id,application_mode,email_auto_send_enabled,updated_at",
)
      .single();

  if (error) {
    throw error;
  }

  return json(req,{
    ok: true,
    settings: data,
  });
}

case "add_email_recipient": {
  const nickname =
    String(
      body?.nickname ?? "",
    ).trim();

  const email =
    String(
      body?.email ?? "",
    ).trim();

  if (!email) {
    return json(req,
      {
        error:
          "Email is required.",
      },
      400,
    );
  }

  const {
    data: lastRows,
    error: orderError,
  } =
    await supabase
      .from(
        "wk_email_recipients",
      )
      .select(
        "display_order",
      )
      .order(
        "display_order",
        {
          ascending: false,
        },
      )
      .limit(1);

  if (orderError) {
    throw orderError;
  }

  const nextOrder =
    (
      lastRows?.[0]
        ?.display_order ??
      0
    ) + 1;

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "wk_email_recipients",
      )
      .insert({
        nickname,
        email,
        active: true,
        display_order:
          nextOrder,
      })
      .select("*")
      .single();

  if (error) {
    throw error;
  }

  return json(req,{
    ok: true,
    recipient: data,
  });
}

case "update_email_recipient": {
  const id =
    Number(body?.id);

  const nickname =
    String(
      body?.nickname ?? "",
    ).trim();

  const email =
    String(
      body?.email ?? "",
    ).trim();

  const active =
    body?.active === true;

  if (
    !Number.isInteger(id) ||
    !email
  ) {
    return json(req,
      {
        error:
          "Invalid email recipient.",
      },
      400,
    );
  }

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "wk_email_recipients",
      )
      .update({
        nickname,
        email,
        active,
        updated_at:
          new Date()
            .toISOString(),
      })
      .eq(
        "id",
        id,
      )
      .select("*")
      .single();

  if (error) {
    throw error;
  }

  return json(req,{
    ok: true,
    recipient: data,
  });
}

case "delete_email_recipient": {
  const id =
    Number(body?.id);

  if (
    !Number.isInteger(id)
  ) {
    return json(req,
      {
        error:
          "Invalid email recipient ID.",
      },
      400,
    );
  }

  const {
    error,
  } =
    await supabase
      .from(
        "wk_email_recipients",
      )
      .delete()
      .eq(
        "id",
        id,
      );

  if (error) {
    throw error;
  }

  return json(req,{
    ok: true,
  });
}

case "update_email_auto_send": {
  const enabled =
    body?.enabled === true;

  const {
    data,
    error,
  } =
    await supabase
      .from("wk_settings")
      .update({
        email_auto_send_enabled:
          enabled,

        updated_at:
          new Date()
            .toISOString(),
      })
      .eq(
        "id",
        1,
      )
      .select(
        "id,application_mode,email_auto_send_enabled,updated_at",
      )
      .single();

  if (error) {
    throw error;
  }

  return json(req,{
    ok: true,
    settings: data,
  });
}

      default:
        return json(req,
          {
            error:
              "Unknown action.",
          },
          400,
        );
    }
  } catch (error) {
    console.error(error);

    return json(req,
      {
        error:
          error instanceof Error
            ? error.message
            : "Internal server error.",
      },
      500,
    );
  }
});
