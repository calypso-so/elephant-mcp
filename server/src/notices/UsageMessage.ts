import type { ToolCall } from "./UsageNotices.js";

/**
 * The tools worth a line in the operator channel: the ones that carry a
 * question or change knowledge. The two inventory tools clients call on
 * their own (`elephant-list-buckets`, `elephant-open-source`) stay quiet.
 */
export const NOTICED_TOOLS: ReadonlySet<string> = new Set([
  "elephant-ask",
  "elephant-search",
  "elephant-add-file",
  "elephant-add-files",
  "elephant-add-website",
  "elephant-create-bucket",
  "elephant-rename-bucket",
  "elephant-move-sources",
]);

export type SlackMessage = {
  text: string;
  blocks: Record<string, unknown>[];
};

export type ServerIdentity = {
  readonly version: string;
  readonly publicBaseUrl: string;
};

const TEXT_LIMIT = 500;
/** Slack's limit for one section field: label, newline and escaped value together. */
const FIELD_TEXT_LIMIT = 2000;

/**
 * Builds the Slack post for one call, or null when the tool is not noticed.
 * Only the caller's own input and a status leave the server: nothing from
 * the tool's result or from the Calypso API is included (the same rule the
 * tools' views follow).
 */
export function buildUsageMessage(
  call: ToolCall,
  server: ServerIdentity,
  dropped = 0,
): SlackMessage | null {
  if (!NOTICED_TOOLS.has(call.tool)) return null;

  const summary = summarizeArgs(call.tool, call.args);
  const outcome =
    call.outcome === "ok"
      ? `ok · ${formatDuration(call.durationMs)}`
      : `error · ${formatDuration(call.durationMs)}`;
  const caller = describeCaller(call);
  const headline = summary.headline ? ` · ${summary.headline}` : "";

  const fields = [
    ...summary.fields,
    { label: "Outcome", value: outcome },
    { label: "Caller", value: caller },
    {
      label: "Scopes",
      value: call.scopes.length ? call.scopes.join(" ") : "api key (all)",
    },
    {
      label: "Server",
      value: `${server.version} · ${hostOf(server.publicBaseUrl)}`,
    },
  ];
  if (dropped > 0) {
    fields.push({
      label: "Dropped",
      value: `${dropped} earlier notice${dropped === 1 ? "" : "s"} over the post budget`,
    });
  }

  return {
    // Escaped like the fields: the headline is the caller's own text.
    text: escapeMrkdwn(`Elephant used · ${call.tool}${headline} · ${caller}`),
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: truncate(`🐘 Elephant used · ${call.tool}`, 150),
          emoji: true,
        },
      },
      ...fieldSections(fields),
    ],
  };
}

type Field = { label: string; value: string };

function summarizeArgs(
  tool: string,
  args: unknown,
): { headline: string; fields: Field[] } {
  const input = isRecord(args) ? args : {};
  const text = (key: string) => asString(input[key]);
  const list = (key: string) => asStringList(input[key]);
  const fields: Field[] = [];
  let headline = "";

  switch (tool) {
    case "elephant-ask": {
      headline = text("prompt");
      fields.push({ label: "Question", value: quote(headline) });
      fields.push({ label: "Agent", value: text("model") });
      fields.push({ label: "Buckets", value: list("buckets").join(", ") });
      fields.push({ label: "Depth", value: text("depth") });
      fields.push({ label: "Pinned sources", value: countOf(list("fileIds")) });
      break;
    }
    case "elephant-search": {
      headline = text("query");
      fields.push({ label: "Query", value: quote(headline) });
      fields.push({ label: "Agent", value: text("agent") });
      fields.push({ label: "Buckets", value: list("buckets").join(", ") });
      fields.push({ label: "Depth", value: text("depth") });
      break;
    }
    case "elephant-add-file": {
      const file = isRecord(input.file) ? asString(input.file.filename) : "";
      headline = text("filename") || file || text("sourceUrl");
      fields.push({ label: "File", value: headline });
      fields.push({ label: "Buckets", value: bucketTargets(input) });
      break;
    }
    case "elephant-add-files": {
      const items = Array.isArray(input.items) ? input.items : [];
      const names = items
        .map((item) => (isRecord(item) ? asString(item.filename) : ""))
        .filter(Boolean);
      headline = `${items.length} file${items.length === 1 ? "" : "s"}`;
      fields.push({
        label: "Files",
        value: `${headline}${names.length ? `: ${names.join(", ")}` : ""}`,
      });
      fields.push({ label: "Buckets", value: bucketTargets(input) });
      break;
    }
    case "elephant-add-website": {
      headline = text("url");
      fields.push({ label: "Website", value: headline });
      fields.push({ label: "Buckets", value: bucketTargets(input) });
      break;
    }
    case "elephant-create-bucket": {
      headline = text("name");
      fields.push({ label: "Bucket", value: headline });
      fields.push({ label: "Slug", value: text("slug") });
      break;
    }
    case "elephant-rename-bucket": {
      headline = text("name");
      fields.push({ label: "Bucket", value: text("bucket") });
      fields.push({ label: "New name", value: headline });
      break;
    }
    case "elephant-move-sources": {
      const sources = list("sourceIds").length;
      headline = `${sources} source${sources === 1 ? "" : "s"}`;
      fields.push({ label: "Sources", value: headline });
      fields.push({ label: "From bucket", value: text("fromBucket") });
      fields.push({ label: "To bucket", value: text("toBucket") });
      break;
    }
    default:
      break;
  }

  return { headline: truncate(headline, 120), fields };
}

/** The destination as the caller named it: `bucket`, `bucketSlugs` or `bucketIds` (schemaParts). */
function bucketTargets(input: Record<string, unknown>): string {
  return [
    asString(input.bucket),
    ...asStringList(input.bucketSlugs),
    ...asStringList(input.bucketIds),
  ]
    .filter(Boolean)
    .join(", ");
}

function describeCaller(call: ToolCall): string {
  const parts = [call.principal];
  if (call.grant?.team) parts.push(`team ${call.grant.team}`);
  if (call.grant?.cid) parts.push(`client ${call.grant.cid}`);
  if (call.grant?.sub) parts.push(`person ${call.grant.sub.slice(0, 8)}…`);
  return parts.join(" · ");
}

function fieldSections(fields: Field[]): Record<string, unknown>[] {
  const present = fields
    .map((field) => ({ label: field.label, value: field.value.trim() }))
    .filter((field) => field.value);
  const blocks: Record<string, unknown>[] = [];
  for (let start = 0; start < present.length; start += 10) {
    blocks.push({
      type: "section",
      fields: present.slice(start, start + 10).map((field) => {
        const label = `*${escapeMrkdwn(field.label)}*\n`;
        return {
          type: "mrkdwn",
          text:
            label +
            fitEscaped(
              truncate(field.value, TEXT_LIMIT),
              FIELD_TEXT_LIMIT - label.length,
            ),
        };
      }),
    });
  }
  return blocks;
}

function quote(value: string): string {
  return value ? `“${truncate(value, TEXT_LIMIT)}”` : "";
}

function countOf(values: string[]): string {
  return values.length ? String(values.length) : "";
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function truncate(value: string, max: number): string {
  const normalized = value.trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * `value` escaped and cut so the escaped text fits `budget`: escaping expands
 * (`&` becomes five characters), so a value cut before escaping can still
 * pass a Slack limit. Cuts between characters, never inside an entity.
 */
function fitEscaped(value: string, budget: number): string {
  const whole = escapeMrkdwn(value);
  if (whole.length <= budget) return whole;
  let used = 0;
  let end = 0;
  for (const char of value) {
    const escaped = escapeMrkdwn(char);
    if (used + escaped.length > budget - 1) break;
    used += escaped.length;
    end += char.length;
  }
  return `${escapeMrkdwn(value.slice(0, end).trimEnd())}…`;
}

function escapeMrkdwn(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
