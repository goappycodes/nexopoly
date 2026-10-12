// Applies db/schema.sql to the Supabase Postgres database.
// Tries the direct host first, then the session pooler in likely regions.
import { config } from "dotenv";
import { readFileSync } from "fs";
import { Client } from "pg";

config({ path: ".env.local" });

const ref = process.env.SUPABASE_PROJECT_REF!;
const password = process.env.SUPABASE_DB_PASSWORD!;
const regions = ["ap-south-1", "ap-southeast-1", "us-east-1", "eu-central-1", "us-west-1", "eu-west-1", "ap-northeast-1", "ap-southeast-2", "us-east-2", "eu-west-2", "ca-central-1", "sa-east-1"];

async function connect(): Promise<Client> {
  const attempts = [
    { host: `db.${ref}.supabase.co`, user: "postgres" },
    ...regions.flatMap((r) => [
      { host: `aws-0-${r}.pooler.supabase.com`, user: `postgres.${ref}` },
      { host: `aws-1-${r}.pooler.supabase.com`, user: `postgres.${ref}` },
    ]),
  ];
  for (const a of attempts) {
    const client = new Client({ ...a, port: 5432, database: "postgres", password, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 6000 });
    try {
      await client.connect();
      console.log("connected via", a.host);
      return client;
    } catch (e: any) {
      console.log("failed", a.host, e.code || e.message);
    }
  }
  throw new Error("Could not reach the database");
}

(async () => {
  const client = await connect();
  const file = process.argv[2] || "db/schema.sql";
  await client.query(readFileSync(file, "utf8"));
  console.log("applied", file);
  await client.end();
})();
