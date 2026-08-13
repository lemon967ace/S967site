import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const ALLOWED_ORIGINS = new Set([
  "https://s967.org",
  "https://www.s967.org",
]);

function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin":
      ALLOWED_ORIGINS.has(origin) ? origin : "https://s967.org",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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

const resendApiKey =
  Deno.env.get(
    "RESEND_API_KEY",
  ) ?? "";

const resendFromEmail =
  Deno.env.get(
    "RESEND_FROM_EMAIL",
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


const FIRST_OPEN_KST =
  "2026-08-15T09:00:00+09:00";

const CYCLE_DAYS =
  14;

const OPEN_DAYS =
  5;

const DAY_MS =
  24 * 60 * 60 * 1000;

const cycleMs =
  CYCLE_DAYS * DAY_MS;

const openMs =
  OPEN_DAYS * DAY_MS;


function getCurrentPeriod() {
  const now =
    Date.now();

  const firstOpen =
    new Date(
      FIRST_OPEN_KST,
    ).getTime();

  if (now < firstOpen) {
    return {
      start: firstOpen,
      end: firstOpen + openMs,
      cycleIndex: 0,
    };
  }

  const elapsed =
    now - firstOpen;

  const cycleIndex =
    Math.floor(
      elapsed / cycleMs,
    );

  const start =
    firstOpen +
    cycleIndex * cycleMs;

  const end =
    start + openMs;

  return {
    start,
    end,
    cycleIndex,
  };
}


function formatKstDate(
  value: string | number | Date,
) {
  return new Intl.DateTimeFormat(
    "ko-KR",
    {
      timeZone:
        "Asia/Seoul",

      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    },
  ).format(
    new Date(value),
  );
}


function formatFileDate(
  value: number,
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "Asia/Seoul",

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit",
      },
    ).formatToParts(
      new Date(value),
    );

  const map =
    Object.fromEntries(
      parts.map(
        (part) => [
          part.type,
          part.value,
        ],
      ),
    );

  return (
    `${map.year}-` +
    `${map.month}-` +
    `${map.day}`
  );
}


function troopTypeLabel(
  value: string,
) {
  const map:
    Record<string, string> = {
      fighter: "Fighter",
      shooter: "Shooter",
      rider: "Rider",
      all_strong: "All Strong",
    };

  return map[value] ?? value;
}


function realtimeLabel(
  value: string,
) {
  const map:
    Record<string, string> = {
      monitor_available:
        "Monitoring Available",

      monitor_unavailable:
        "Monitoring Unavailable",
    };

  return map[value] ?? value;
}


function captainRoleLabel(
  value: string,
) {
  const map:
    Record<string, string> = {
      captain: "Captain",
      sub_captain:
        "Sub Captain",
      regular:
        "Regular",
      negotiable:
        "Negotiable",
    };

  return map[value] ?? value;
}


function participationLabel(
  value: string,
) {
  const map:
    Record<string, string> = {
      first_half:
        "First Half",

      second_half:
        "Second Half",

      full:
        "Full",
    };

  return map[value] ?? value;
}


function bytesToBase64(
  bytes: Uint8Array,
) {
  let binary = "";

  const chunkSize =
    0x8000;

  for (
    let i = 0;
    i < bytes.length;
    i += chunkSize
  ) {
    const chunk =
      bytes.subarray(
        i,
        Math.min(
          i + chunkSize,
          bytes.length,
        ),
      );

    binary +=
      String.fromCharCode(
        ...chunk,
      );
  }

  return btoa(binary);
}


async function recordExport(
  values: {
    export_type:
      "automatic" |
      "manual";

    period_start:
      string;

    period_end:
      string;

    recipient_count:
      number;

    resend_email_ids:
      string[];

    success:
      boolean;

    error_message:
      string | null;
  },
) {
  const {
    error,
  } =
    await supabase
      .from(
        "wk_email_exports",
      )
      .insert({
        export_type:
          values.export_type,

        period_start:
          values.period_start,

        period_end:
          values.period_end,

        recipient_count:
          values.recipient_count,

        resend_email_ids:
          values.resend_email_ids,

        success:
          values.success,

        error_message:
          values.error_message,
      });

  if (error) {
    console.error(
      "Failed to record export:",
      error,
    );
  }
}


// recordExport가 완전히 끝난 다음에 시작
async function recordRecipientExport(
  values: {
    export_type:
      "automatic" |
      "manual";

    period_start:
      string;

    period_end:
      string;

    recipient_id:
      number;

    nickname:
      string;

    email:
      string;

    resend_email_id:
      string | null;

    success:
      boolean;

    error_message:
      string | null;
  },
) {
  const {
    error,
  } =
    await supabase
      .from(
        "wk_email_export_recipients",
      )
      .insert({
        export_type:
          values.export_type,

        period_start:
          values.period_start,

        period_end:
          values.period_end,

        recipient_id:
          values.recipient_id,

        nickname:
          values.nickname,

        email:
          values.email,

        resend_email_id:
          values.resend_email_id,

        success:
          values.success,

        error_message:
          values.error_message,
      });

  if (error) {
    console.error(
      "Failed to record recipient export:",
      error,
    );
  }
}


Deno.serve(
  async (req) => {
    if (
      req.method === "OPTIONS"
    ) {
      return new Response(
        "ok",
        {
          headers:
            cors(req),
        },
      );
    }

    if (
      req.method !== "POST"
    ) {
      return json(req,
        {
          error:
            "Method not allowed.",
        },
        405,
      );
    }

    const origin = req.headers.get("origin");
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return json(req, { error: "Origin not allowed." }, 403);
    }

    try {
      const body =
        await req
          .json()
          .catch(
            () => ({}),
          );

      const type =
        body?.type ===
        "automatic"
          ? "automatic"
          : "manual";


      /*
        수동 발송은
        관리자 비밀번호 필수
      */
      if (
        type === "manual"
      ) {
        const admin = await verifyAdminSession(req);
        if (!admin.ok) {
          return json(req, { error: admin.error }, admin.status);
        }
      }


      if (
        !resendApiKey
      ) {
        throw new Error(
          "RESEND_API_KEY is not configured.",
        );
      }

      if (
        !resendFromEmail
      ) {
        throw new Error(
          "RESEND_FROM_EMAIL is not configured.",
        );
      }


      const period =
        getCurrentPeriod();

      const cycleNumber =
        period.cycleIndex + 1;

      const periodStart =
        new Date(
          period.start,
        ).toISOString();

      const periodEnd =
        new Date(
          period.end,
        ).toISOString();


      /*
        자동발송 조건 검사
      */
      if (
        type === "automatic"
      ) {
        const {
          data: settings,
          error:
            settingsError,
        } =
          await supabase
            .from(
              "wk_settings",
            )
            .select(
              "application_mode,email_auto_send_enabled",
            )
            .eq(
              "id",
              1,
            )
            .maybeSingle();

        if (
          settingsError
        ) {
          throw settingsError;
        }


        if (
          settings
            ?.email_auto_send_enabled !==
          true
        ) {
          return json(req,{
            ok: true,
            skipped: true,
            reason:
              "auto_send_disabled",
          });
        }


        if (
          settings
            ?.application_mode !==
          "auto"
        ) {
          return json(req,{
            ok: true,
            skipped: true,
            reason:
              "application_mode_not_auto",
          });
        }


        const sendAt =
          period.end +
          10 * 60 * 1000;

        if (
          Date.now() <
          sendAt
        ) {
          return json(req,{
            ok: true,
            skipped: true,
            reason:
              "too_early",
          });
        }


        
      }


      /*
        활성 수신자
      */
      const {
        data:
          recipients,
        error:
          recipientError,
      } =
        await supabase
          .from(
            "wk_email_recipients",
          )
          .select(
            "id,nickname,email",
          )
          .eq(
            "active",
            true,
          )
          .order(
            "display_order",
            {
              ascending:
                true,
            },
          );

      if (
        recipientError
      ) {
        throw recipientError;
      }

      if (
        !recipients ||
        recipients.length ===
          0
      ) {
        return json(req,
          {
            error:
              "No active email recipients.",
          },
          400,
        );
      }

let recipientsToSend =
  recipients;


if (
  type === "automatic"
) {
  const {
    data:
      successfulRecipients,
    error:
      successfulRecipientsError,
  } =
    await supabase
      .from(
        "wk_email_export_recipients",
      )
      .select(
        "recipient_id",
      )
      .eq(
        "export_type",
        "automatic",
      )
      .eq(
        "period_start",
        periodStart,
      )
      .eq(
        "success",
        true,
      );

  if (
    successfulRecipientsError
  ) {
    throw successfulRecipientsError;
  }


  const successfulIds =
    new Set(
      (
        successfulRecipients ??
        []
      ).map(
        (item) =>
          Number(
            item.recipient_id,
          ),
      ),
    );


  recipientsToSend =
    recipients.filter(
      (recipient) =>
        !successfulIds.has(
          Number(
            recipient.id,
          ),
        ),
    );


  if (
    recipientsToSend.length ===
    0
  ) {
    return json(req,{
      ok: true,
      skipped: true,
      reason:
        "already_sent",
    });
  }
}

      /*
        해당 WK 회차 신청
      */
      const {
        data:
          applications,
        error:
          applicationsError,
      } =
        await supabase
          .from(
            "wk_applications",
          )
          .select(
            [
              "id",
              "created_at",
              "cycle_number",
              "language",
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
            cycleNumber,
          )

          .order(
            "created_at",
            {
              ascending:
                true,
            },
          );

      if (
        applicationsError
      ) {
        throw applicationsError;
      }


      /*
        Excel 행 생성
      */
      const rows =
        (
          applications ??
          []
        ).map(
          (item) => ({
            "Submitted At":
              formatKstDate(
                item.created_at,
              ),

            "Cycle":
              item.cycle_number,

            "Player Name":
              item.player_name,

            "Tier":
              item
                .tier_name_snapshot,

            "Alliance":
              item
                .alliance_name_snapshot,

            "Troop Type":
              troopTypeLabel(
                item.troop_type,
              ),

            "Troop Size":
              item.troop_size,

            "Rally Size":
              item.rally_size,

            "Real-time Response":
              realtimeLabel(
                item.realtime_response,
              ),

            "Captain Role":
              captainRoleLabel(
                item.captain_role,
              ),

            "Participation Time":
              participationLabel(
                item.participation_time,
              ),

            "Language":
              item.language,

            "Status":
              item.status,
          }),
        );


      /*
        신청자가 0명이어도
        헤더가 있는 Excel 생성
      */
      const headers = [
        "Submitted At",
        "Cycle",
        "Player Name",
        "Tier",
        "Alliance",
        "Troop Type",
        "Troop Size",
        "Rally Size",
        "Real-time Response",
        "Captain Role",
        "Participation Time",
        "Language",
        "Status",
      ];


      const worksheet =
        rows.length > 0
          ? XLSX.utils
              .json_to_sheet(
                rows,
                {
                  header:
                    headers,
                },
              )
          : XLSX.utils
              .aoa_to_sheet([
                headers,
              ]);


      worksheet[
        "!cols"
            ] = [
        { wch: 22 },
        { wch: 10 },
        { wch: 20 },
        { wch: 16 },
        { wch: 18 },
        { wch: 18 },
        { wch: 14 },
        { wch: 14 },
        { wch: 24 },
        { wch: 18 },
        { wch: 20 },
        { wch: 12 },
        { wch: 14 },
      ];


      const workbook =
        XLSX.utils
          .book_new();

      XLSX.utils
        .book_append_sheet(
          workbook,
          worksheet,
          "WK Applications",
        );


      const excelData =
        XLSX.write(
          workbook,
          {
            type: "array",
            bookType:
              "xlsx",
          },
        );

      const excelBytes =
        new Uint8Array(
          excelData,
        );

      const excelBase64 =
        bytesToBase64(
          excelBytes,
        );


        const filename =
        "S967_WK_Cycle_" +
        cycleNumber +
        "_" +
        formatFileDate(
          period.start,
        ) +
        "_" +
        formatFileDate(
          period.end,
        ) +
        ".xlsx";


      const subject =
        "[S967] WK Applications - Cycle " +
        cycleNumber +
        " - " +
        formatFileDate(
          period.start,
        );

      const resendIds:
        string[] = [];

      const failures:
        string[] = [];


      /*
        수신자별 개별 발송
      */
     for (
  const recipient
  of recipientsToSend
) {
        try {
          const response =
            await fetch(
              "https://api.resend.com/emails",
              {
                method:
                  "POST",

                headers: {
                  Authorization:
                    `Bearer ${resendApiKey}`,

                  "Content-Type":
                    "application/json",
                },

                body:
                  JSON.stringify({
                    from:
                      `S967 WK <${resendFromEmail}>`,

                    to: [
                      recipient.email,
                    ],

                    subject,

                    html:
                      [
                        "<p>S967 WK 신청 결과입니다.</p>",
                        "<p>",
                        "신청 기간: ",
                        formatKstDate(
                          period.start,
                        ),
                        " ~ ",
                        formatKstDate(
                          period.end,
                        ),
                        "</p>",
                        "<p>",
                        `신청 인원: ${rows.length}명`,
                        "</p>",
                      ].join(
                        "",
                      ),

                    attachments: [
                      {
                        filename,
                        content:
                          excelBase64,
                      },
                    ],
                  }),
              },
            );


          const result =
            await response
              .json()
              .catch(
                () => ({}),
              );

          if (
            !response.ok
          ) {
            throw new Error(
              result?.message ||
              `Resend HTTP ${response.status}`,
            );
          }

          const resendId =
  result?.id
    ? String(
        result.id,
      )
    : null;

if (resendId) {
  resendIds.push(
    resendId,
  );
}

await recordRecipientExport({
  export_type:
    type,

  period_start:
    periodStart,

  period_end:
    periodEnd,

  recipient_id:
    Number(
      recipient.id,
    ),

  nickname:
    recipient.nickname ??
    "",

  email:
    recipient.email,

  resend_email_id:
    resendId,

  success:
    true,

  error_message:
    null,
});

     } catch (error) {
  const errorMessage =
    error instanceof Error
      ? error.message
      : "Unknown error";

  failures.push(
    `${recipient.email}: ${errorMessage}`,
  );

  await recordRecipientExport({
    export_type:
      type,

    period_start:
      periodStart,

    period_end:
      periodEnd,

    recipient_id:
      Number(
        recipient.id,
      ),

    nickname:
      recipient.nickname ??
      "",

    email:
      recipient.email,

    resend_email_id:
      null,

    success:
      false,

    error_message:
      errorMessage,
  });
}
      }


      const success =
        failures.length ===
        0;

      await recordExport({
        export_type:
          type,

        period_start:
          periodStart,

        period_end:
          periodEnd,

      recipient_count:
  recipientsToSend.length,

        resend_email_ids:
          resendIds,

        success,

        error_message:
          success
            ? null
            : failures.join(
                "\n",
              ),
      });


      if (!success) {
        return json(req,
          {
            ok: false,

            sent:
              resendIds.length,

            failed:
              failures.length,

            errors:
              failures,
          },
          500,
        );
      }


      return json(req,{
        ok: true,

        type,

        filename,

        application_count:
          rows.length,

        recipient_count:
  recipientsToSend.length,

        resend_email_ids:
          resendIds,
      });
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
  },
);
