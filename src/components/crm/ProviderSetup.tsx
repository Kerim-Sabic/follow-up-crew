import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { nanosToUsd, usdToNanos } from "@/lib/money";

type Provider = "deepseek" | "brave" | "modash";
type Connection = {
  provider: Provider;
  fingerprint: string;
  models: string[];
  rights_confirmed: boolean;
  validated_at: string | null;
  configuration: Record<string, unknown>;
};
const field = "mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm";
const label = "block text-sm";

export function ProviderSetup({
  connections,
  admin,
  busy,
  run,
}: {
  connections: Connection[];
  admin: boolean;
  busy: boolean;
  run: (
    command: Record<string, unknown>,
    message?: string,
  ) => Promise<Record<string, unknown> | null>;
}) {
  const [provider, setProvider] = useState<Provider>("deepseek");
  const [secret, setSecret] = useState("");
  const [rights, setRights] = useState(false);
  const [model, setModel] = useState("");
  const [version, setVersion] = useState("");
  const [effective, setEffective] = useState("");
  const [expires, setExpires] = useState("");
  const [hit, setHit] = useState("");
  const [miss, setMiss] = useState("");
  const [output, setOutput] = useState("");
  const [source, setSource] = useState("");
  const [requestCeiling, setRequestCeiling] = useState("");
  const [tariff, setTariff] = useState("");
  const [rawAccess, setRawAccess] = useState(false);
  const [linkCoverage, setLinkCoverage] = useState(false);
  const connected = connections.find((item) => item.provider === provider);

  function configuration() {
    if (provider === "deepseek") {
      if (!connected?.models.includes(model))
        throw new Error("Discover models with this key, then select a listed model");
      if (!effective || !expires || Date.parse(effective) >= Date.parse(expires))
        throw new Error("Enter an effective date before the expiry date");
      return {
        pricing: {
          version: version.trim(),
          model,
          effectiveAt: new Date(effective).toISOString(),
          expiresAt: new Date(expires).toISOString(),
          hitNanosPerMillion: usdToNanos(hit),
          missNanosPerMillion: usdToNanos(miss),
          outputNanosPerMillion: usdToNanos(output),
          sourceUrl: source.trim(),
        },
      };
    }
    if (usdToNanos(requestCeiling) === "0")
      throw new Error("A positive per-request ceiling is required");
    const result: Record<string, unknown> = {
      requestCeilingNanos: usdToNanos(requestCeiling),
    };
    if (tariff) {
      if (!source || !effective || !expires || Date.parse(effective) >= Date.parse(expires))
        throw new Error("A tariff estimate needs its source and effective dates");
      result["tariff"] = {
        nanosPerRequest: usdToNanos(tariff),
        sourceUrl: source.trim(),
        effectiveAt: new Date(effective).toISOString(),
        expiresAt: new Date(expires).toISOString(),
      };
    }
    if (provider === "modash") {
      result["accessReviewed"] = rawAccess;
      result["linkCoverageReviewed"] = linkCoverage;
    }
    return result;
  }

  async function saveConfiguration() {
    try {
      const config = configuration();
      await run(
        { action: "configureProvider", provider, configuration: config, rights },
        "Provider policy saved; existing mission approvals must be reviewed again",
      );
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <section className="space-y-4 rounded border p-5">
      <h2 className="text-lg font-semibold">Provider connections</h2>
      <p className="text-sm text-muted-foreground">
        Keys are encrypted by the server. Saving a key or discovering a model does not run paid
        research.
      </p>
      <label className={label}>
        Provider
        <select
          className={field}
          value={provider}
          onChange={(event) => {
            setProvider(event.target.value as Provider);
            setSecret("");
          }}
        >
          <option value="deepseek">DeepSeek · product hypotheses</option>
          <option value="brave">Brave · URL discovery only</option>
          <option value="modash">Modash Raw · restricted profile access</option>
        </select>
      </label>
      <p className="text-sm" role="status">
        {connected
          ? `Key saved (${connected.fingerprint}). ${connected.validated_at ? "Model registry checked" : "Connection not live-tested"}. Rights ${connected.rights_confirmed ? "confirmed" : "pending"}.`
          : "No key saved. Configure access before running this provider."}
      </p>
      {provider === "brave" && (
        <p className="text-sm">
          Brave yields candidate URLs. Instagram facts stay unresolved until verified from an
          authorized source.
        </p>
      )}
      {provider === "modash" && (
        <p className="text-sm">
          Modash Raw access and the actual bio-link fields must be reviewed for this account.
          Discovery-only access is insufficient.
        </p>
      )}
      <label className={label}>
        API key
        <input
          className={field}
          type="password"
          autoComplete="new-password"
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
        />
      </label>
      <Button
        disabled={!admin || busy || secret.length < 5}
        onClick={async () => {
          const result = await run(
            {
              action: "saveProvider",
              provider,
              key: secret,
              configuration: connected?.configuration ?? {},
              rights: false,
            },
            "Encrypted key saved; review capabilities and pricing below",
          );
          if (result) setSecret("");
        }}
      >
        Save encrypted key
      </Button>
      {connected && (
        <Button
          variant="outline"
          disabled={!admin || busy}
          onClick={() => void run({ action: "removeProvider", provider })}
        >
          Remove key
        </Button>
      )}
      {provider === "deepseek" && (
        <>
          <Button
            variant="outline"
            disabled={!admin || busy || !connected}
            onClick={() =>
              void run({ action: "testDeepSeek" }, "Model list refreshed; no generation charge")
            }
          >
            Discover current models
          </Button>
          <label className={label}>
            Discovered model
            <select
              className={field}
              value={model}
              onChange={(event) => setModel(event.target.value)}
            >
              <option value="">Select after discovery</option>
              {connected?.models.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Pricing version or date
            <input
              className={field}
              value={version}
              onChange={(event) => setVersion(event.target.value)}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["Cache hit USD / million tokens", hit, setHit],
                ["Cache miss USD / million tokens", miss, setMiss],
                ["Output USD / million tokens", output, setOutput],
              ] as const
            ).map(([title, value, update]) => (
              <label className={label} key={title}>
                {title}
                <input
                  className={field}
                  inputMode="decimal"
                  value={value}
                  onChange={(event) => update(event.target.value)}
                />
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Use the current rate for your account and selected model. The source and dates make
            price changes reviewable.
          </p>
        </>
      )}
      {provider !== "deepseek" && (
        <>
          <label className={label}>
            Maximum USD per request
            <input
              className={field}
              inputMode="decimal"
              value={requestCeiling}
              onChange={(event) => setRequestCeiling(event.target.value)}
            />
          </label>
          <label className={label}>
            Documented USD per request, if known
            <input
              className={field}
              inputMode="decimal"
              value={tariff}
              onChange={(event) => setTariff(event.target.value)}
            />
          </label>
          {connected?.configuration["requestCeilingNanos"] && (
            <p className="text-xs">
              Current reserved ceiling: $
              {nanosToUsd(String(connected.configuration["requestCeilingNanos"]))} per request
            </p>
          )}
          {provider === "modash" && (
            <>
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={rawAccess}
                  onChange={(event) => setRawAccess(event.target.checked)}
                />
                I verified Raw API access and permitted commercial processing for this account.
              </label>
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={linkCoverage}
                  onChange={(event) => setLinkCoverage(event.target.checked)}
                />
                I checked the actual returned bio-link fields for absence decisions.
              </label>
            </>
          )}
        </>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Rate effective from
          <input
            className={field}
            type="datetime-local"
            value={effective}
            onChange={(event) => setEffective(event.target.value)}
          />
        </label>
        <label className={label}>
          Rate expires
          <input
            className={field}
            type="datetime-local"
            value={expires}
            onChange={(event) => setExpires(event.target.value)}
          />
        </label>
      </div>
      <label className={label}>
        Official pricing or account tariff page
        <input
          className={field}
          type="url"
          value={source}
          onChange={(event) => setSource(event.target.value)}
        />
      </label>
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={rights}
          onChange={(event) => setRights(event.target.checked)}
        />
        I reviewed this provider's account access, storage and intended processing rights.
      </label>
      <Button
        disabled={!admin || busy || !connected || !rights}
        onClick={() => void saveConfiguration()}
      >
        Save reviewed capability and rates
      </Button>
    </section>
  );
}
