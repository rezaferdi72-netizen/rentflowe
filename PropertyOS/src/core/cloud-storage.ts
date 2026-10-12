import { type Envelope, type StorageAdapter, validateEnvelope } from "./vault";

export class CloudUnavailableError extends Error {}
export interface CloudGateway {
  read(): Promise<Envelope | null>;
  write(value: Envelope, expected: number | null): Promise<void>;
  snapshot(key: string, value: Envelope): Promise<void>;
  snapshots(): Promise<{ day: string; value: Envelope }[]>;
  recovery(): Promise<Envelope | null>;
  lastBackup?(): Promise<string | null>;
}
export type ConnectionState = "cloud" | "saving" | "offline" | "conflict";

/** Cloud is the authority. Offline cached workspaces are read-only, never silently forked. */
export class CloudStorage implements StorageAdapter {
  state: ConnectionState = "cloud";
  lastSaved: string | null = null;
  cacheWarning = "";
  private listeners = new Set<() => void>();
  constructor(
    private gateway: CloudGateway,
    private cache: StorageAdapter & { mirror?(value: Envelope): Promise<void> },
    private online = () =>
      typeof navigator === "undefined" || navigator.onLine !== false,
  ) {}
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private change(state: ConnectionState) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
  private async mirror(value: Envelope) {
    try {
      if (this.cache.mirror) await this.cache.mirror(value);
      else
        await this.cache.save(
          value,
          (await this.cache.load())?.revision ?? null,
        );
      this.cacheWarning = "";
    } catch {
      // A confirmed cloud commit must never be rolled back because its device cache failed.
      this.cacheWarning =
        "Saved to cloud; the encrypted device cache could not be updated.";
    }
  }
  async load() {
    try {
      if (!this.online())
        throw new CloudUnavailableError("No internet connection.");
      const value = await this.gateway.read();
      if (value) {
        validateEnvelope(value);
        await this.mirror(value);
      }
      this.change("cloud");
      return value;
    } catch (error) {
      if (!(error instanceof CloudUnavailableError)) throw error;
      this.change("offline");
      const cached = await this.cache.load();
      if (!cached)
        throw new Error(
          "Connect to the internet to open this cloud workspace for the first time.",
        );
      validateEnvelope(cached);
      return cached;
    }
  }
  async save(value: Envelope, expected: number | null) {
    validateEnvelope(value);
    if (!this.online()) {
      this.change("offline");
      throw new Error(
        "Cloud workspace is read-only offline. Reconnect, lock and reopen before editing. Your last saved records are intact.",
      );
    }
    this.change("saving");
    try {
      await this.gateway.write(value, expected);
    } catch (error) {
      this.change(
        error instanceof CloudUnavailableError ? "offline" : "conflict",
      );
      throw error;
    }
    this.lastSaved = new Date().toISOString();
    await this.mirror(value);
    this.change("cloud");
  }
  async checkpoint(day: string, value: Envelope) {
    if (!this.online() || this.state === "offline") return;
    await this.gateway.snapshot("daily:" + day, value);
    await this.cache.checkpoint?.(day, value);
  }
  async snapshots() {
    return this.gateway.snapshots();
  }
  async lastBackup() {
    if (!this.online()) return this.cache.lastBackup?.() ?? null;
    if (this.gateway.lastBackup) return this.gateway.lastBackup();
    return (await this.gateway.snapshots()).at(-1)?.day ?? null;
  }
  async recovery() {
    if (!this.online()) return this.cache.recovery?.() ?? null;
    return this.gateway.recovery();
  }
  async preserveBeforeRestore(value: Envelope) {
    await this.gateway.snapshot("pre-restore", value);
    await this.cache.preserveBeforeRestore?.(value);
  }
}
