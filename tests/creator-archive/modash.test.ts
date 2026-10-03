import { test } from "node:test";
import assert from "node:assert/strict";
import { mapModashProfile, addModashContent } from "../../src/lib/modash-mapping";
test("Modash contract fixture: optional fields, partial payloads and unreviewed coverage never imply link absence", () => {
  const base = {
    pk: "fixture-id",
    username: "fixture_modash",
    follower_count: 22000,
    external_url: "",
    is_private: false,
  };
  const map = (data: unknown, reviewed = true) =>
    mapModashProfile(data, "fixture_modash", reviewed, "2026-09-29T00:00:00Z");
  assert.equal(map(base).bioLinks, "UNKNOWN");
  const full = { ...base, bio_links: [], fb_profile_biolink: null };
  assert.equal(map(full).bioLinks, "ABSENT_VERIFIED");
  assert.equal(map(full, false).bioLinks, "UNKNOWN");
  assert.equal(
    map({ ...full, bio_links: [{ url: "https://example.test/offer" }] }).bioLinks,
    "PRESENT",
  );
  assert.equal(
    map({ ...full, fb_profile_biolink: { url: "https://example.test/profile" } }).bioLinks,
    "PRESENT",
  );
  assert.throws(() => map({ ...base, username: "different_identity" }));
  const enriched = addModashContent(map(full), {
    items: [
      {
        code: "FIXTURE",
        taken_at: 1790640000,
        caption: { text: "Synthetic contract fixture teaching excerpt" },
      },
    ],
  });
  assert.equal(enriched.language, null);
  assert.equal(enriched.adultStatus, "unknown");
  assert.equal(enriched.contentUrl, "https://www.instagram.com/p/FIXTURE/");
});
