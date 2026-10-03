import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRawEmail, headerOf, plainTextOf } from "../src/server/mail-message";

const message = {
  to: "recipient@example.test",
  from: "sender@example.test",
  fromName: "Sender",
  subject: "A question",
  body: "A normal body\nwith two lines.",
  inReplyTo: "<message@example.test>",
  references: "<older@example.test>",
};

test("normal and Unicode email headers/body retain their contents and reply metadata", () => {
  const raw = Buffer.from(buildRawEmail(message), "base64url").toString("utf8");
  assert.match(raw, /To: recipient@example.test\r\nFrom: Sender <sender@example.test>/);
  assert.match(raw, /In-Reply-To: <message@example.test>\r\nReferences: <older@example.test>/);
  assert.ok(raw.endsWith(message.body));
  const unicode = Buffer.from(
    buildRawEmail({ ...message, subject: "Pozdrav 🌍", body: "Ćao!" }),
    "base64url",
  ).toString("utf8");
  assert.ok(
    unicode.includes(`Subject: =?UTF-8?B?${Buffer.from("Pozdrav 🌍").toString("base64")}?=`),
  );
  assert.ok(unicode.endsWith("Ćao!"));
});

test("reject header injection in every supplied header while permitting newlines in the body", () => {
  for (const field of ["to", "from", "fromName", "subject", "inReplyTo", "references"] as const) {
    for (const unsafe of ["ok\r\nBcc: other@example.test", "ok\nextra", "ok\0extra"]) {
      assert.throws(
        () => buildRawEmail({ ...message, [field]: unsafe }),
        /control characters/,
        field,
      );
    }
  }
  assert.throws(() => buildRawEmail({ ...message, to: " " }), /recipient/);
  assert.doesNotThrow(() => buildRawEmail({ ...message, body: "hello\r\nBcc: this is body text" }));
});

test("nested multipart messages prefer plain text; HTML-only mail uses its readable snippet", () => {
  const encode = (value: string) => Buffer.from(value).toString("base64url");
  assert.equal(
    plainTextOf({
      payload: {
        mimeType: "multipart/mixed",
        parts: [
          { mimeType: "text/html", body: { data: encode("<b>HTML</b>") } },
          {
            mimeType: "multipart/alternative",
            parts: [{ mimeType: "text/plain", body: { data: encode("Readable ćao") } }],
          },
        ],
      },
    }),
    "Readable ćao",
  );
  assert.equal(
    plainTextOf({
      payload: { mimeType: "text/html", body: { data: encode("<b>HTML</b>") } },
      snippet: "Readable HTML",
    }),
    "Readable HTML",
  );
  assert.equal(plainTextOf({}), "");
  assert.equal(
    headerOf({ payload: { headers: [{ name: "MESSAGE-ID", value: "id" }] } }, "Message-ID"),
    "id",
  );
});
