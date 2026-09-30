import { z } from "zod";

export const missionSchema = z
  .object({
    version: z.literal(1),
    objective: z.string().trim().min(10).max(2000),
    platform: z.literal("instagram"),
    minFollowers: z.number().int().min(0).max(1_000_000_000),
    maxFollowers: z.number().int().min(1).max(1_000_000_000),
    language: z.string().min(2).max(30),
    requireNoLink: z.boolean(),
    freshnessHours: z.number().int().min(1).max(720),
    postedWithinDays: z.number().int().min(1).max(365),
    targetCount: z.number().int().min(1).max(200),
    reviewLimit: z.number().int().min(1).max(20),
    draftLimit: z.number().int().min(0).max(5),
    budgetNanos: z.number().int().min(0).max(1_000_000_000_000),
    currency: z.literal("USD"),
    source: z.enum(["user_import", "brave", "modash"]),
    query: z.string().max(300),
    productConcept: z.string().max(500),
    autonomy: z.enum(["inspect", "research"]),
  })
  .strict()
  .refine((x) => x.minFollowers <= x.maxFollowers, "Follower interval is reversed");
export type MissionSpec = z.infer<typeof missionSchema>;
export function compileBrief(brief: string): {
  suggestions: Partial<MissionSpec>;
  explanations: string[];
} {
  const suggestions: Partial<MissionSpec> = {};
  const explanations: string[] = [];
  const normalized = brief.replaceAll("\u00a0", " ");
  const range = normalized.match(
    /(?:between\s+)?([\d,]+)\s*(?:-|–|—|to|and)\s*([\d,]+)\s*(?:followers|follower)/i,
  );
  if (range) {
    const min = Number(range[1]!.replaceAll(",", ""));
    const max = Number(range[2]!.replaceAll(",", ""));
    if (
      Number.isSafeInteger(min) &&
      Number.isSafeInteger(max) &&
      min >= 0 &&
      max >= min &&
      max <= 1_000_000_000
    ) {
      suggestions.minFollowers = min;
      suggestions.maxFollowers = max;
      explanations.push(`Follower range: ${min.toLocaleString()}–${max.toLocaleString()}`);
    }
  }
  const language = normalized.match(/\b(English|Spanish|French|German|Arabic|Bosnian)-speaking\b/i);
  if (language) {
    suggestions.language = language[1]![0]!.toUpperCase() + language[1]!.slice(1).toLowerCase();
    explanations.push(`Content language: ${suggestions.language}`);
  }
  if (/\b(?:no|without|absence of)\s+(?:bio\s*)?links?\b/i.test(normalized)) {
    suggestions.requireNoLink = true;
    explanations.push("Require verified absence of all bio links");
  }
  const budget = normalized.match(
    /\b(?:budget|spend|maximum expense)\s*(?:of|is|:)?\s*\$\s*(\d+(?:\.\d{1,2})?)\b/i,
  );
  if (budget) {
    const nanos =
      BigInt(budget[1]!.split(".")[0]!) * 1_000_000_000n +
      BigInt((budget[1]!.split(".")[1] ?? "").padEnd(2, "0")) * 10_000_000n;
    if (nanos <= 1_000_000_000_000n) {
      suggestions.budgetNanos = Number(nanos);
      explanations.push(`Maximum external spend: $${budget[1]}`);
    }
  }
  if (!explanations.length)
    explanations.push("No hard fields recognized. Set the fields below before approval.");
  return { suggestions, explanations };
}
const httpsUrl = z
  .string()
  .url()
  .refine((x) => new URL(x).protocol === "https:", "HTTPS source required");
export const observationSchema = z
  .object({
    handle: z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9._]{1,30}$/)
      .transform((x) => x.toLowerCase()),
    sourceUrl: httpsUrl,
    observedAt: z.string().datetime(),
    followers: z.number().int().nonnegative().nullable(),
    exactFollowers: z.boolean(),
    bioLinks: z.enum(["PRESENT", "ABSENT_VERIFIED", "UNKNOWN"]),
    allLinkFieldsChecked: z.boolean(),
    language: z.string().nullable(),
    lastPostAt: z.string().datetime().nullable(),
    teachingTopic: z.string().max(200).nullable(),
    contentExcerpt: z.string().max(1000).nullable(),
    contentUrl: httpsUrl.nullable(),
    method: z.enum(["human_observation", "search_result", "provider_observation"]),
    rightsAttested: z.boolean(),
    adultStatus: z.enum(["adult", "minor", "unknown"]),
    offers: z.string().max(500).default("Unknown; no-link is not evidence of no monetization"),
  })
  .strict();
export type Observation = z.infer<typeof observationSchema>;
export function qualify(s: MissionSpec, o: Observation, now = Date.now()) {
  const failures: string[] = [];
  const unknowns: string[] = [];
  const age = (now - Date.parse(o.observedAt)) / 3_600_000;
  if (age < 0 || age > s.freshnessHours)
    unknowns.push("Profile observation is stale or future-dated");
  if (!o.rightsAttested) unknowns.push("Source usage rights not confirmed");
  if (o.method === "search_result") unknowns.push("Search result is discovery only");
  if (o.followers === null || !o.exactFollowers) unknowns.push("Follower count missing or rounded");
  else if (o.followers < s.minFollowers || o.followers > s.maxFollowers)
    failures.push("Follower count outside hard limits");
  if (s.requireNoLink) {
    if (o.bioLinks === "PRESENT") failures.push("Bio link observed");
    else if (o.bioLinks !== "ABSENT_VERIFIED" || !o.allLinkFieldsChecked)
      unknowns.push("Absence of ALL bio links not verified");
  }
  if (!o.language) unknowns.push("Content language unresolved");
  else if (o.language.toLowerCase() !== s.language.toLowerCase())
    failures.push("Content language mismatch");
  if (!o.lastPostAt || Date.parse(o.lastPostAt) > now) unknowns.push("Posting date unresolved");
  else if (now - Date.parse(o.lastPostAt) > s.postedWithinDays * 86_400_000)
    failures.push("Posting recency outside hard limit");
  if (o.adultStatus === "minor") failures.push("Known minor: no outreach");
  if (o.adultStatus === "unknown") unknowns.push("Adult eligibility needs review");
  if (!o.teachingTopic || !o.contentExcerpt || !o.contentUrl)
    unknowns.push("Teaching expertise needs content evidence");
  return {
    status: failures.length
      ? ("failed" as const)
      : unknowns.length
        ? ("unresolved" as const)
        : ("passed" as const),
    reasons: [...failures, ...unknowns],
  };
}
export function opportunity(s: MissionSpec, o: Observation) {
  return {
    label: "Unvalidated product hypothesis",
    audience: `People learning ${o.teachingTopic ?? "this skill"}`,
    problem: "Whether learners need guided practice remains to be validated.",
    concept:
      s.productConcept || `A practical workshop about ${o.teachingTopic ?? "the observed topic"}`,
    creatorContribution: "Proposed: expertise, demonstrations and review. Not agreed.",
    operatorContribution: "Proposed: learner interviews, production and launch operations.",
    evidence: o.contentUrl,
    validation:
      "Interview five willing learners about their last attempt, test one lesson, then request explicit purchase interest.",
    risks: [
      "No demonstrated willingness to pay",
      "Creator interest and commercial terms are unknown",
      o.offers,
    ],
  };
}
export function composeDraft(o: Observation) {
  // Fixed extractive template: untrusted source text cannot become instructions or introduce additional claims.
  if (!o.contentExcerpt || !o.contentUrl || suspicious(o.contentExcerpt))
    throw new Error("Content needs human review before personalization");
  const excerpt = o.contentExcerpt.replace(/\s+/g, " ").trim().slice(0, 240);
  const body = `Hello @${o.handle}, your published content includes: “${excerpt}”. Would you be open to discussing a small practical workshop and testing the idea with interested learners? We would agree the scope and terms together.`;
  return { body, claims: [{ quote: excerpt, sourceUrl: o.contentUrl }], templateVersion: 1 };
}
export function genericDraft(o: Observation) {
  return `Hello @${o.handle}, would you be open to discussing a small practical workshop and testing the idea with interested learners? We would agree the scope and terms together.`;
}
export function suspicious(value: string) {
  return /ignore.{0,40}(instruction|previous)|system\s*:|api.?key|export.{0,20}leads|change.{0,20}budget|reveal.{0,20}secret/i.test(
    value,
  );
}
export function checkDraft(body: string, o: Observation) {
  try {
    return body === composeDraft(o).body || body === genericDraft(o);
  } catch {
    return body === genericDraft(o);
  }
}
export function analyzeDraft(body: string, o: Observation) {
  if (body === genericDraft(o))
    return {
      status: "SUPPORTED" as const,
      explanation:
        "Generic invitation contains no content-specific claim; the handle matches this observation.",
    };
  if (checkDraft(body, o))
    return {
      status: "SUPPORTED" as const,
      explanation: "The exact content excerpt maps to the recorded source URL and observation.",
    };
  return {
    status: "UNSUPPORTED" as const,
    explanation:
      "Edited wording contains a claim or phrasing outside the deterministic evidence mapping. Remove it or use a supported version before approval.",
  };
}
export const priceSchema = z.object({
  version: z.string().min(1),
  model: z.string().min(1),
  effectiveAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  hitNanosPerMillion: z.string().regex(/^\d+$/),
  missNanosPerMillion: z.string().regex(/^\d+$/),
  outputNanosPerMillion: z.string().regex(/^\d+$/),
  sourceUrl: httpsUrl,
});
export const requestTariffSchema = z.object({
  nanosPerRequest: z.string().regex(/^\d+$/),
  sourceUrl: httpsUrl,
  effectiveAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});
export type Price = z.infer<typeof priceSchema>;
export function usageCost(usage: unknown, price: Price): bigint | null {
  const parsed = z
    .object({
      prompt_tokens: z.number().int().nonnegative(),
      prompt_cache_hit_tokens: z.number().int().nonnegative(),
      prompt_cache_miss_tokens: z.number().int().nonnegative(),
      completion_tokens: z.number().int().nonnegative(),
    })
    .safeParse(usage);
  if (!parsed.success) return null;
  const u = parsed.data;
  if (u.prompt_cache_hit_tokens + u.prompt_cache_miss_tokens !== u.prompt_tokens) return null;
  const numerator =
    BigInt(u.prompt_cache_hit_tokens) * BigInt(price.hitNanosPerMillion) +
    BigInt(u.prompt_cache_miss_tokens) * BigInt(price.missNanosPerMillion) +
    BigInt(u.completion_tokens) * BigInt(price.outputNanosPerMillion);
  return (numerator + 999_999n) / 1_000_000n;
}

export function parseCsv(text: string): Observation[] {
  if (text.length > 1_000_000) throw new Error("Import at most 1 MB per mission");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" && !quoted) {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("Unclosed CSV quotation");
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  const header = rows.shift()?.map((x) => x.trim().replace(/^\uFEFF/, ""));
  if (!header) throw new Error("CSV header required");
  if (rows.length > 200) throw new Error("Import at most 200 candidates per bounded mission");
  return rows
    .filter((r) => r.some(Boolean))
    .map((r, i) => {
      const v = Object.fromEntries(header.map((h, j) => [h, r[j] ?? ""]));
      const result = observationSchema.safeParse({
        handle: v["handle"],
        sourceUrl: v["sourceUrl"],
        observedAt: v["observedAt"],
        followers: v["followers"] ? Number(v["followers"]) : null,
        exactFollowers: v["exactFollowers"] === "true",
        bioLinks: v["bioLinks"] || "UNKNOWN",
        allLinkFieldsChecked: v["allLinkFieldsChecked"] === "true",
        language: v["language"] || null,
        lastPostAt: v["lastPostAt"] || null,
        teachingTopic: v["teachingTopic"] || null,
        contentExcerpt: v["contentExcerpt"] || null,
        contentUrl: v["contentUrl"] || null,
        method: "human_observation",
        rightsAttested: v["rightsAttested"] === "true",
        adultStatus: v["adultStatus"] || "unknown",
        offers: v["offers"] || "Unknown",
      });
      if (!result.success)
        throw new Error(
          `CSV row ${i + 2}: ${result.error.issues.map((x) => x.path.join(".") + ": " + x.message).join("; ")}`,
        );
      return result.data;
    });
}
