const LEGACY_LABELS: Record<string, "docmesker" | "justin"> = {
  "00000000-0000-4000-8000-000000000001": "docmesker",
  "00000000-0000-4000-8000-000000000002": "justin",
};
/** The live database still serves the old app via the `workspace` label, so writes must carry the
 * matching label. Workspaces without a label stay read-only until the access cutover. */
export function legacyLabel(workspace: string): "docmesker" | "justin" {
  const label = LEGACY_LABELS[workspace];
  if (!label) throw new Error("Adding records to this workspace opens after the access cutover.");
  return label;
}
