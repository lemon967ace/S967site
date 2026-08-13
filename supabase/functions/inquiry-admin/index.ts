import { createClient } from "npm:@supabase/supabase-js@2";

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
        "Content-Type":
          "application/json",
      },
    },
  );
}

const supabaseUrl =
  Deno.env.get(
    "SUPABASE_URL",
  ) ?? "";

const serviceRoleKey =
  Deno.env.get(
    "SUPABASE_SERVICE_ROLE_KEY",
  ) ?? "";

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

Deno.serve(
  async (req) => {
    if (
      req.method ===
      "OPTIONS"
    ) {
      return new Response(
        "ok",
        {
          headers:
            cors(req),
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


      /*
        조회
      */
      if (
        req.method ===
        "GET"
      ) {
        const [
          recipientsResult,
          settingsResult,
        ] =
          await Promise.all([
            supabase
              .from(
                "inquiry_email_recipients",
              )
              .select("*")
              .order(
                "display_order",
                {
                  ascending:
                    true,
                },
              ),

            supabase
              .from(
                "inquiry_settings",
              )
              .select(
                "id,inquiry_open,updated_at",
              )
              .eq(
                "id",
                1,
              )
              .maybeSingle(),
          ]);


        if (
          recipientsResult.error
        ) {
          throw recipientsResult.error;
        }

        if (
          settingsResult.error
        ) {
          throw settingsResult.error;
        }


        return json(req,{
          settings: {
            inquiry_open:
              settingsResult
                .data
                ?.inquiry_open ??
              true,

            updated_at:
              settingsResult
                .data
                ?.updated_at ??
              null,
          },

          email_recipients:
            recipientsResult
              .data ??
            [],
        });
      }


      if (
        req.method !==
        "POST"
      ) {
        return json(req,
          {
            error:
              "Method not allowed.",
          },
          405,
        );
      }


      const body =
        await req
          .json()
          .catch(
            () => ({}),
          );

      const action =
        String(
          body?.action ?? "",
        );


      switch (action) {

        /*
          문의창 열기 / 닫기
        */
        case "update_inquiry_open": {
          if (
            typeof body
              ?.inquiry_open !==
            "boolean"
          ) {
            return json(req,
              {
                error:
                  "inquiry_open must be boolean.",
              },
              400,
            );
          }


          const inquiryOpen =
            body.inquiry_open;


          const {
            data,
            error,
          } =
            await supabase
              .from(
                "inquiry_settings",
              )
              .upsert(
                {
                  id: 1,

                  inquiry_open:
                    inquiryOpen,

                  updated_at:
                    new Date()
                      .toISOString(),
                },
                {
                  onConflict:
                    "id",
                },
              )
              .select(
                "id,inquiry_open,updated_at",
              )
              .single();


          if (error) {
            throw error;
          }


          return json(req,{
            ok: true,

            settings:
              data,
          });
        }


        /*
          수신자 추가
        */
        case "add_inquiry_email_recipient": {
          const nickname =
            String(
              body?.nickname ??
                "",
            ).trim();

          const email =
            String(
              body?.email ??
                "",
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
            data:
              lastRows,
            error:
              orderError,
          } =
            await supabase
              .from(
                "inquiry_email_recipients",
              )
              .select(
                "display_order",
              )
              .order(
                "display_order",
                {
                  ascending:
                    false,
                },
              )
              .limit(1);

          if (
            orderError
          ) {
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
                "inquiry_email_recipients",
              )
              .insert({
                nickname,
                email,

                active:
                  true,

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
            recipient:
              data,
          });
        }


        /*
          수정 / Active 토글
        */
        case "update_inquiry_email_recipient": {
          const id =
            Number(
              body?.id,
            );

          const nickname =
            String(
              body?.nickname ??
                "",
            ).trim();

          const email =
            String(
              body?.email ??
                "",
            ).trim();

          const active =
            body?.active ===
            true;

          if (
            !Number.isInteger(
              id,
            ) ||
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
                "inquiry_email_recipients",
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
            recipient:
              data,
          });
        }


        /*
          삭제
        */
        case "delete_inquiry_email_recipient": {
          const id =
            Number(
              body?.id,
            );

          if (
            !Number.isInteger(
              id,
            )
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
                "inquiry_email_recipients",
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
      console.error(
        error,
      );

      return json(req,
        {
          error:
            error instanceof
                Error
              ? error.message
              : "Internal server error.",
        },
        500,
      );
    }
  },
);
