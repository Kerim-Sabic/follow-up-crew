import { useState } from "react";
import { loadHermes, saveHermes, hermesTestConnection } from "@/lib/hermes";
import { Button } from "@/components/ui/button";
export function LocalHermes() {
  const [settings, setSettings] = useState(loadHermes);
  const [status, setStatus] = useState("Not tested");
  const [busy, setBusy] = useState(false);
  return (
    <details className="rounded border p-4">
      <summary className="cursor-pointer font-medium">Optional local Hermes connection</summary>
      <p className="my-3 text-sm">
        For a model running on this computer only. Hosted DeepSeek keys belong in encrypted
        workspace settings above. Model connectivity does not establish a retrieved or verified
        creator.
      </p>
      <label className="block text-sm">
        Loopback URL
        <input
          className="my-2 block w-full rounded border p-2"
          value={settings.baseUrl}
          onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })}
        />
      </label>
      <label className="block text-sm">
        Local model
        <input
          className="my-2 block w-full rounded border p-2"
          value={settings.model}
          onChange={(e) => setSettings({ ...settings, model: e.target.value })}
        />
      </label>
      <label className="block text-sm">
        Local bridge token
        <input
          type="password"
          autoComplete="off"
          className="my-2 block w-full rounded border p-2"
          value={settings.apiKey}
          onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
        />
      </label>
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            saveHermes(settings);
            setStatus((await hermesTestConnection(settings)).message);
          } catch (e) {
            setStatus((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Save and test local connection
      </Button>
      <p className="mt-3 text-sm" role="status">
        {status}
      </p>
    </details>
  );
}
