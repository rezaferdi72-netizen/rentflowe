import { test } from "node:test";
import assert from "node:assert/strict";
import initSqlJs from "sql.js";
import {
  CloudStorage,
  CloudUnavailableError,
  type CloudGateway,
} from "../src/core/cloud-storage";
import { MemoryStorage, Vault, type Envelope } from "../src/core/vault";
import { PropertyService } from "../src/core/service";
const SQL = await initSqlJs({
  locateFile: (name) => "node_modules/sql.js/dist/" + name,
});
class Server implements CloudGateway {
  current: Envelope | null = null;
  previous: Envelope | null = null;
  days: { day: string; value: Envelope }[] = [];
  async read() {
    return structuredClone(this.current);
  }
  async write(value: Envelope, expected: number | null) {
    if ((this.current?.revision ?? null) !== expected)
      throw new Error("Another device changed the revision.");
    this.previous = this.current;
    this.current = structuredClone(value);
  }
  async snapshot(key: string, value: Envelope) {
    this.days.push({ day: key.slice(6), value });
  }
  async snapshots() {
    return this.days;
  }
  async recovery() {
    return this.previous;
  }
}
const password = "private owner cloud passphrase";
test("Cloud conflicts reject and roll back stale device writes; latest can reopen safely", async () => {
  const server = new Server(),
    a = new CloudStorage(server, new MemoryStorage()),
    b = new CloudStorage(server, new MemoryStorage());
  const first = await Vault.create(SQL, a, password, "Owner");
  const second = await Vault.open(SQL, b, password);
  await new PropertyService(first).addTenant({
    name: "Saved on first device",
    phone: "01700000000",
  });
  await assert.rejects(
    new PropertyService(second).addTenant({
      name: "Stale record",
      phone: "01700000001",
    }),
    /changed/,
  );
  assert.equal(new PropertyService(second).list("tenants").length, 0);
  assert.equal(b.state, "conflict");
  await second.close();
  const latest = await Vault.open(SQL, b, password);
  assert.equal(
    new PropertyService(latest).list("tenants")[0].name,
    "Saved on first device",
  );
  await latest.close();
  await first.close();
});
test("Cloud offline cache is readable, all writes roll back, and authorization failures never use cache", async () => {
  const server = new Server(),
    cache = new MemoryStorage();
  let online = true;
  const adapter = new CloudStorage(server, cache, () => online);
  const v = await Vault.create(SQL, adapter, password, "Owner");
  await new PropertyService(v).addTenant({
    name: "Saved tenant",
    phone: "01700000000",
  });
  online = false;
  await assert.rejects(
    new PropertyService(v).addTenant({
      name: "Uncommitted",
      phone: "01700000001",
    }),
    /read-only offline/,
  );
  assert.equal(new PropertyService(v).list("tenants").length, 1);
  await v.close();
  const offline = await Vault.open(SQL, adapter, password);
  assert.equal(new PropertyService(offline).list("tenants").length, 1);
  assert.equal(adapter.state, "offline");
  await offline.close();
  online = true;
  server.read = async () => {
    throw new Error("Permission denied");
  };
  await assert.rejects(adapter.load(), /Permission denied/);
  server.read = async () => {
    throw new CloudUnavailableError("Network down");
  };
  assert.equal((await adapter.load())!.vaultId, server.current!.vaultId);
});
test("Confirmed cloud commits remain committed when local device caching fails", async () => {
  const server = new Server(),
    cache = new MemoryStorage();
  cache.save = async () => {
    throw new Error("device cache full");
  };
  const adapter = new CloudStorage(server, cache);
  const v = await Vault.create(SQL, adapter, password, "Owner");
  await new PropertyService(v).addTenant({
    name: "Durable cloud tenant",
    phone: "01700000000",
  });
  assert.equal(server.current!.revision, (await v.backup()).revision);
  assert.match(adapter.cacheWarning, /could not be updated/);
  assert.equal(adapter.state, "cloud");
  await v.close();
});
test("No-op transactions and an idle automation check do not create conflicting cloud revisions", async () => {
  const server = new Server(),
    adapter = new CloudStorage(server, new MemoryStorage());
  const v = await Vault.create(SQL, adapter, password, "Owner");
  const before = server.current!.revision;
  assert.equal(await v.transaction(() => 42), 42);
  await new PropertyService(v).runAutomation("2026-01-01");
  assert.equal(server.current!.revision, before);
  await v.close();
});
