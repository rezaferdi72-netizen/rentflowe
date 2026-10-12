import { type Envelope, type StorageAdapter, validateEnvelope } from "./vault";
function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export class BrowserStorage implements StorageAdapter {
  private db: Promise<IDBDatabase>;
  constructor(namespace = "PropertyOS") {
    this.db = new Promise((resolve, reject) => {
      const r = indexedDB.open(namespace, 1);
      r.onupgradeneeded = () => r.result.createObjectStore("vault");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async load() {
    const db = await this.db;
    return (
      (await request(
        db.transaction("vault").objectStore("vault").get("current"),
      )) ?? null
    );
  }
  async recovery() {
    const db = await this.db;
    return (
      (await request(
        db.transaction("vault").objectStore("vault").get("recovery"),
      )) ?? null
    );
  }
  async preserveBeforeRestore(value: Envelope) {
    const db = await this.db;
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction("vault", "readwrite");
      tx.objectStore("vault").put(value, "pre-restore");
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(new Error("Could not retain the pre-restore safety copy."));
    });
  }
  async checkpoint(day: string, value: Envelope) {
    const db = await this.db;
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction("vault", "readwrite"),
        store = tx.objectStore("vault"),
        get = store.get("daily");
      get.onsuccess = () => {
        const days = get.result || [];
        if (!days.some((x: any) => x.day === day))
          store.put([...days, { day, value }].slice(-7), "daily");
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(new Error("Automatic backup could not be saved."));
    });
  }
  async lastBackup() {
    const db = await this.db;
    const days = await request(
      db.transaction("vault").objectStore("vault").get("daily"),
    );
    return days?.at(-1)?.day ?? null;
  }
  async snapshots(): Promise<{ day: string; value: Envelope }[]> {
    const db = await this.db;
    return (await request(db.transaction("vault").objectStore("vault").get("daily"))) ?? [];
  }
  async mirror(value: Envelope) {
    const db = await this.db;
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction("vault", "readwrite");
      tx.objectStore("vault").put(value, "current");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error("Could not update the encrypted device cache."));
    });
  }
  async save(value: Envelope, expected: number | null) {
    const db = await this.db;
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction("vault", "readwrite"),
        store = tx.objectStore("vault"),
        get = store.get("current");
      let stale = false;
      get.onsuccess = () => {
        const old = get.result;
        if ((old?.revision ?? null) !== expected) {
          stale = true;
          tx.abort();
          return;
        }
        if (old) store.put(old, "recovery");
        store.put(value, "current");
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(
          new Error("Could not save your workspace. Check available storage."),
        );
      tx.onabort = () =>
        reject(
          new Error(
            stale
              ? "Another session changed this workspace. Lock and reopen."
              : "Save was cancelled. Your last saved data is intact.",
          ),
        );
    });
  }
}
export class DesktopStorage implements StorageAdapter {
  async load() {
    const { invoke } = await import("@tauri-apps/api/core");
    const s = await invoke<string | null>("read_vault");
    if (!s) return null;
    const e = JSON.parse(s);
    validateEnvelope(e);
    return e;
  }
  async recovery() {
    const { invoke } = await import("@tauri-apps/api/core");
    const s = await invoke<string | null>("read_recovery");
    return s ? JSON.parse(s) : null;
  }
  async preserveBeforeRestore(value: Envelope) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("preserve_restore", { content: JSON.stringify(value) });
  }
  async checkpoint(day: string, _value: Envelope) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("checkpoint_vault", { day });
  }
  async lastBackup() {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<string | null>("last_backup");
  }
  async save(e: Envelope, expected: number | null) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("write_vault", { content: JSON.stringify(e), expected });
  }
}
export const desktop = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const storage = (): StorageAdapter =>
  desktop() ? new DesktopStorage() : new BrowserStorage();
