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

function positiveInteger(
  value: unknown,
) {
  const number =
    Number(value);

  if (
    !Number.isSafeInteger(
      number,
    ) ||
    number <= 0
  ) {
    return null;
  }

  return number;
}

function nonNegativeInteger(
  value: unknown,
  fallback = 0,
) {
  const number =
    Number(value);

  if (
    !Number.isSafeInteger(
      number,
    ) ||
    number < 0
  ) {
    return fallback;
  }

  return number;
}

function cleanText(
  value: unknown,
) {
  return String(
    value ?? "",
  ).trim();
}

function isValidDate(
  value: unknown,
) {
  const text =
    cleanText(value);

  if (!text) {
    return false;
  }

  return !Number.isNaN(
    new Date(
      text,
    ).getTime(),
  );
}

/*
  ============================================================
  EVENT OVERLAP CHECK

  active=true 이벤트끼리는 모집기간이 겹치지 않게 한다.
  ============================================================
*/
async function hasEventOverlap(
  startAt: string,
  endAt: string,
  excludeId:
    number | null = null,
) {
  let query =
    supabase
      .from(
        "group_buy_events",
      )
      .select(
        "id,title,start_at,end_at",
      )
      .eq(
        "active",
        true,
      )
      .lt(
        "start_at",
        endAt,
      )
      .gt(
        "end_at",
        startAt,
      );

  if (
    excludeId !==
    null
  ) {
    query =
      query.neq(
        "id",
        excludeId,
      );
  }

  const {
    data,
    error,
  } =
    await query;

  if (error) {
    throw error;
  }

  return (
    data &&
    data.length > 0
  )
    ? data
    : [];
}

/*
  ============================================================
  ADMIN OVERVIEW
  ============================================================
*/
async function loadAdminData() {
  const [
    eventsResult,
    alliancesResult,
    recipientsResult,
    logsResult,
    recipientLogsResult,
  ] =
    await Promise.all([
      supabase
        .from(
          "group_buy_events",
        )
        .select(
          "id,title,start_at,end_at,active,export_email_sent_at,created_at,updated_at",
        )
        .order(
          "start_at",
          {
            ascending:
              false,
          },
        ),

      supabase
        .from(
          "group_buy_alliances",
        )
        .select(
          "id,name,active,display_order,created_at,updated_at",
        )
        .order(
          "display_order",
          {
            ascending:
              true,
          },
        )
        .order(
          "name",
          {
            ascending:
              true,
          },
        ),

      supabase
        .from(
          "group_buy_email_recipients",
        )
        .select(
          "id,nickname,email,active,display_order,created_at,updated_at",
        )
        .order(
          "display_order",
          {
            ascending:
              true,
          },
        )
        .order(
          "id",
          {
            ascending:
              true,
          },
        ),

      supabase
        .from(
          "group_buy_export_logs",
        )
        .select(
          "id,event_id,started_at,completed_at,status,recipient_count,success_count,failure_count,error_message,created_at",
        )
        .order(
          "started_at",
          {
            ascending:
              false,
          },
        )
        .limit(
          100,
        ),

      /*
        최근 수신자별 발송 기록.
        관리자 첫 화면에서도 최근 성공/실패를 확인할 수 있다.
      */
      supabase
        .from(
          "group_buy_export_recipient_logs",
        )
        .select(
          "id,export_log_id,event_id,recipient_id,recipient_nickname,recipient_email,status,sent_at,error_message,created_at,updated_at",
        )
        .order(
          "created_at",
          {
            ascending:
              false,
          },
        )
        .limit(
          300,
        ),
    ]);

  if (
    eventsResult.error
  ) {
    throw eventsResult.error;
  }

  if (
    alliancesResult.error
  ) {
    throw alliancesResult.error;
  }

  if (
    recipientsResult.error
  ) {
    throw recipientsResult.error;
  }

  if (
    logsResult.error
  ) {
    throw logsResult.error;
  }

  if (
    recipientLogsResult.error
  ) {
    throw recipientLogsResult.error;
  }

  return {
    events:
      eventsResult.data ??
      [],

    alliances:
      alliancesResult.data ??
      [],

    email_recipients:
      recipientsResult.data ??
      [],

    export_logs:
      logsResult.data ??
      [],

    export_recipient_logs:
      recipientLogsResult.data ??
      [],
  };
}

/*
  ============================================================
  EVENT DETAIL

  상품 + 신청 + 회차 발송 기록 + 수신자별 발송 기록
  ============================================================
*/
async function loadEventDetail(
  eventId: number,
) {
  const [
    eventResult,
    itemsResult,
    applicationsResult,
    exportLogsResult,
    recipientLogsResult,
  ] =
    await Promise.all([
      supabase
        .from(
          "group_buy_events",
        )
        .select(
          "id,title,start_at,end_at,active,export_email_sent_at,created_at,updated_at",
        )
        .eq(
          "id",
          eventId,
        )
        .maybeSingle(),

      supabase
        .from(
          "group_buy_items",
        )
        .select(
          "id,event_id,name,max_quantity,active,display_order,created_at,updated_at",
        )
        .eq(
          "event_id",
          eventId,
        )
        .order(
          "display_order",
          {
            ascending:
              true,
          },
        )
        .order(
          "name",
          {
            ascending:
              true,
          },
        ),

      supabase
        .from(
          "group_buy_applications",
        )
        .select(
          `
          id,
          event_id,
          alliance_id,
          alliance_name,
          player_name,
          language,
          agreement_purchase,
          agreement_restriction,
          created_at,
          updated_at,
          group_buy_alliances (
            id,
            name
          ),
          group_buy_application_items (
            id,
            item_id,
            quantity,
            group_buy_items (
              id,
              name,
              max_quantity
            )
          )
          `,
        )
        .eq(
          "event_id",
          eventId,
        )
        .order(
          "created_at",
          {
            ascending:
              true,
          },
        ),

      supabase
        .from(
          "group_buy_export_logs",
        )
        .select(
          "id,event_id,started_at,completed_at,status,recipient_count,success_count,failure_count,error_message,created_at",
        )
        .eq(
          "event_id",
          eventId,
        )
        .order(
          "started_at",
          {
            ascending:
              false,
          },
        )
        .limit(
          100,
        ),

      supabase
        .from(
          "group_buy_export_recipient_logs",
        )
        .select(
          "id,export_log_id,event_id,recipient_id,recipient_nickname,recipient_email,status,sent_at,error_message,created_at,updated_at",
        )
        .eq(
          "event_id",
          eventId,
        )
        .order(
          "created_at",
          {
            ascending:
              false,
          },
        )
        .limit(
          500,
        ),
    ]);

  if (
    eventResult.error
  ) {
    throw eventResult.error;
  }

  if (
    itemsResult.error
  ) {
    throw itemsResult.error;
  }

  if (
    applicationsResult.error
  ) {
    throw applicationsResult.error;
  }

  if (
    exportLogsResult.error
  ) {
    throw exportLogsResult.error;
  }

  if (
    recipientLogsResult.error
  ) {
    throw recipientLogsResult.error;
  }

  if (!eventResult.data) {
    return null;
  }

  return {
    event:
      eventResult.data,

    items:
      itemsResult.data ??
      [],

    applications:
      applicationsResult.data ??
      [],

    export_logs:
      exportLogsResult.data ??
      [],

    export_recipient_logs:
      recipientLogsResult.data ??
      [],
  };
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

    if (
      !supabaseUrl ||
      !serviceRoleKey
    ) {
      return json(req,
        {
          error:
            "Server configuration error.",
        },
        500,
      );
    }

    /*
      ==========================================================
      GET
      ==========================================================
    */
    if (
      req.method ===
      "GET"
    ) {
      try {
        const url =
          new URL(
            req.url,
          );

        const eventIdText =
          url.searchParams.get(
            "event_id",
          );

        /*
          event_id가 있으면 해당 회차 상세조회
        */
        if (
          eventIdText
        ) {
          const eventId =
            positiveInteger(
              eventIdText,
            );

          if (!eventId) {
            return json(req,
              {
                error:
                  "Invalid event.",
              },
              400,
            );
          }

          const detail =
            await loadEventDetail(
              eventId,
            );

          if (!detail) {
            return json(req,
              {
                error:
                  "Event not found.",
              },
              404,
            );
          }

          return json(req,{
            ok:
              true,

            ...detail,
          });
        }

        /*
          기본 관리자 전체 데이터
        */
        const data =
          await loadAdminData();

        return json(req,{
          ok:
            true,

          ...data,
        });

      } catch (
        error
      ) {
        console.error(
          "Group buy admin GET failed:",
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
    }

    /*
      POST만 허용
    */
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

    /*
      ==========================================================
      POST ACTIONS
      ==========================================================
    */
    try {
      const body =
        await req
          .json()
          .catch(
            () => ({}),
          );

      const action =
        cleanText(
          body?.action,
        );

      /*
        ========================================================
        EVENT CREATE
        ========================================================
      */
      if (
        action ===
        "create_event"
      ) {
        const title =
          cleanText(
            body?.title,
          );

        const startAt =
          cleanText(
            body?.start_at,
          );

        const endAt =
          cleanText(
            body?.end_at,
          );

        const active =
          body?.active !==
          false;

        if (!title) {
          return json(req,
            {
              error:
                "Event title is required.",
            },
            400,
          );
        }

        if (
          !isValidDate(
            startAt,
          ) ||
          !isValidDate(
            endAt,
          )
        ) {
          return json(req,
            {
              error:
                "Invalid event period.",
            },
            400,
          );
        }

        if (
          new Date(
            endAt,
          ).getTime() <=
          new Date(
            startAt,
          ).getTime()
        ) {
          return json(req,
            {
              error:
                "End time must be later than start time.",
            },
            400,
          );
        }

        if (active) {
          const overlaps =
            await hasEventOverlap(
              startAt,
              endAt,
            );

          if (
            overlaps.length >
            0
          ) {
            return json(req,
              {
                error:
                  "EVENT_PERIOD_OVERLAP",

                conflicts:
                  overlaps,
              },
              409,
            );
          }
        }

        const {
          data,
          error,
        } =
          await supabase
            .from(
              "group_buy_events",
            )
            .insert({
              title,

              start_at:
                startAt,

              end_at:
                endAt,

              active,
            })
            .select(
              "*",
            )
            .single();

        if (error) {
          throw error;
        }

        return json(req,
          {
            ok:
              true,

            event:
              data,
          },
          201,
        );
      }

      /*
        ========================================================
        EVENT UPDATE
        ========================================================
      */
      if (
        action ===
        "update_event"
      ) {
        const id =
          positiveInteger(
            body?.id,
          );

        if (!id) {
          return json(req,
            {
              error:
                "Invalid event.",
            },
            400,
          );
        }

        const {
          data:
            current,
          error:
            currentError,
        } =
          await supabase
            .from(
              "group_buy_events",
            )
            .select(
              "*",
            )
            .eq(
              "id",
              id,
            )
            .maybeSingle();

        if (
          currentError
        ) {
          throw currentError;
        }

        if (!current) {
          return json(req,
            {
              error:
                "Event not found.",
            },
            404,
          );
        }

        const title =
          body?.title ===
            undefined
            ? current.title
            : cleanText(
                body.title,
              );

        const startAt =
          body?.start_at ===
            undefined
            ? current.start_at
            : cleanText(
                body.start_at,
              );

        const endAt =
          body?.end_at ===
            undefined
            ? current.end_at
            : cleanText(
                body.end_at,
              );

        const active =
          body?.active ===
            undefined
            ? current.active
            : body.active ===
                true;

        if (!title) {
          return json(req,
            {
              error:
                "Event title is required.",
            },
            400,
          );
        }

        if (
          !isValidDate(
            startAt,
          ) ||
          !isValidDate(
            endAt,
          )
        ) {
          return json(req,
            {
              error:
                "Invalid event period.",
            },
            400,
          );
        }

        if (
          new Date(
            endAt,
          ).getTime() <=
          new Date(
            startAt,
          ).getTime()
        ) {
          return json(req,
            {
              error:
                "End time must be later than start time.",
            },
            400,
          );
        }

        if (active) {
          const overlaps =
            await hasEventOverlap(
              startAt,
              endAt,
              id,
            );

          if (
            overlaps.length >
            0
          ) {
            return json(req,
              {
                error:
                  "EVENT_PERIOD_OVERLAP",

                conflicts:
                  overlaps,
              },
              409,
            );
          }
        }

        const {
          data,
          error,
        } =
          await supabase
            .from(
              "group_buy_events",
            )
            .update({
              title,

              start_at:
                startAt,

              end_at:
                endAt,

              active,
            })
            .eq(
              "id",
              id,
            )
            .select(
              "*",
            )
            .single();

        if (error) {
          throw error;
        }

        return json(req,{
          ok:
            true,

          event:
            data,
        });
      }

      /*
        ========================================================
        EVENT DELETE

        회차와 해당 회차 전용 데이터를 DB 트랜잭션 RPC에서
        한 번에 완전 삭제한다.

        삭제 대상:
        - group_buy_export_recipient_logs
        - group_buy_export_logs
        - group_buy_applications
          (application_items는 FK CASCADE)
        - group_buy_items
        - group_buy_events

        공용 데이터인 연맹/이메일 수신자 목록은 삭제하지 않는다.
        ========================================================
      */
      if (
        action ===
        "delete_event"
      ) {
        const id =
          positiveInteger(
            body?.id,
          );

        if (!id) {
          return json(req,
            {
              error:
                "Invalid event.",
            },
            400,
          );
        }

        const {
          data,
          error,
        } =
          await supabase
            .rpc(
              "delete_group_buy_event_cascade",
              {
                p_event_id:
                  id,
              },
            );

        if (error) {
          throw error;
        }

        return json(req,{
          ok:
            true,

          deleted_event_id:
            id,

          result:
            data ?? null,
        });
      }

      /*
        ========================================================
        ALLIANCE CREATE
        ========================================================
      */
      if (
        action ===
        "create_alliance"
      ) {
        const name =
          cleanText(
            body?.name,
          );

        const active =
          body?.active !==
          false;

        const displayOrder =
          nonNegativeInteger(
            body?.display_order,
          );

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
          data,
          error,
        } =
          await supabase
            .from(
              "group_buy_alliances",
            )
            .insert({
              name,

              active,

              display_order:
                displayOrder,
            })
            .select(
              "*",
            )
            .single();

        if (error) {
          throw error;
        }

        return json(req,
          {
            ok:
              true,

            alliance:
              data,
          },
          201,
        );
      }

      /*
        ========================================================
        ALLIANCE UPDATE
        ========================================================
      */
      if (
        action ===
        "update_alliance"
      ) {
        const id =
          positiveInteger(
            body?.id,
          );

        const name =
          cleanText(
            body?.name,
          );

        if (
          !id ||
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

        const updateData:
          Record<
            string,
            unknown
          > = {
            name,
          };

        if (
          body?.active !==
          undefined
        ) {
          updateData.active =
            body.active ===
            true;
        }

        if (
          body?.display_order !==
          undefined
        ) {
          updateData.display_order =
            nonNegativeInteger(
              body.display_order,
            );
        }

        const {
          data,
          error,
        } =
          await supabase
            .from(
              "group_buy_alliances",
            )
            .update(
              updateData,
            )
            .eq(
              "id",
              id,
            )
            .select(
              "*",
            )
            .single();

        if (error) {
          throw error;
        }

        return json(req,{
          ok:
            true,

          alliance:
            data,
        });
      }

      /*
        ========================================================
        ALLIANCE DELETE

        연맹은 언제든 실제 삭제 가능.

        group_buy_applications.alliance_id FK는
        ON DELETE SET NULL로 설정되어 있으므로
        기존 신청서는 유지되고 alliance_id만 NULL이 된다.

        신청 당시 연맹명은
        group_buy_applications.alliance_name에 보존된다.
        ========================================================
      */
      if (
        action ===
        "delete_alliance"
      ) {
        const id =
          positiveInteger(
            body?.id,
          );

        if (!id) {
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
              "group_buy_alliances",
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
          ok:
            true,
        });
      }

      /*
        ========================================================
        ITEM CREATE
        ========================================================
      */
      if (
        action ===
        "create_item"
      ) {
        const eventId =
          positiveInteger(
            body?.event_id,
          );

        const name =
          cleanText(
            body?.name,
          );

        const maxQuantity =
          positiveInteger(
            body?.max_quantity,
          );

        const active =
          body?.active !==
          false;

        const displayOrder =
          nonNegativeInteger(
            body?.display_order,
          );

        if (
          !eventId ||
          !name ||
          !maxQuantity
        ) {
          return json(req,
            {
              error:
                "Invalid item.",
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
              "group_buy_items",
            )
            .insert({
              event_id:
                eventId,

              name,

              max_quantity:
                maxQuantity,

              active,

              display_order:
                displayOrder,
            })
            .select(
              "*",
            )
            .single();

        if (error) {
          throw error;
        }

        return json(req,
          {
            ok:
              true,

            item:
              data,
          },
          201,
        );
      }

      /*
        ========================================================
        ITEM UPDATE
        ========================================================
      */
      if (
        action ===
        "update_item"
      ) {
        const id =
          positiveInteger(
            body?.id,
          );

        const name =
          cleanText(
            body?.name,
          );

        const maxQuantity =
          positiveInteger(
            body?.max_quantity,
          );

        if (
          !id ||
          !name ||
          !maxQuantity
        ) {
          return json(req,
            {
              error:
                "Invalid item.",
            },
            400,
          );
        }

        const updateData:
          Record<
            string,
            unknown
          > = {
            name,

            max_quantity:
              maxQuantity,
          };

        if (
          body?.active !==
          undefined
        ) {
          updateData.active =
            body.active ===
            true;
        }

        if (
          body?.display_order !==
          undefined
        ) {
          updateData.display_order =
            nonNegativeInteger(
              body.display_order,
            );
        }

        const {
          data,
          error,
        } =
          await supabase
            .from(
              "group_buy_items",
            )
            .update(
              updateData,
            )
            .eq(
              "id",
              id,
            )
            .select(
              "*",
            )
            .single();

        if (error) {
          throw error;
        }

        return json(req,{
          ok:
            true,

          item:
            data,
        });
      }

      /*
        ========================================================
        ITEM DELETE

        과거 신청에서 사용됐으면 실제 삭제 금지.
        ========================================================
      */
      if (
        action ===
        "delete_item"
      ) {
        const id =
          positiveInteger(
            body?.id,
          );

        if (!id) {
          return json(req,
            {
              error:
                "Invalid item.",
            },
            400,
          );
        }

        const {
          count,
          error:
            countError,
        } =
          await supabase
            .from(
              "group_buy_application_items",
            )
            .select(
              "id",
              {
                count:
                  "exact",

                head:
                  true,
              },
            )
            .eq(
              "item_id",
              id,
            );

        if (
          countError
        ) {
          throw countError;
        }

        if (
          (count ?? 0) >
          0
        ) {
          return json(req,
            {
              error:
                "ITEM_IN_USE",
            },
            409,
          );
        }

        const {
          error,
        } =
          await supabase
            .from(
              "group_buy_items",
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
          ok:
            true,
        });
      }

      /*
        ========================================================
        EMAIL RECIPIENT CREATE
        ========================================================
      */
      if (
        action ===
        "create_email_recipient"
      ) {
        const nickname =
          cleanText(
            body?.nickname,
          );

        const email =
          cleanText(
            body?.email,
          );

        const active =
          body?.active !==
          false;

        const displayOrder =
          nonNegativeInteger(
            body?.display_order,
          );

        if (
          !nickname ||
          !email
        ) {
          return json(req,
            {
              error:
                "Nickname and email are required.",
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
              "group_buy_email_recipients",
            )
            .insert({
              nickname,

              email,

              active,

              display_order:
                displayOrder,
            })
            .select(
              "*",
            )
            .single();

        if (error) {
          throw error;
        }

        return json(req,
          {
            ok:
              true,

            recipient:
              data,
          },
          201,
        );
      }

      /*
        ========================================================
        EMAIL RECIPIENT UPDATE
        ========================================================
      */
      if (
        action ===
        "update_email_recipient"
      ) {
        const id =
          positiveInteger(
            body?.id,
          );

        const nickname =
          cleanText(
            body?.nickname,
          );

        const email =
          cleanText(
            body?.email,
          );

        if (
          !id ||
          !nickname ||
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

        const updateData:
          Record<
            string,
            unknown
          > = {
            nickname,

            email,
          };

        if (
          body?.active !==
          undefined
        ) {
          updateData.active =
            body.active ===
            true;
        }

        if (
          body?.display_order !==
          undefined
        ) {
          updateData.display_order =
            nonNegativeInteger(
              body.display_order,
            );
        }

        const {
          data,
          error,
        } =
          await supabase
            .from(
              "group_buy_email_recipients",
            )
            .update(
              updateData,
            )
            .eq(
              "id",
              id,
            )
            .select(
              "*",
            )
            .single();

        if (error) {
          throw error;
        }

        return json(req,{
          ok:
            true,

          recipient:
            data,
        });
      }

      /*
        ========================================================
        EMAIL RECIPIENT DELETE

        이메일 수신자는 언제든 실제 삭제 가능.
        group_buy_export_recipient_logs.recipient_id FK는
        ON DELETE CASCADE로 설정하여 해당 수신자의
        발송 로그도 함께 삭제한다.
        ========================================================
      */
      if (
        action ===
        "delete_email_recipient"
      ) {
        const id =
          positiveInteger(
            body?.id,
          );

        if (!id) {
          return json(req,
            {
              error:
                "Invalid email recipient.",
            },
            400,
          );
        }

        const {
          error,
        } =
          await supabase
            .from(
              "group_buy_email_recipients",
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
          ok:
            true,
        });
      }

      /*
        ========================================================
        APPLICATION DELETE

        테스트 신청 삭제 등에 사용.
        연결된 상품 신청은 ON DELETE CASCADE로 같이 삭제.
        ========================================================
      */
      if (
        action ===
        "delete_application"
      ) {
        const id =
          positiveInteger(
            body?.id,
          );

        if (!id) {
          return json(req,
            {
              error:
                "Invalid application.",
            },
            400,
          );
        }

        const {
          error,
        } =
          await supabase
            .from(
              "group_buy_applications",
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
          ok:
            true,
        });
      }

      /*
        지원하지 않는 action
      */
      return json(req,
        {
          error:
            "Unknown action.",
        },
        400,
      );

    } catch (
      error
    ) {
      console.error(
        "Group buy admin POST failed:",
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

