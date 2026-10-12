import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Building2,
  ShieldCheck,
  Cloud,
  HardDrive,
  ArrowRight,
} from "lucide-react";
import { type Session } from "@supabase/supabase-js";
import { cloudClient, cloudConfigured, cloudStorage } from "../core/cloud";
import { storage } from "../core/storage";
import { type StorageAdapter } from "../core/vault";
import { CloudStorage } from "../core/cloud-storage";

export function ConnectionGate({
  children,
}: {
  children: (adapter: StorageAdapter, identity: string) => ReactNode;
}) {
  const [mode, setMode] = useState<"local" | "cloud">(() =>
    cloudConfigured && localStorage.getItem("propertyos-mode") !== "local"
      ? "cloud"
      : "local",
  );
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!cloudConfigured);
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const local = useMemo(() => storage(), []);
  const remote = useMemo(
    () => (session?.user.id ? cloudStorage(session.user.id) : null),
    [session?.user.id],
  );
  useEffect(() => {
    if (!cloudClient) return;
    void cloudClient.auth.getSession().then(({ data, error }) => {
      if (error) setError(error.message);
      setSession(data.session);
      setReady(true);
    });
    const { data } = cloudClient.auth.onAuthStateChange((event, value) => {
      setSession(value);
      setReady(true);
      if (event === "PASSWORD_RECOVERY") {
        setRecovery(true);
        setMode("cloud");
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  function select(value: "local" | "cloud") {
    setMode(value);
    localStorage.setItem("propertyos-mode", value);
    setError("");
    setNotice("");
  }
  async function authenticate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!cloudClient) return;
    setBusy(true);
    setError("");
    setNotice("");
    const d = new FormData(e.currentTarget);
    try {
      const result = recovery
        ? await cloudClient.auth.updateUser({
            password: String(d.get("password")),
          })
        : await cloudClient.auth.signInWithPassword({
            email: String(d.get("email")),
            password: String(d.get("password")),
          });
      if (result.error) throw result.error;
      if (recovery) {
        setRecovery(false);
        setNotice(
          "Account password updated. Your workspace passphrase stays the same.",
        );
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (mode === "local" || (session && remote && !recovery))
    return (
      <>
        {children(
          mode === "local" ? local : remote!,
          mode === "local" ? "local" : session!.user.id,
        )}
      </>
    );
  return (
    <main className="auth">
      <div className="auth-visual">
        <div className="brand">
          <span className="brand-icon">
            <Building2 size={23} />
          </span>
          <span>
            Property<span className="brand-os">OS</span>
            <small>YOUR BUSINESS, CONNECTED</small>
          </span>
        </div>
        <div>
          <div className="eyebrow">A CLEAR VIEW OF YOUR BUSINESS</div>
          <h1>
            Your properties.
            <br />
            Your investments.
            <br />
            <em>Always within reach.</em>
          </h1>
          <p>
            Rent, money, and records in one private workspace.
            <br />
            Open your latest saved records across your devices.
          </p>
        </div>
        <div className="auth-note">
          <ShieldCheck size={20} /> Your records are encrypted before cloud
          storage.
        </div>
      </div>
      <section className="auth-form">
        <div className="eyebrow">PROPERTYOS · CLOUD ACCOUNT</div>
        <h2>{recovery ? "Choose a new account password" : "Welcome back."}</h2>
        <p>
          {recovery
            ? "This changes your sign-in password. You still need your workspace passphrase to decrypt your records."
            : "Sign in to your owner account, then unlock your encrypted workspace."}
        </p>
        <div className="connection-tabs">
          <button className="selected" type="button">
            <Cloud size={16} /> Across devices
          </button>
          <button type="button" onClick={() => select("local")}>
            <HardDrive size={16} /> This device
          </button>
        </div>
        <form onSubmit={authenticate}>
          {!recovery && (
            <label>
              Email address
              <input
                type="email"
                name="email"
                autoComplete="username"
                required
                placeholder="you@business.com"
              />
            </label>
          )}
          <label>
            {recovery ? "New account password" : "Account password"}
            <input
              type="password"
              name="password"
              autoComplete={recovery ? "new-password" : "current-password"}
              minLength={recovery ? 12 : undefined}
              required
            />
          </label>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {notice && <div className="notice">{notice}</div>}
          <button className="primary full" disabled={busy || !ready}>
            {busy ? "Please wait…" : recovery ? "Update password" : "Sign in"}
            <ArrowRight size={17} />
          </button>
        </form>
        {!recovery && (
          <details>
            <summary>Forgot your account password?</summary>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                const email = String(
                  new FormData(e.currentTarget).get("reset_email"),
                );
                const { error } = await cloudClient!.auth.resetPasswordForEmail(
                  email,
                  { redirectTo: window.location.origin },
                );
                if (error) setError(error.message);
                else
                  setNotice(
                    "If this account exists, a password reset link will arrive by email.",
                  );
                setBusy(false);
              }}
            >
              <label>
                Account email
                <input name="reset_email" type="email" required />
              </label>
              <button className="secondary" disabled={busy}>
                Send reset link
              </button>
            </form>
          </details>
        )}
        <small className="muted">
          Ask your administrator for an owner account. Local workspaces remain
          available without a cloud account.
        </small>
      </section>
    </main>
  );
}

export function ConnectionStatus({ adapter }: { adapter: StorageAdapter }) {
  const [, render] = useState(0);
  useEffect(
    () =>
      adapter instanceof CloudStorage
        ? adapter.subscribe(() => render((n) => n + 1))
        : undefined,
    [adapter],
  );
  if (!(adapter instanceof CloudStorage))
    return (
      <span className="offline-pill">
        <span /> Local & offline
      </span>
    );
  const labels = {
    cloud: "Cloud connected",
    saving: "Saving to cloud…",
    offline: "Offline · read only",
    conflict: "Reopen latest records",
  };
  return (
    <span
      className={`offline-pill connection-${adapter.state}`}
      title={
        adapter.cacheWarning ||
        "Cloud edits require internet. Reopen to load changes saved on another device."
      }
    >
      <span />
      {labels[adapter.state]}
    </span>
  );
}

export function CloudAccountActions({ adapter }: { adapter: StorageAdapter }) {
  if (!(adapter instanceof CloudStorage)) return null;
  return (
    <button
      className="secondary cloud-signout"
      onClick={() => {
        void cloudClient?.auth.signOut();
      }}
    >
      Sign out of cloud account
    </button>
  );
}

export function StorageChoice() {
  if (!cloudConfigured)
    return (
      <small className="muted">
        Cloud access can be enabled when you deploy. This workspace saves on
        this device.
      </small>
    );
  return (
    <button
      className="secondary full"
      type="button"
      onClick={() => {
        localStorage.setItem("propertyos-mode", "cloud");
        window.location.reload();
      }}
    >
      <Cloud size={16} /> Open cloud sign-in
    </button>
  );
}
