import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("Cloud SQL enforces owner isolation, compare-and-swap, immutable direct access and verified backups", async () => {
  const pg = new PGlite();
  const ownerA = "10000000-0000-4000-8000-000000000001",
    ownerB = "20000000-0000-4000-8000-000000000002";
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
    INSERT INTO auth.users VALUES('${ownerA}'),('${ownerB}');`);
  await pg.exec(readFileSync("supabase/schema.sql", "utf8"));
  const envelope = (revision: number) => ({
    format: "PropertyOS",
    version: 1,
    vaultId: "test-vault",
    revision,
    salt: "test-salt",
    iv: "test-iv",
    ciphertext: `encrypted-fixture-${revision}`,
  });
  async function identity(owner: string) {
    await pg.exec("RESET ROLE; SET ROLE authenticated;");
    await pg.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [
      owner,
    ]);
  }
  const save = (value: object, expected: number | null) =>
    pg.query("SELECT public.propertyos_save($1::jsonb,$2::bigint)", [
      JSON.stringify(value),
      expected,
    ]);
  const checkpoint = (key: string, value: object) =>
    pg.query("SELECT public.propertyos_checkpoint($1,$2::jsonb)", [
      key,
      JSON.stringify(value),
    ]);
  await identity(ownerA);
  await save(envelope(1), null);
  await save(envelope(2), 1);
  await assert.rejects(save(envelope(3), 1), /revision conflict/);
  await assert.rejects(save(envelope(4), 2), /Invalid next revision/);
  await assert.rejects(
    save({ ...envelope(3), ciphertext: null }, 2),
    /Invalid encrypted/,
  );
  await assert.rejects(
    pg.query("UPDATE public.propertyos_vaults SET revision=999"),
    /permission denied/,
  );
  const current = await pg.query<{ revision: number; user_id: string }>(
    "SELECT revision,user_id FROM public.propertyos_vaults",
  );
  assert.equal(Number(current.rows[0].revision), 2);
  assert.equal(current.rows[0].user_id, ownerA);
  await checkpoint("daily:2026-01-01", envelope(2));
  await assert.rejects(
    checkpoint("daily:2026-01-02", { ...envelope(2), ciphertext: "tampered" }),
    /changed before backup/,
  );
  await checkpoint("pre-restore", envelope(2));
  const recovery = await pg.query<{ envelope: any }>(
    "SELECT envelope FROM public.propertyos_snapshots WHERE snapshot_key='recovery'",
  );
  assert.equal(recovery.rows[0].envelope.revision, 1);
  for (let day = 2; day <= 20; day++)
    await checkpoint(
      `daily:2026-01-${String(day).padStart(2, "0")}`,
      envelope(2),
    );
  const days = await pg.query<{ n: number }>(
    "SELECT count(*) n FROM public.propertyos_snapshots WHERE snapshot_key LIKE 'daily:%'",
  );
  assert.equal(Number(days.rows[0].n), 14);
  await identity(ownerB);
  assert.equal(
    (await pg.query("SELECT * FROM public.propertyos_vaults")).rows.length,
    0,
  );
  assert.equal(
    (await pg.query("SELECT * FROM public.propertyos_snapshots")).rows.length,
    0,
  );
  await save(envelope(1), null);
  assert.equal(
    (
      await pg.query<{ user_id: string }>(
        "SELECT user_id FROM public.propertyos_vaults",
      )
    ).rows[0].user_id,
    ownerB,
  );
  await identity(ownerA);
  assert.equal(
    Number(
      (
        await pg.query<{ revision: number }>(
          "SELECT revision FROM public.propertyos_vaults",
        )
      ).rows[0].revision,
    ),
    2,
  );
  await pg.exec("RESET ROLE; SET ROLE anon;");
  await assert.rejects(save(envelope(3), 2), /permission denied/);
  await assert.rejects(
    pg.query("SELECT * FROM public.propertyos_vaults"),
    /permission denied/,
  );
  await pg.close();
});
