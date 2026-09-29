import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
const founders = ["kerim.sabic@gmail.com", "mehmed.barlov@gmail.com", "amrudin.naser@gmail.com"];
const url = process.env["SUPABASE_URL"],
  key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !key) {
  console.log(
    JSON.stringify(
      founders.map((email) => ({
        email,
        status: "PENDING_PROVISIONING",
        setup: "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required; no invitation sent",
      })),
      null,
      2,
    ),
  );
  process.exit(0);
}
const auth = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const users = [];
for (let page = 1; ; page++) {
  const { data, error } = await auth.auth.admin.listUsers({ page, perPage: 100 });
  if (error) throw error;
  users.push(...data.users);
  if (data.users.length < 100) break;
}
for (const email of founders) {
  const user = users.find((u) => u.email?.trim().toLowerCase() === email);
  if (!user) {
    if (process.argv.includes("--send-invitations")) {
      const { error } = await auth.auth.admin.inviteUserByEmail(email);
      if (error) throw error;
      console.log(
        JSON.stringify({
          email,
          status: "INVITATION_SUBMITTED",
          membership: "pending verified identity",
        }),
      );
    } else
      console.log(
        JSON.stringify({
          email,
          status: "PENDING_PROVISIONING",
          next: "With explicit authorization run npm run founders -- --send-invitations",
        }),
      );
  } else if (!user.email_confirmed_at)
    console.log(JSON.stringify({ email, status: "AWAITING_EMAIL_VERIFICATION", id: user.id }));
  else {
    if (process.argv.includes("--reconcile")) {
      if (!process.env["CREATOR_DATABASE_URL"])
        throw new Error("CREATOR_DATABASE_URL required for reconcile");
      const sql = postgres(process.env["CREATOR_DATABASE_URL"], { max: 1 });
      try {
        await sql`select private.bootstrap_user(${user.id})`;
      } finally {
        await sql.end();
      }
    }
    console.log(
      JSON.stringify({
        email,
        status: "AUTH_VERIFIED",
        id: user.id,
        membership: process.argv.includes("--reconcile")
          ? "bootstrap executed; inspect membership and entitlement"
          : "not queried; use --reconcile only after migration",
      }),
    );
  }
}
