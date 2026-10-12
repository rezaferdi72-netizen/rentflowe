import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  CloudStorage,
  CloudUnavailableError,
  type CloudGateway,
} from "./cloud-storage";
import { BrowserStorage } from "./storage";
import { type Envelope, validateEnvelope } from "./vault";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY
)?.trim();
export const cloudConfigured = !!(url && key);
export const cloudClient = cloudConfigured
  ? createClient(url!, key!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

function failure(
  error: { message: string; code?: string; details?: string } | null,
) {
  if (!error) return;
  if (
    /fetch|network|connection|failed to send/i.test(error.message) &&
    !error.code
  )
    throw new CloudUnavailableError(
      "Cloud connection unavailable. Reconnect, lock and reopen your workspace.",
    );
  if (
    error.code === "P0001" &&
    /changed|revision|conflict/i.test(error.message)
  )
    throw new Error(
      "Another device saved a newer workspace. This change was cancelled. Lock and reopen to load the latest records.",
    );
  if (/propertyos_|schema cache|does not exist/i.test(error.message))
    throw new Error(
      "Cloud storage setup is incomplete. The administrator must finish the database setup before you can open records.",
    );
  throw new Error(error.message);
}
export class SupabaseGateway implements CloudGateway {
  constructor(
    private client: SupabaseClient,
    private userId: string,
  ) {}
  async read() {
    const { data, error } = await this.client
      .from("propertyos_vaults")
      .select("envelope")
      .eq("user_id", this.userId)
      .maybeSingle();
    failure(error);
    if (!data) return null;
    validateEnvelope(data.envelope);
    return data.envelope;
  }
  async write(value: Envelope, expected: number | null) {
    const { error } = await this.client.rpc("propertyos_save", {
      p_envelope: value,
      p_expected: expected,
    });
    failure(error);
  }
  async snapshot(key: string, value: Envelope) {
    const { error } = await this.client.rpc("propertyos_checkpoint", {
      p_key: key,
      p_envelope: value,
    });
    failure(error);
  }
  async snapshots() {
    const { data, error } = await this.client
      .from("propertyos_snapshots")
      .select("snapshot_key,envelope")
      .eq("user_id", this.userId)
      .like("snapshot_key", "daily:%")
      .order("snapshot_key");
    failure(error);
    return (data || []).map((r) => ({
      day: r.snapshot_key.slice(6),
      value: r.envelope as Envelope,
    }));
  }
  async recovery() {
    const { data, error } = await this.client
      .from("propertyos_snapshots")
      .select("envelope")
      .eq("user_id", this.userId)
      .eq("snapshot_key", "recovery")
      .maybeSingle();
    failure(error);
    return (data?.envelope as Envelope) ?? null;
  }
  async lastBackup() {
    const { data, error } = await this.client
      .from("propertyos_snapshots")
      .select("snapshot_key")
      .eq("user_id", this.userId)
      .like("snapshot_key", "daily:%")
      .order("snapshot_key", { ascending: false })
      .limit(1)
      .maybeSingle();
    failure(error);
    return data?.snapshot_key.slice(6) ?? null;
  }
}
export function cloudStorage(userId: string) {
  if (!cloudClient || !url) throw new Error("Cloud storage is not configured.");
  return new CloudStorage(
    new SupabaseGateway(cloudClient, userId),
    new BrowserStorage(`PropertyOS:cloud:${new URL(url).hostname}:${userId}`),
  );
}
