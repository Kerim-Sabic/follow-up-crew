import { priceSchema, requestTariffSchema, type MissionSpec, type Price } from "./mission-domain";

export type CostProjection = {
  minimumNanos: string | null;
  reservationCeilingNanos: string | null;
  assumptions: string[];
};

export function deepSeekReservation(price: Price): bigint {
  const inputRate =
    BigInt(price.missNanosPerMillion) > BigInt(price.hitNanosPerMillion)
      ? BigInt(price.missNanosPerMillion)
      : BigInt(price.hitNanosPerMillion);
  return (
    (16_000n * inputRate + 1_024n * BigInt(price.outputNanosPerMillion) + 999_999n) / 1_000_000n
  );
}

export function projectMissionCost(
  spec: MissionSpec,
  useAi: boolean,
  configurations: Partial<Record<"brave" | "modash" | "deepseek", Record<string, unknown>>>,
  now = Date.now(),
): CostProjection {
  const assumptions: string[] = [];
  let minimum = 0n;
  let ceiling = 0n;
  let minimumKnown = true;
  let ceilingKnown = true;
  if (spec.source !== "user_import") {
    const config = configurations[spec.source];
    const requests = spec.source === "brave" ? 1 : 1 + 2 * spec.targetCount;
    const reserved = config?.["requestCeilingNanos"];
    if (typeof reserved === "string" && /^[1-9]\d*$/.test(reserved)) {
      ceiling += BigInt(requests) * BigInt(reserved);
      assumptions.push(
        `${spec.source}: up to ${requests} reserved requests at the configured per-request ceiling`,
      );
    } else {
      ceilingKnown = false;
      assumptions.push(
        `${spec.source}: configure a request ceiling before the cost range can be shown`,
      );
    }
    const tariff = requestTariffSchema.safeParse(config?.["tariff"]);
    if (
      tariff.success &&
      Date.parse(tariff.data.effectiveAt) <= now &&
      now < Date.parse(tariff.data.expiresAt)
    ) {
      minimum += BigInt(tariff.data.nanosPerRequest);
      assumptions.push(
        "The lower amount includes one discovery request at the reviewed tariff; further verification depends on yield",
      );
    } else {
      minimumKnown = false;
      assumptions.push(
        "A current documented tariff is missing; actual provider billing is unresolved",
      );
    }
  }
  if (useAi) {
    const parsed = priceSchema.safeParse(configurations.deepseek?.["pricing"]);
    if (
      parsed.success &&
      Date.parse(parsed.data.effectiveAt) <= now &&
      now < Date.parse(parsed.data.expiresAt)
    ) {
      ceiling += BigInt(spec.reviewLimit) * deepSeekReservation(parsed.data);
      assumptions.push(
        `DeepSeek: at most ${spec.reviewLimit} opportunity calls; each reserves the configured token ceiling`,
      );
    } else {
      ceilingKnown = false;
      assumptions.push("Current DeepSeek model pricing is required to project AI exposure");
    }
  }
  if (!useAi && spec.source === "user_import")
    assumptions.push("No external provider call is planned for this imported mission");
  return {
    minimumNanos: minimumKnown ? minimum.toString() : null,
    reservationCeilingNanos: ceilingKnown ? ceiling.toString() : null,
    assumptions,
  };
}
