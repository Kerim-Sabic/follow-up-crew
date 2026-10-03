import type { Lead } from "./crm";
import { leadStage } from "./crm";

function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function downloadCsv(filename: string, header: string[], rows: (string | number | null)[][]) {
  const csv = [header.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function splitName(lead: Lead) {
  const full = (lead.full_name ?? "").trim();
  if (full) {
    const parts = full.split(/\s+/);
    return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
  }
  const handle = lead.username.replace(/^@/, "").replace(/[._\-0-9]+/g, " ").trim();
  const parts = handle.split(/\s+/).filter(Boolean);
  return { first: parts[0] ?? handle, last: parts.slice(1).join(" ") };
}

/** Exactly the ListKit upload layout. */
export const LISTKIT_HEADER = [
  "First Name",
  "Last Name",
  "Email",
  "Phone Number",
  "Company Name",
  "Website",
  "Linkedin Profile",
  "Location",
];

export function listKitRows(leads: Lead[]) {
  return leads.map((lead) => {
    const { first, last } = splitName(lead);
    const handle = lead.username.replace(/^@/, "");
    return [
      first,
      last,
      lead.email ?? "",
      "",
      lead.full_name || `@${handle}`,
      lead.instagram_url || `https://instagram.com/${handle}`,
      "",
      lead.niche ?? "",
    ];
  });
}

export function exportListKit(leads: Lead[], filename = "listkit-leads.csv") {
  downloadCsv(filename, LISTKIT_HEADER, listKitRows(leads));
}

export function exportFullLeads(leads: Lead[], filename = "leads.csv") {
  downloadCsv(
    filename,
    ["Number", "Username", "Full name", "Email", "Instagram", "Niche", "Score", "Stage", "Last touched"],
    leads.map((lead) => [
      lead.number,
      lead.username,
      lead.full_name ?? "",
      lead.email ?? "",
      lead.instagram_url ?? "",
      lead.niche ?? "",
      lead.score ?? "",
      leadStage(lead),
      lead.last_touched_at ?? "",
    ]),
  );
}
