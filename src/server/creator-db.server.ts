import postgres from "postgres";
import type { TransactionSql } from "postgres";
let connection: ReturnType<typeof postgres> | undefined;
export function creatorDb() {
  // Lovable Cloud manages this connection and injects it into backend
  // runtimes. Prefer an explicitly configured, least-privilege app role when
  // one is available; otherwise use the managed backend connection.
  const url = process.env["CREATOR_DATABASE_URL"] || process.env["SUPABASE_DB_URL"];
  if (!url)
    throw new Error(
      "Setup required: the server needs CREATOR_DATABASE_URL or Lovable Cloud's managed SUPABASE_DB_URL for the migrated PostgreSQL database.",
    );
  return (connection ??= postgres(url, { max: 5, idle_timeout: 20, connect_timeout: 10 }));
}
export async function withWorkspace<T>(
  actor: string,
  w: string,
  write: boolean,
  fn: (sql: TransactionSql, role: string) => Promise<T>,
): Promise<T> {
  const result = await creatorDb().begin(async (sql) => {
    await sql`select set_config('request.jwt.claim.sub',${actor},true)`;
    const rows = await sql`select private.member_role(${w}::uuid) as role`;
    const role = rows[0]?.["role"] as string | undefined;
    if (!role || (write && role === "viewer"))
      throw new Error("Workspace permission denied or verified membership revoked");
    // Membership is rechecked for every command and every bounded worker unit.
    return fn(sql, role);
  });
  return result as T;
}
export function requireAdmin(role: string) {
  if (!["owner", "admin"].includes(role)) throw new Error("Workspace admin required");
}
