import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
export async function database(legacy = false) {
  const db = new PGlite();
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb DEFAULT '{}');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO authenticated,service_role; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,service_role;`);
  const files = readdirSync("drizzle/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    if (file.startsWith("0005") && legacy)
      await db.exec(`INSERT INTO auth.users VALUES
   ('10000000-0000-4000-8000-000000000001','kerim.sabic@gmail.com',now(),'{}'),
   ('10000000-0000-4000-8000-000000000002','ordinary@example.test',now(),'{}');
   INSERT INTO public.leads(id,username,workspace,stage) VALUES('20000000-0000-4000-8000-000000000001','fixture_legacy','docmesker','contacted'),('20000000-0000-4000-8000-000000000002','fixture_justin','justin','not_contacted');
   INSERT INTO public.lead_notes(lead_id,author_id,body) VALUES('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','fixture retained note');`);
    // Embedded PostgreSQL has no logical replication. Only publication statements are omitted.
    const sql = readFileSync(`drizzle/migrations/${file}`, "utf8").replace(
      /ALTER PUBLICATION supabase_realtime ADD TABLE public\.\w+;/g,
      "",
    );
    await db.exec(sql);
  }
  return db;
}
