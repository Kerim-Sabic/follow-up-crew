export type GmailPart = {
  mimeType?: string;
  body?: { data?: string };
  headers?: { name: string; value: string }[];
  parts?: GmailPart[];
};

export type GmailMessage = {
  id?: string;
  threadId?: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailPart;
};

export type GmailThread = { messages?: GmailMessage[] };
export type GmailSendResult = { id: string; threadId?: string };

const b64 = (value: string) => Buffer.from(value, "utf8").toString("base64");

function safeHeader(value: string) {
  if (
    [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  ) {
    throw new Error("Email headers must not contain control characters.");
  }
  return value;
}

function headerValue(value: string) {
  safeHeader(value);
  return [...value].every((character) => character.charCodeAt(0) < 128)
    ? value
    : `=?UTF-8?B?${b64(value)}?=`;
}

export function buildRawEmail(opts: {
  to: string;
  from?: string | null;
  fromName?: string | null;
  subject: string;
  body: string;
  inReplyTo?: string | null;
  references?: string | null;
}) {
  if (!opts.to.trim()) throw new Error("An email recipient is required.");
  const lines = [`To: ${safeHeader(opts.to)}`];
  if (opts.from) {
    const from = safeHeader(opts.from);
    lines.push(opts.fromName ? `From: ${headerValue(opts.fromName)} <${from}>` : `From: ${from}`);
  }
  lines.push(`Subject: ${headerValue(opts.subject)}`);
  if (opts.inReplyTo) {
    lines.push(
      `In-Reply-To: ${safeHeader(opts.inReplyTo)}`,
      `References: ${safeHeader(opts.references ?? opts.inReplyTo)}`,
    );
  }
  lines.push("MIME-Version: 1.0", 'Content-Type: text/plain; charset="UTF-8"', "", opts.body);
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

export function headerOf(message: GmailMessage, name: string): string {
  return (
    message.payload?.headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())
      ?.value ?? ""
  );
}

/** Prefer nested plain text; an HTML-only message uses Gmail's readable snippet. */
export function plainTextOf(message: GmailMessage): string {
  const walk = (part: GmailPart | undefined): string => {
    if (!part) return "";
    if (part.mimeType === "text/plain" && part.body?.data) {
      return Buffer.from(part.body.data, "base64url").toString("utf8");
    }
    for (const child of part.parts ?? []) {
      const found = walk(child);
      if (found) return found;
    }
    return "";
  };
  return walk(message.payload).trim() || message.snippet || "";
}
