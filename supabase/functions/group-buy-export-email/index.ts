import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const ALLOWED_ORIGINS = new Set([
  "https://s967.org",
  "https://www.s967.org",
]);

function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://s967.org",
    "Access-Control-Allow-Headers": "authorization, content-type, x-automation-secret",
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

const automationSecret =
  Deno.env.get("GROUP_BUY_AUTOMATION_SECRET") ?? "";

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

function escapeHtml(
  value: unknown,
) {
  return String(
    value ?? "",
  )
    .replaceAll(
      "&",
      "&amp;",
    )
    .replaceAll(
      "<",
      "&lt;",
    )
    .replaceAll(
      ">",
      "&gt;",
    )
    .replaceAll(
      '"',
      "&quot;",
    )
    .replaceAll(
      "'",
      "&#039;",
    );
}

function safeFileName(
  value: string,
) {
  return value
    .replace(
      /[\\/:*?"<>|]/g,
      "_",
    )
    .replace(
      /\s+/g,
      "_",
    )
    .slice(
      0,
      80,
    );
}

function formatKst(
  value: string | null,
) {
  if (!value) {
    return "";
  }

  const date =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "";
  }

  return new Intl
    .DateTimeFormat(
      "ko-KR",
      {
        timeZone:
          "Asia/Seoul",

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit",

        hour:
          "2-digit",

        minute:
          "2-digit",

        second:
          "2-digit",

        hour12:
          false,
      },
    )
    .format(
      date,
    );
}

function bytesToBase64(
  bytes: Uint8Array,
) {
  const chunkSize =
    0x8000;

  let binary =
    "";

  for (
    let i = 0;
    i < bytes.length;
    i += chunkSize
  ) {
    const chunk =
      bytes.subarray(
        i,
        Math.min(
          i +
            chunkSize,
          bytes.length,
        ),
      );

    binary +=
      String.fromCharCode(
        ...chunk,
      );
  }

  return btoa(
    binary,
  );
}

async function loadEvent(
  eventId: number,
) {
  const {
    data,
    error,
  } =
    await supabase
      .from(
        "group_buy_events",
      )
      .select(
        "id,title,start_at,end_at,active,export_email_sent_at",
      )
      .eq(
        "id",
        eventId,
      )
      .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function loadItems(
  eventId: number,
) {
  const {
    data,
    error,
  } =
    await supabase
      .from(
        "group_buy_items",
      )
      .select(
        "id,name,display_order",
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
        "id",
        {
          ascending:
            true,
        },
      );

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function loadApplications(
  eventId: number,
) {
  const {
    data,
    error,
  } =
    await supabase
      .from(
        "group_buy_applications",
      )
      .select(
        `
        id,
        alliance_id,
        alliance_name,
        player_name,
        language,
        created_at,
        updated_at,
        group_buy_alliances (
          id,
          name
        ),
        group_buy_application_items (
          item_id,
          quantity
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
      );

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function loadRecipients() {
  const {
    data,
    error,
  } =
    await supabase
      .from(
        "group_buy_email_recipients",
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
      )
      .order(
        "id",
        {
          ascending:
            true,
        },
      );

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function loadSuccessfulRecipientIds(
  eventId: number,
) {
  const {
    data,
    error,
  } =
    await supabase
      .from(
        "group_buy_export_recipient_logs",
      )
      .select(
        "recipient_id",
      )
      .eq(
        "event_id",
        eventId,
      )
      .eq(
        "status",
        "success",
      );

  if (error) {
    throw error;
  }

  return new Set(
    (data ?? [])
      .map(
        (row) =>
          Number(
            row.recipient_id,
          ),
      )
      .filter(
        (id) =>
          Number.isSafeInteger(
            id,
          ) &&
          id > 0,
      ),
  );
}

function createWorkbook(
  event: any,
  items: any[],
  applications: any[],
) {
  const headers = [
    "No",
    "연맹",
    "닉네임",

    ...items.map(
      (item) =>
        item.name,
    ),

    "최초 신청시각",
    "최종 수정시각",
  ];

  const rows =
    applications.map(
      (
        application,
        index,
      ) => {
        const quantities =
          new Map<
            number,
            number
          >();

        for (
          const selected
          of (
            application
              .group_buy_application_items ??
            []
          )
        ) {
          quantities.set(
            Number(
              selected
                .item_id,
            ),

            Number(
              selected
                .quantity,
            ),
          );
        }

        /*
          alliance_name을 우선 사용한다.

          연맹이 삭제되어 alliance_id가 NULL이 되어도
          신청 당시 연맹 이름은 alliance_name에 남아 있으므로
          Excel에는 정상적으로 연맹명이 표시된다.

          기존 데이터 호환을 위해 관계의 name을 fallback으로 둔다.
        */
        const allianceName =
          String(
            application
              .alliance_name ??
            application
              .group_buy_alliances
              ?.name ??
            "",
          ).trim();

        const row:
          Record<
            string,
            unknown
          > = {
            No:
              index +
              1,

            연맹:
              allianceName,

            닉네임:
              application
                .player_name,
          };

        for (
          const item
          of items
        ) {
          row[
            item.name
          ] =
            quantities.get(
              Number(
                item.id,
              ),
            ) ?? "";
        }

        row[
          "최초 신청시각"
        ] =
          formatKst(
            application
              .created_at,
          );

        row[
          "최종 수정시각"
        ] =
          formatKst(
            application
              .updated_at,
          );

        return row;
      },
    );

  const worksheet =
    XLSX.utils
      .json_to_sheet(
        rows,
        {
          header:
            headers,

          skipHeader:
            false,
        },
      );

  worksheet[
    "!cols"
  ] = [
    {
      wch:
        7,
    },

    {
      wch:
        18,
    },

    {
      wch:
        24,
    },

    ...items.map(
      () => ({
        wch:
          16,
      }),
    ),

    {
      wch:
        23,
    },

    {
      wch:
        23,
    },
  ];

  const workbook =
    XLSX.utils
      .book_new();

  XLSX.utils
    .book_append_sheet(
      workbook,
      worksheet,
      "Applications",
    );

  const infoSheet =
    XLSX.utils
      .aoa_to_sheet([
        [
          "항목",
          "내용",
        ],

        [
          "Event ID",
          event.id,
        ],

        [
          "회차명",
          event.title,
        ],

        [
          "모집 시작",
          formatKst(
            event.start_at,
          ),
        ],

        [
          "모집 종료",
          formatKst(
            event.end_at,
          ),
        ],

        [
          "신청 인원",
          applications.length,
        ],
      ]);

  infoSheet[
    "!cols"
  ] = [
    {
      wch:
        18,
    },

    {
      wch:
        35,
    },
  ];

  XLSX.utils
    .book_append_sheet(
      workbook,
      infoSheet,
      "Event",
    );

  const arrayBuffer =
    XLSX.write(
      workbook,
      {
        bookType:
          "xlsx",

        type:
          "array",
      },
    );

  return new Uint8Array(
    arrayBuffer,
  );
}

async function createExportLog(
  eventId: number,
  recipientCount: number,
) {
  const {
    data,
    error,
  } =
    await supabase
      .from(
        "group_buy_export_logs",
      )
      .insert({
        event_id:
          eventId,

        status:
          "processing",

        recipient_count:
          recipientCount,

        success_count:
          0,

        failure_count:
          0,
      })
      .select(
        "id",
      )
      .single();

  if (error) {
    throw error;
  }

  return Number(
    data.id,
  );
}

async function createRecipientLog(
  exportLogId: number,
  eventId: number,
  recipient: any,
) {
  const {
    data,
    error,
  } =
    await supabase
      .from(
        "group_buy_export_recipient_logs",
      )
      .insert({
        export_log_id:
          exportLogId,

        event_id:
          eventId,

        recipient_id:
          recipient.id,

        recipient_nickname:
          recipient.nickname,

        recipient_email:
          recipient.email,

        status:
          "processing",
      })
      .select(
        "id",
      )
      .single();

  if (error) {
    throw error;
  }

  return Number(
    data.id,
  );
}

async function markRecipientSuccess(
  logId: number,
) {
  const {
    error,
  } =
    await supabase
      .from(
        "group_buy_export_recipient_logs",
      )
      .update({
        status:
          "success",

        sent_at:
          new Date()
            .toISOString(),

        error_message:
          null,
      })
      .eq(
        "id",
        logId,
      );

  if (error) {
    throw error;
  }
}

async function markRecipientFailed(
  logId: number,
  message: string,
) {
  const {
    error,
  } =
    await supabase
      .from(
        "group_buy_export_recipient_logs",
      )
      .update({
        status:
          "failed",

        error_message:
          message,
      })
      .eq(
        "id",
        logId,
      );

  if (error) {
    console.error(
      "Failed to update recipient log:",
      error,
    );
  }
}

async function updateExportLog(
  logId: number,
  data: {
    status:
      "success" |
      "partial_failure" |
      "failed";

    success_count:
      number;

    failure_count:
      number;

    error_message?:
      string | null;
  },
) {
  const {
    error,
  } =
    await supabase
      .from(
        "group_buy_export_logs",
      )
      .update({
        completed_at:
          new Date()
            .toISOString(),

        status:
          data.status,

        success_count:
          data.success_count,

        failure_count:
          data.failure_count,

        error_message:
          data
            .error_message ??
          null,
      })
      .eq(
        "id",
        logId,
      );

  if (error) {
    console.error(
      "Failed to update export log:",
      error,
    );
  }
}

async function sendEmail(
  recipient: any,
  event: any,
  attachmentBase64: string,
  filename: string,
) {
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
              `S967 Group Buy <${resendFromEmail}>`,

            to: [
              recipient.email,
            ],

            subject:
              `[S967 Group Buy] ${event.title}`,

            html:
`
<div
  style="
    font-family:
      Arial,
      Helvetica,
      sans-serif;
    line-height:
      1.6;
    color:
      #222;
  "
>
  <h2>
    S967 Group Buy
  </h2>

  <p>
    ${escapeHtml(
      recipient.nickname,
    )}님,
  </p>

  <p>
    공동구매 신청 결과 Excel 파일을 첨부합니다.
  </p>

  <p>
    회차:
    <strong>
      ${escapeHtml(
        event.title,
      )}
    </strong>
  </p>

  <p>
    모집 종료:
    ${escapeHtml(
      formatKst(
        event.end_at,
      ),
    )}
    KST
  </p>
</div>
`,

            attachments: [
              {
                filename,

                content:
                  attachmentBase64,
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

  if (!response.ok) {
    throw new Error(
      result?.message ??
      result?.error ??
      `Resend HTTP ${response.status}`,
    );
  }

  return result;
}

async function runExport(
  eventId: number,
  type:
    "manual" |
    "automatic",
) {
  const event =
    await loadEvent(
      eventId,
    );

  if (!event) {
    throw new Error(
      "EVENT_NOT_FOUND",
    );
  }

  if (
    type ===
    "automatic"
  ) {
    const dueAt =
      new Date(
        event.end_at,
      ).getTime() +
      10 *
        60 *
        1000;

    if (
      Date.now() <
      dueAt
    ) {
      throw new Error(
        "NOT_DUE_YET",
      );
    }

    if (
      event
        .export_email_sent_at
    ) {
      return {
        skipped:
          true,

        reason:
          "ALREADY_SENT",

        event_id:
          eventId,
      };
    }
  }

  const [
    items,
    applications,
    recipients,
  ] =
    await Promise.all([
      loadItems(
        eventId,
      ),

      loadApplications(
        eventId,
      ),

      loadRecipients(),
    ]);

  if (
    recipients.length ===
    0
  ) {
    throw new Error(
      "NO_ACTIVE_RECIPIENTS",
    );
  }

  if (
    !resendApiKey
  ) {
    throw new Error(
      "RESEND_API_KEY_NOT_CONFIGURED",
    );
  }

  if (
    !resendFromEmail
  ) {
    throw new Error(
      "RESEND_FROM_EMAIL_NOT_CONFIGURED",
    );
  }

  /*
    자동 발송에서는 이미 성공한 수신자를 제외한다.

    이메일 수신자를 관리자가 삭제하면
    FK ON DELETE CASCADE에 의해 그 수신자의 과거
    recipient log도 삭제되므로, 더 이상 현재 수신자
    목록에도 없고 재시도 대상에도 포함되지 않는다.
  */
  let recipientsToSend =
    recipients;

  if (
    type ===
    "automatic"
  ) {
    const successfulIds =
      await loadSuccessfulRecipientIds(
        eventId,
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
      const {
        error:
          eventCompleteError,
      } =
        await supabase
          .from(
            "group_buy_events",
          )
          .update({
            export_email_sent_at:
              new Date()
                .toISOString(),
          })
          .eq(
            "id",
            eventId,
          )
          .is(
            "export_email_sent_at",
            null,
          );

      if (
        eventCompleteError
      ) {
        throw eventCompleteError;
      }

      return {
        ok:
          true,

        event_id:
          eventId,

        skipped:
          true,

        reason:
          "ALL_RECIPIENTS_ALREADY_SENT",
      };
    }
  }

  const logId =
    await createExportLog(
      eventId,
      recipientsToSend.length,
    );

  let successCount =
    0;

  let failureCount =
    0;

  const failures:
    string[] = [];

  try {
    const bytes =
      createWorkbook(
        event,
        items,
        applications,
      );

    const attachmentBase64 =
      bytesToBase64(
        bytes,
      );

    const filename =
      `S967_Group_Buy_${safeFileName(
        event.title,
      )}_${event.id}.xlsx`;

    for (
      const recipient
      of recipientsToSend
    ) {
      let recipientLogId:
        number | null =
        null;

      try {
        recipientLogId =
          await createRecipientLog(
            logId,
            eventId,
            recipient,
          );

        await sendEmail(
          recipient,
          event,
          attachmentBase64,
          filename,
        );

        await markRecipientSuccess(
          recipientLogId,
        );

        successCount +=
          1;

      } catch (
        error
      ) {
        failureCount +=
          1;

        const message =
          error instanceof
              Error
            ? error.message
            : String(
                error,
              );

        failures.push(
          `${recipient.email}: ${message}`,
        );

        if (
          recipientLogId !==
          null
        ) {
          await markRecipientFailed(
            recipientLogId,
            message,
          );
        }

        console.error(
          "Group Buy recipient send failed:",
          recipient.email,
          error,
        );
      }
    }

    let status:
      "success" |
      "partial_failure" |
      "failed";

    if (
      successCount ===
      recipientsToSend.length
    ) {
      status =
        "success";

    } else if (
      successCount >
      0
    ) {
      status =
        "partial_failure";

    } else {
      status =
        "failed";
    }

    await updateExportLog(
      logId,
      {
        status,

        success_count:
          successCount,

        failure_count:
          failureCount,

        error_message:
          failures.length >
            0
            ? failures.join(
                "\n",
              )
            : null,
      },
    );

    if (
      type ===
      "automatic"
    ) {
      /*
        현재 활성 수신자 전원이 성공했는지 확인한다.

        삭제된 수신자는 현재 recipients 배열에 없으므로
        완료 판정 대상에서도 제외된다.
      */
      const successfulIds =
        await loadSuccessfulRecipientIds(
          eventId,
        );

      const allCurrentRecipientsSent =
        recipients.every(
          (recipient) =>
            successfulIds.has(
              Number(
                recipient.id,
              ),
            ),
        );

      if (
        allCurrentRecipientsSent
      ) {
        const {
          error:
            eventUpdateError,
        } =
          await supabase
            .from(
              "group_buy_events",
            )
            .update({
              export_email_sent_at:
                new Date()
                  .toISOString(),
            })
            .eq(
              "id",
              eventId,
            )
            .is(
              "export_email_sent_at",
              null,
            );

        if (
          eventUpdateError
        ) {
          throw eventUpdateError;
        }
      }
    }

    return {
      ok:
        status ===
        "success",

      event_id:
        eventId,

      event_title:
        event.title,

      type,

      application_count:
        applications.length,

      recipient_count:
        recipientsToSend.length,

      success_count:
        successCount,

      failure_count:
        failureCount,

      skipped_count:
        recipients.length -
        recipientsToSend.length,

      status,

      errors:
        failures,
    };

  } catch (
    error
  ) {
    await updateExportLog(
      logId,
      {
        status:
          "failed",

        success_count:
          successCount,

        failure_count:
          Math.max(
            failureCount,
            recipientsToSend.length -
              successCount,
          ),

        error_message:
          error instanceof
              Error
            ? error.message
            : String(
                error,
              ),
      },
    );

    throw error;
  }
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

    const origin = req.headers.get("origin");
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return json(req, { error: "Origin not allowed." }, 403);
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

    try {
      const body =
        await req
          .json()
          .catch(
            () => ({}),
          );

      const type =
        String(
          body?.type ??
            "",
        )
          .trim()
          .toLowerCase();

      if (type !== "manual" && type !== "automatic") {
        return json(req, { error: "Invalid export type." }, 400);
      }

      if (type === "manual") {
        const admin = await verifyAdminSession(req);
        if (!admin.ok) return json(req, { error: admin.error }, admin.status);
      } else {
        if (!automationSecret) {
          return json(req, { error: "SERVER_CONFIGURATION_ERROR" }, 500);
        }
        const receivedAutomationSecret = req.headers.get("x-automation-secret") ?? "";
        if (receivedAutomationSecret !== automationSecret) {
          return json(req, { error: "UNAUTHORIZED" }, 401);
        }
      }

      /*
        ========================================================
        수동 발송

        관리자가 직접 실행한 수동 발송은
        기존 성공 로그와 무관하게 현재 활성 수신자에게 다시 보낸다.
        ========================================================
      */
      if (
        type ===
        "manual"
      ) {
        const eventId =
          Number(
            body?.event_id,
          );

        if (
          !Number.isSafeInteger(
            eventId,
          ) ||
          eventId <= 0
        ) {
          return json(req,
            {
              error:
                "Invalid event.",
            },
            400,
          );
        }

        const result =
          await runExport(
            eventId,
            "manual",
          );

        return json(req,
          result,
          200,
        );
      }

      /*
        ========================================================
        자동 발송

        종료 후 10분이 지난 회차 중
        export_email_sent_at이 없는 회차를 찾아 처리한다.
        ========================================================
      */
      if (
        type ===
        "automatic"
      ) {
        const dueBefore =
          new Date(
            Date.now() -
              10 *
                60 *
                1000,
          )
            .toISOString();

        const {
          data:
            dueEvents,
          error:
            dueError,
        } =
          await supabase
            .from(
              "group_buy_events",
            )
            .select(
              "id,title,end_at,export_email_sent_at",
            )
            .lte(
              "end_at",
              dueBefore,
            )
            .is(
              "export_email_sent_at",
              null,
            )
            .order(
              "end_at",
              {
                ascending:
                  true,
              },
            )
            .limit(
              10,
            );

        if (
          dueError
        ) {
          throw dueError;
        }

        if (
          !dueEvents ||
          dueEvents.length ===
            0
        ) {
          return json(req,{
            ok:
              true,

            processed:
              0,

            results:
              [],
          });
        }

        const results:
          unknown[] = [];

        for (
          const event
          of dueEvents
        ) {
          try {
            const result =
              await runExport(
                Number(
                  event.id,
                ),
                "automatic",
              );

            results.push(
              result,
            );

          } catch (
            error
          ) {
            console.error(
              "Automatic export failed:",
              event.id,
              error,
            );

            results.push({
              ok:
                false,

              event_id:
                event.id,

              error:
                error instanceof
                    Error
                  ? error.message
                  : String(
                      error,
                    ),
            });
          }
        }

        return json(req,{
          ok:
            true,

          processed:
            results.length,

          results,
        });
      }

      return json(req,
        {
          error:
            "Invalid export type.",
        },
        400,
      );

    } catch (
      error
    ) {
      console.error(
        "Group Buy export failed:",
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
