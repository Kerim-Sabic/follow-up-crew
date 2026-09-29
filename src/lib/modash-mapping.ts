import { z } from "zod";
import type { Observation } from "./mission-domain";
// Contract: https://docs.modash.io/_bundle/products/raw_api/openapi_doc/raw.json
// All three link surfaces are optional in upstream schema; missing is NEVER absence.
export function mapModashProfile(
  raw: unknown,
  handle: string,
  coverageReviewed: boolean,
  observedAt: string,
): Observation {
  const p = z
    .object({
      pk: z.string(),
      username: z.string(),
      follower_count: z.number().int().nonnegative(),
      external_url: z.string().optional(),
      bio_links: z.array(z.object({ url: z.string() })).optional(),
      fb_profile_biolink: z.object({ url: z.string() }).nullable().optional(),
      is_private: z.boolean().optional(),
    })
    .parse(raw);
  if (p.username.toLowerCase() !== handle.toLowerCase())
    throw new Error("Provider identity changed; human alias review required");
  const present = Boolean(
    p.external_url?.trim() ||
    p.bio_links?.some((l) => l.url.trim()) ||
    p.fb_profile_biolink?.url.trim(),
  );
  const complete =
    coverageReviewed &&
    p.external_url !== undefined &&
    p.bio_links !== undefined &&
    p.fb_profile_biolink !== undefined &&
    p.is_private === false;
  return {
    handle: p.username.toLowerCase(),
    sourceUrl: `https://www.instagram.com/${p.username}/`,
    observedAt,
    followers: p.follower_count,
    exactFollowers: true,
    bioLinks: present ? "PRESENT" : complete ? "ABSENT_VERIFIED" : "UNKNOWN",
    allLinkFieldsChecked: complete,
    language: null,
    lastPostAt: null,
    teachingTopic: null,
    contentExcerpt: null,
    contentUrl: null,
    method: "provider_observation",
    rightsAttested: true,
    adultStatus: "unknown",
    offers: "Unresolved; no bio link does not establish absence of monetization",
  };
}
export function addModashContent(observation: Observation, raw: unknown): Observation {
  const feed = z
    .object({
      items: z.array(
        z.object({
          code: z.string().optional(),
          taken_at: z.number().optional(),
          caption: z.object({ text: z.string() }).nullable().optional(),
        }),
      ),
    })
    .parse(raw);
  const item = feed.items
    .filter((i) => i.taken_at && i.code && i.caption?.text)
    .sort((a, b) => (b.taken_at ?? 0) - (a.taken_at ?? 0))[0];
  if (!item?.taken_at || !item.code || !item.caption?.text) return observation;
  return {
    ...observation,
    lastPostAt: new Date(item.taken_at * 1000).toISOString(),
    contentExcerpt: item.caption.text.slice(0, 1000),
    contentUrl: `https://www.instagram.com/p/${encodeURIComponent(item.code)}/`,
  };
}
