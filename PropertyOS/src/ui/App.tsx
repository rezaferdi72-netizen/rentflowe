import React, {
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Building2,
  LayoutDashboard,
  DoorOpen,
  Users,
  Wallet,
  FileText,
  Receipt,
  TrendingUp,
  Landmark,
  Wrench,
  FolderOpen,
  Database,
  Settings,
  Search,
  Plus,
  ArrowUpRight,
  ChevronRight,
  ShieldCheck,
  Lock,
  Sun,
  Moon,
  Menu,
  X,
  Download,
  CheckCircle2,
  ArrowDownLeft,
  ArrowUpLeft,
  ArrowRight,
  CalendarDays,
  RefreshCw,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { PropertyService } from "../core/service";
import {
  Vault,
  sqlite,
  MemoryStorage,
  type Row,
  type Envelope,
  validateEnvelope,
  type StorageAdapter,
} from "../core/vault";
import { storage, desktop } from "../core/storage";
import { CloudStorage } from "../core/cloud-storage";
import {
  ConnectionGate,
  ConnectionStatus,
  CloudAccountActions,
  StorageChoice,
} from "./ConnectionGate";
import { DataImport } from "./DataImport";
import { money, format, amortization, addMonths } from "../core/money";
import { forms, choices, type Field } from "./forms";
import { csv, download, invoicePDF, receiptPDF, makePDF } from "./documents";
const nav = [
  ["dashboard", "Dashboard", LayoutDashboard],
  ["properties", "Properties", Building2],
  ["units", "Units", DoorOpen],
  ["tenants", "Tenants & leases", Users],
  ["rent", "Rent & collections", Wallet],
  ["invoices", "Invoices & receipts", Receipt],
  ["expenses", "Expenses", ArrowDownLeft],
  ["investments", "Investments", TrendingUp],
  ["owners", "Owners & capital", Users],
  ["budgets", "Budgets", CalendarDays],
  ["loans", "Loans", Landmark],
  ["maintenance", "Maintenance", Wrench],
  ["accounts", "Financial accounts", Wallet],
  ["reports", "Reports & analytics", FileText],
  ["documents", "Documents", FolderOpen],
  ["database", "Database & backup", Database],
  ["settings", "Settings", Settings],
] as const;
const defaults: Record<string, string> = {
  properties: "property",
  units: "unit",
  tenants: "tenant",
  rent: "payment",
  invoices: "payment",
  expenses: "expense",
  investments: "investment",
  owners: "owner",
  budgets: "budget",
  loans: "loan",
  maintenance: "maintenance",
  accounts: "account",
};
function Brand() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <Building2 size={23} />
      </span>
      <span>
        Property<span className="brand-os">OS</span>
        <small>PRIVATE PROPERTY WORKSPACE</small>
      </span>
    </div>
  );
}
export default function App() {
  return (
    <ConnectionGate>
      {(adapter, identity) => <LocalApp key={identity} adapter={adapter} />}
    </ConnectionGate>
  );
}
function LocalApp({ adapter }: { adapter: StorageAdapter }) {
  const [vault, setVault] = useState<Vault | null>(null),
    [existing, setExisting] = useState<boolean | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    adapter
      .load()
      .then((x) => setExisting(!!x))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(
    () => () => {
      if (vault) void vault.close();
    },
    [vault],
  );
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      const SQL = await sqlite();
      const v = existing
        ? await Vault.open(SQL, adapter, String(data.get("password")))
        : await Vault.create(
            SQL,
            adapter,
            String(data.get("password")),
            String(data.get("name")),
          );
      setVault(v);
      setExisting(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function firstRestore(file: File | null, password: string) {
    if (!file) throw new Error("Choose an encrypted PropertyOS backup.");
    const e = JSON.parse(await file.text());
    validateEnvelope(e);
    const SQL = await sqlite(),
      memory = new MemoryStorage();
    memory.value = e;
    const check = await Vault.open(SQL, memory, password);
    const verified = await check.backup();
    await check.close();
    await adapter.save(verified, null);
    setExisting(true);
  }
  if (vault)
    return (
      <Workspace
        vault={vault}
        adapter={adapter}
        onLock={async () => {
          await vault.close();
          setVault(null);
        }}
      />
    );
  return (
    <main className="auth">
      <div className="auth-visual">
        <Brand />
        <div>
          <div className="eyebrow">YOUR PORTFOLIO. YOUR CONTROL.</div>
          <h1>
            Every property.
            <br />
            Every payment.
            <br />
            <em>One clear picture.</em>
          </h1>
          <p>
            A private workspace for the places you own,
            <br />
            the people who rent, and the numbers that matter.
          </p>
        </div>
        <div className="auth-note">
          <ShieldCheck size={20} />{" "}
          {adapter instanceof CloudStorage
            ? "Encrypted before cloud storage."
            : "Encrypted on your device. Works offline."}
        </div>
      </div>
      <section className="auth-form">
        <div className="auth-mobile">
          <Brand />
        </div>
        <div className="eyebrow">WELCOME TO PROPERTYOS</div>
        <h2>
          {existing
            ? "Unlock your workspace"
            : "Make room for better management."}
        </h2>
        <p>
          {existing
            ? "Enter your passphrase to open your encrypted records."
            : "Create your private property workspace. Start with your own records; no demo data is added."}
        </p>
        <form onSubmit={login}>
          {!existing && (
            <label>
              Business / owner name
              <input
                name="name"
                required
                placeholder="Your business name"
                autoComplete="organization"
              />
            </label>
          )}
          <label>
            Workspace passphrase
            <input
              name="password"
              type="password"
              required
              minLength={12}
              placeholder="At least 12 characters"
              autoComplete={existing ? "current-password" : "new-password"}
            />
          </label>
          {!existing && (
            <div className="notice">
              <Lock size={18} />
              <span>
                Your passphrase encrypts the database and backups. Save it
                somewhere safe; there is no online password reset.
              </span>
            </div>
          )}
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          <button className="primary full" disabled={busy || existing === null}>
            {busy
              ? "Opening securely…"
              : existing
                ? "Unlock workspace"
                : "Create workspace"}
            <ArrowRight size={17} />
          </button>
        </form>
        {!existing && (
          <details>
            <summary>Already have a PropertyOS backup?</summary>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  const d = new FormData(e.currentTarget);
                  await firstRestore(
                    d.get("backup") as File,
                    String(d.get("backup_password")),
                  );
                  setError("");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Encrypted backup
                <input
                  type="file"
                  name="backup"
                  accept=".posvault,.json"
                  required
                />
              </label>
              <label>
                Backup passphrase
                <input
                  type="password"
                  name="backup_password"
                  minLength={12}
                  required
                />
              </label>
              <button className="secondary" disabled={busy}>
                Import workspace
              </button>
            </form>
          </details>
        )}
        <small className="muted">
          {adapter instanceof CloudStorage
            ? "Cloud workspace · Your account password and workspace passphrase are separate."
            : desktop()
              ? "Local desktop storage · No account required"
              : "Browser storage · No account required"}
        </small>
        {adapter instanceof CloudStorage ? (
          <CloudAccountActions adapter={adapter} />
        ) : (
          <StorageChoice />
        )}
      </section>
    </main>
  );
}
function Workspace({
  vault,
  adapter,
  onLock,
}: {
  vault: Vault;
  adapter: StorageAdapter;
  onLock: () => Promise<void>;
}) {
  const s = new PropertyService(vault),
    [rev, setRev] = useState(0),
    [route, setRoute] = useState("dashboard"),
    [tab, setTab] = useState(""),
    [search, setSearch] = useState(""),
    [form, setForm] = useState<string | null>(null),
    [prefill, setPrefill] = useState<Row>({}),
    [detail, setDetail] = useState<{ kind: string; row: Row } | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [sidebar, setSidebar] = useState(false),
    [newMenu, setNewMenu] = useState(false),
    [theme, setTheme] = useState(s.settings().theme),
    [property, setProperty] = useState(""),
    [from, setFrom] = useState(s.today().slice(0, 7) + "-01"),
    [to, setTo] = useState(s.today()),
    [month, setMonth] = useState(s.today().slice(0, 7));
  const settings = s.settings();
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    let last = Date.now();
    const active = () => {
      last = Date.now();
    };
    window.addEventListener("pointerdown", active);
    window.addEventListener("keydown", active);
    const timer = setInterval(() => {
      if (Date.now() - last > 10 * 60 * 1000) void onLock();
    }, 15000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pointerdown", active);
      window.removeEventListener("keydown", active);
    };
  }, []);
  useEffect(() => {
    const handler = (e: Event) => setError((e as CustomEvent).detail);
    window.addEventListener("propertyos-error", handler);
    return () => window.removeEventListener("propertyos-error", handler);
  }, []);
  const refresh = () => setRev((x) => x + 1);
  const act = async (
    fn: () => Promise<any>,
    success = adapter instanceof CloudStorage
      ? "Saved securely to your cloud workspace."
      : "Saved securely on this device.",
  ) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await fn();
      refresh();
      setNotice(typeof success === "function" ? success : success);
      return result;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const run = async () => {
      try {
        const n = await s.runAutomation();
        if (n) setNotice(`${n} missed invoice(s) generated.`);
        const backup = await s.v.backup();
        await adapter.checkpoint?.(s.today(), backup);
        refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    };
    void run();
    const timer = setInterval(() => void run(), 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);
  const go = (r: string, t = "") => {
    setRoute(r);
    setTab(t);
    setSearch("");
    setSidebar(false);
    setDetail(null);
  };
  const open = (type: string, values: Row = {}) => {
    setPrefill(values);
    setForm(type);
    setNewMenu(false);
  };
  const props = s.list("properties"),
    routeLabel = nav.find((n) => n[0] === route)?.[1] || route;
  const notify = (e: any) => setError(e.message);
  let kind =
    route === "tenants"
      ? tab || "tenants"
      : route === "rent"
        ? tab || "payments"
        : route === "invoices"
          ? tab || "invoices"
          : route === "investments"
            ? tab || "investments"
            : route === "owners"
              ? tab || "owners"
              : route === "budgets"
                ? "expense_budgets"
                : route === "accounts"
                  ? "financial_accounts"
                  : route === "maintenance"
                    ? "maintenance_requests"
                    : route;
  const filter = (rows: Row[]) =>
    rows
      .filter(
        (r) =>
          !property ||
          r.property_id === property ||
          r.id === property ||
          ["tenants", "owners", "financial_accounts", "documents"].includes(
            kind,
          ),
      )
      .filter((r) => {
        const d =
          r.payment_date || r.entry_date || r.issue_date || r.valuation_date;
        if (d && (d < from || d > to)) return false;
        return true;
      });
  const metrics = s.metrics(from, to, property);
  const trends = s.trends(to, property).map((t) => ({
    ...t,
    billed: (t.rent + t.service + t.other) / 100,
    received: t.collected / 100,
    income: (t.rent + t.service + t.other) / 100,
    cost: t.operating / 100,
    netCash: t.cash / 100,
  }));
  const searchResults = search.trim()
    ? [
        "properties",
        "units",
        "tenants",
        "leases",
        "invoices",
        "payments",
        "investment_assets",
        "owners",
      ].flatMap((k) =>
        s
          .list(k)
          .filter((r) =>
            [
              r.name,
              r.number,
              r.phone,
              r.tenant,
              r.unit,
              r.receipt_number,
              r.property,
            ].some((v) =>
              String(v ?? "")
                .toLowerCase()
                .includes(search.toLowerCase()),
            ),
          )
          .slice(0, 5)
          .map((row) => ({ kind: k, row })),
      )
    : [];
  return (
    <div className="workspace">
      <aside className={sidebar ? "sidebar visible" : "sidebar"}>
        <Brand />
        <div className="portfolio-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {nav.map(([key, label, Icon]) => (
            <button
              key={key}
              className={route === key ? "nav-item active" : "nav-item"}
              onClick={() => go(key)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {route === key && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="avatar">
            {settings.business_name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <b>{settings.business_name}</b>
            <small>Owner · Local workspace</small>
          </div>
          <button
            title="Lock workspace"
            aria-label="Lock workspace"
            onClick={() => void onLock()}
          >
            <Lock size={16} />
          </button>
        </div>
      </aside>
      {sidebar && (
        <button
          className="scrim"
          aria-label="Close navigation"
          onClick={() => setSidebar(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-btn mobile-menu"
              aria-label="Open navigation"
              onClick={() => setSidebar(true)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <b>{routeLabel}</b>
          </div>
          <div className="topbar-right">
            <div className="global-search">
              <Search size={17} />
              <input
                aria-label="Search all records"
                placeholder="Search your workspace"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button aria-label="Clear search" onClick={() => setSearch("")}>
                  <X size={14} />
                </button>
              )}
              {search && (
                <div className="search-results">
                  {searchResults.length ? (
                    searchResults.map(({ kind, row }) => (
                      <button
                        key={kind + row.id}
                        onClick={() => {
                          setDetail({ kind, row });
                          setSearch("");
                        }}
                      >
                        <span>
                          {row.name ||
                            row.receipt_number ||
                            row.number ||
                            row.tenant}
                        </span>
                        <small>
                          {kind} ·{" "}
                          {row.unit ||
                            row.property ||
                            row.phone ||
                            row.id.slice(0, 8)}
                        </small>
                      </button>
                    ))
                  ) : (
                    <p>No matching records</p>
                  )}
                </div>
              )}
            </div>
            <ConnectionStatus adapter={adapter} />
            <button
              className="icon-btn"
              aria-label="Toggle dark theme"
              onClick={() => {
                const t = theme === "light" ? "dark" : "light";
                setTheme(t);
                void act(() => s.saveSettings({ theme: t })).catch(notify);
              }}
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <div className="new-menu">
              <button
                className="primary compact"
                onClick={() => setNewMenu(!newMenu)}
              >
                <Plus size={17} /> New
              </button>
              {newMenu && (
                <div className="action-dropdown">
                  {[
                    "property",
                    "unit",
                    "tenant",
                    "lease",
                    "payment",
                    "expense",
                    "investment",
                    "investmentAsset",
                    "ownerTransaction",
                    "maintenance",
                  ].map((k) => (
                    <button key={k} onClick={() => open(k)}>
                      {forms[k].title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="content" key={route}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                PROPERTYOS /{" "}
                {route === "dashboard" ? "OVERVIEW" : route.toUpperCase()}
              </div>
              <h1>
                {route === "dashboard"
                  ? "Your portfolio, at a glance."
                  : routeLabel}
              </h1>
              <p>
                {route === "dashboard"
                  ? "A clear view of your properties, collections, and financial health."
                  : "Private records, connected history, and clear financial information."}
              </p>
            </div>
            {defaults[route] && route !== "invoices" && (
              <button className="primary" onClick={() => open(defaults[route])}>
                <Plus size={17} />
                {forms[defaults[route]].title}
              </button>
            )}
          </div>
          {error && (
            <div role="alert" className="error dismissible">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={15} />
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="success dismissible">
              <CheckCircle2 size={17} />
              {notice}
              <button
                aria-label="Dismiss message"
                onClick={() => setNotice("")}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {!["settings", "database", "documents"].includes(route) && (
            <div className="filterbar">
              <label>
                <Building2 size={15} />
                <select
                  aria-label="Property filter"
                  value={property}
                  onChange={(e) => setProperty(e.target.value)}
                >
                  <option value="">All properties</option>
                  {props.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <CalendarDays size={15} />
                <input
                  aria-label="From date"
                  type="date"
                  value={from}
                  onChange={(e) => {
                    if (e.target.value && e.target.value <= to)
                      setFrom(e.target.value);
                  }}
                />
              </label>
              <span>to</span>
              <label>
                <input
                  aria-label="To date"
                  type="date"
                  value={to}
                  onChange={(e) => {
                    if (e.target.value && e.target.value >= from)
                      setTo(e.target.value);
                  }}
                />
              </label>
              <button
                className="text-btn"
                onClick={() => {
                  const m = s.today().slice(0, 7);
                  setFrom(m + "-01");
                  setTo(s.today());
                }}
              >
                This month
              </button>
            </div>
          )}
          {route === "dashboard" ? (
            <>
              <div className="hero-card">
                <div>
                  <div className="hero-label">
                    RENT COLLECTED · SELECTED PERIOD
                  </div>
                  <strong>{format(metrics.collected)}</strong>
                  <p>From posted payments, refunds, and reversals</p>
                  <button onClick={() => open("payment")}>
                    Record a payment <ArrowUpRight size={17} />
                  </button>
                </div>
                <div className="hero-stats">
                  <div>
                    <span>Expected monthly rent & charges</span>
                    <b>{format(metrics.expected)}</b>
                  </div>
                  <div>
                    <span>Outstanding invoices</span>
                    <b>{format(metrics.outstanding)}</b>
                  </div>
                  <div>
                    <span>Net cash movement</span>
                    <b>{format(metrics.cash)}</b>
                  </div>
                </div>
                <div className="hero-building" aria-hidden="true">
                  <Building2 size={160} strokeWidth={0.8} />
                </div>
              </div>
              <div className="stat-grid">
                {[
                  [
                    "properties",
                    "Properties",
                    metrics.properties,
                    "In your portfolio",
                    Building2,
                  ],
                  [
                    "units",
                    "Rentable units",
                    metrics.units,
                    `${metrics.occupied} occupied · ${metrics.vacant} vacant`,
                    DoorOpen,
                  ],
                  [
                    "units",
                    "Occupancy",
                    metrics.occupancy.toFixed(1) + "%",
                    "At end of selected period",
                    Users,
                  ],
                  [
                    "invoices",
                    "Overdue invoices",
                    metrics.overdue,
                    "Open invoices past the due date",
                    FileText,
                  ],
                ].map(([r, label, value, sub, Icon]: any) => (
                  <button
                    key={label}
                    className="stat-card"
                    onClick={() => go(r)}
                  >
                    <div>
                      <span>{label}</span>
                      <Icon size={19} />
                    </div>
                    <strong>{value}</strong>
                    <small>{sub}</small>
                  </button>
                ))}
              </div>
              {!metrics.properties && (
                <div className="onboarding card">
                  <div>
                    <div className="eyebrow">A CLEAN START</div>
                    <h2>Your portfolio starts here.</h2>
                    <p>
                      Add your first property, then its units and tenants. Every
                      figure on this dashboard comes from your saved records.
                    </p>
                  </div>
                  <button className="primary" onClick={() => open("property")}>
                    Add your first property <ArrowRight size={17} />
                  </button>
                </div>
              )}
              <div className="chart-grid">
                <ChartCard
                  title="Rent billed & collected"
                  subtitle="Six months · billed income and actual receipts"
                >
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={trends} barGap={5}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="var(--border)"
                      />
                      <XAxis
                        dataKey="month"
                        tickFormatter={(m) => m.slice(5)}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(n) => (n >= 1000 ? `${n / 1000}k` : n)}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip formatter={(v) => format(Number(v) * 100)} />
                      <Legend />
                      <Bar
                        isAnimationActive={false}
                        dataKey="billed"
                        name="Billed"
                        fill="#b8d6c8"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        isAnimationActive={false}
                        dataKey="received"
                        name="Collected"
                        fill="#255f50"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
                <ChartCard
                  title="Net cash movement"
                  subtitle="All cash inflows less outflows"
                >
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={trends}>
                      <defs>
                        <linearGradient
                          id="cashFill"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#529a82"
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="100%"
                            stopColor="#529a82"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="var(--border)"
                      />
                      <XAxis
                        dataKey="month"
                        tickFormatter={(m) => m.slice(5)}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v) => format(Number(v) * 100)} />
                      <Area
                        isAnimationActive={false}
                        dataKey="netCash"
                        name="Cash movement"
                        stroke="#397d65"
                        fill="url(#cashFill)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>
              <div className="summary-grid">
                {[
                  ["Operating expenses", metrics.operating, "expenses"],
                  ["Net operating income", metrics.noi, "reports"],
                  [
                    "Deposits held",
                    metrics.deposits,
                    "rent",
                    "security_deposits",
                  ],
                  ["Capital invested", metrics.invested, "investments"],
                  [
                    "Estimated property value",
                    metrics.value,
                    "investments",
                    "property_valuations",
                  ],
                  ["Loan principal outstanding", metrics.loans, "loans"],
                ].map(([label, value, r, t]) => (
                  <button
                    key={label}
                    className="summary-card"
                    onClick={() => go(String(r), String(t || ""))}
                  >
                    <span>{label}</span>
                    <b>{format(Number(value))}</b>
                    <ArrowUpRight size={15} />
                  </button>
                ))}
              </div>
              <div className="chart-grid">
                <section className="card">
                  <div className="card-heading">
                    <h2>Recent collections</h2>
                    <button className="text-btn" onClick={() => go("rent")}>
                      View all <ArrowRight size={14} />
                    </button>
                  </div>
                  <DataTable
                    kind="payments"
                    rows={filter(s.list("payments")).slice(0, 5)}
                    onOpen={(r) => setDetail({ kind: "payments", row: r })}
                    compact
                  />
                </section>
                <section className="card">
                  <div className="card-heading">
                    <h2>Needs your attention</h2>
                  </div>
                  {[
                    ["Overdue invoices", metrics.overdue, "invoices"],
                    [
                      "Leases expiring in 30 days",
                      metrics.expiring,
                      "tenants",
                      "leases",
                    ],
                    [
                      "Maintenance requests",
                      metrics.maintenance,
                      "maintenance",
                    ],
                    ["Vacant units", metrics.vacant, "units"],
                  ].map(([label, n, r, t]) => (
                    <button
                      className="attention-row"
                      key={label}
                      onClick={() => go(String(r), String(t || ""))}
                    >
                      <span>{label}</span>
                      <b>{n}</b>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                </section>
              </div>
            </>
          ) : route === "reports" ? (
            <Reports
              s={s}
              initialReport={tab || "Portfolio summary"}
              from={from}
              to={to}
              property={property}
              onOpen={setDetail}
              onError={notify}
            />
          ) : route === "database" ? (
            <DatabaseScreen
              s={s}
              adapter={adapter}
              act={act}
              onError={notify}
            />
          ) : route === "settings" ? (
            <SettingsScreen
              s={s}
              act={act}
              onError={notify}
              onTheme={setTheme}
            />
          ) : route === "documents" ? (
            <DocumentsScreen s={s} act={act} onError={notify} />
          ) : (
            <>
              <div className="section-actions">
                {route === "properties" && (
                  <>
                    <button
                      className="secondary"
                      onClick={() => open("building")}
                    >
                      Add building
                    </button>
                    <button className="secondary" onClick={() => open("floor")}>
                      Add floor
                    </button>
                  </>
                )}
                {route === "units" && (
                  <>
                    <button className="secondary" onClick={() => open("meter")}>
                      Add meter
                    </button>
                    <button
                      className="secondary"
                      onClick={() => open("reading")}
                    >
                      Meter reading
                    </button>
                  </>
                )}
                {route === "tenants" && (
                  <>
                    <Tabs
                      values={["tenants", "leases", "lease_rent_schedules"]}
                      value={kind}
                      onChange={setTab}
                    />
                    <button className="secondary" onClick={() => open("lease")}>
                      Create lease
                    </button>
                    <button
                      className="secondary"
                      onClick={() => open("rentSchedule")}
                    >
                      Rent change
                    </button>
                  </>
                )}
                {(route === "rent" || route === "invoices") && (
                  <>
                    <Tabs
                      values={
                        route === "rent"
                          ? [
                              "payments",
                              "security_deposits",
                              "credit_notes",
                              "refunds",
                            ]
                          : ["invoices", "payments"]
                      }
                      value={kind}
                      onChange={setTab}
                    />
                    <button
                      className="secondary"
                      onClick={() => open("deposit")}
                    >
                      Deposit
                    </button>
                    <button
                      className="secondary"
                      onClick={() => open("customInvoice")}
                    >
                      One-time charge
                    </button>
                    <button
                      className="secondary"
                      onClick={() => open("credit")}
                    >
                      Credit note
                    </button>
                    <button
                      className="secondary"
                      onClick={() => open("refund")}
                    >
                      Advance refund
                    </button>
                  </>
                )}
                {route === "investments" && (
                  <>
                    <Tabs
                      values={[
                        "investments",
                        "property_valuations",
                        "investment_assets",
                        "investment_transactions",
                      ]}
                      value={kind}
                      onChange={setTab}
                    />
                    <button
                      className="secondary"
                      onClick={() => open("valuation")}
                    >
                      Add valuation
                    </button>
                    <button
                      className="secondary"
                      onClick={() => open("investmentAsset")}
                    >
                      Add investment holding
                    </button>
                    <button
                      className="secondary"
                      onClick={() => open("assetTransaction")}
                    >
                      Record investment transaction
                    </button>
                  </>
                )}
                {route === "owners" && (
                  <>
                    <Tabs
                      values={["owners", "owner_transactions"]}
                      value={kind}
                      onChange={setTab}
                    />
                    <button
                      className="secondary"
                      onClick={() => open("ownerTransaction")}
                    >
                      Record contribution / withdrawal
                    </button>
                  </>
                )}
                {route === "budgets" && (
                  <button
                    className="secondary"
                    onClick={() => go("reports", "Budget versus actual")}
                  >
                    View budget report in Reports
                  </button>
                )}
                {route === "loans" && (
                  <button
                    className="secondary"
                    onClick={() => open("loanPayment")}
                  >
                    Record installment
                  </button>
                )}
                {route === "expenses" && (
                  <>
                    <button
                      className="secondary"
                      onClick={() => open("expensePayment")}
                    >
                      Pay vendor bill
                    </button>
                    <button
                      className="secondary"
                      onClick={() => open("vendor")}
                    >
                      Add vendor
                    </button>
                    <button
                      className="secondary"
                      onClick={() => open("recurringExpense")}
                    >
                      Recurring expense
                    </button>
                  </>
                )}
                {route === "accounts" && (
                  <button
                    className="secondary"
                    onClick={() => open("transfer")}
                  >
                    Transfer funds
                  </button>
                )}
              </div>
              {(route === "rent" || route === "invoices") && (
                <div className="billing-banner">
                  <div>
                    <h3>Monthly rent billing</h3>
                    <p>
                      Uses lease terms, rent changes, proration, and entered
                      meter readings. Duplicate runs are safely skipped.
                    </p>
                  </div>
                  <input
                    type="month"
                    aria-label="Billing month"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                  />
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        const n = await s.billMonth(month);
                        setNotice(
                          `${n} invoice(s) issued. Existing invoices were preserved.`,
                        );
                        return n;
                      }, "Billing completed. Existing invoices were preserved.").catch(
                        notify,
                      )
                    }
                  >
                    Generate invoices
                  </button>
                </div>
              )}
              <div className="card table-card">
                <div className="card-heading">
                  <h2>{human(kind)}</h2>
                  <span className="muted">
                    {filter(s.list(kind)).length} records
                  </span>
                </div>
                <DataTable
                  key={kind + rev}
                  kind={kind}
                  rows={filter(s.list(kind)).map((r) =>
                    kind === "financial_accounts"
                      ? { ...r, balance: s.accountBalance(r.id, to) }
                      : kind === "loans"
                        ? { ...r, balance: s.loanBalance(r.id) }
                        : r,
                  )}
                  onOpen={(r) => setDetail({ kind, row: r })}
                  onExport={(rows) => {
                    try {
                      csv(rows, "PropertyOS-" + kind);
                    } catch (e) {
                      notify(e);
                    }
                  }}
                />
              </div>
            </>
          )}
          <footer className="content-footer">
            <span>
              <ShieldCheck size={13} />{" "}
              {adapter instanceof CloudStorage
                ? "Encrypted records · Cloud workspace"
                : "Your data stays on this device."}
            </span>
            <span>
              PropertyOS 0.2 · {settings.currency} · {settings.timezone}
            </span>
          </footer>
        </main>
      </div>
      {form && (
        <RecordForm
          type={form}
          prefill={prefill}
          s={s}
          onClose={() => setForm(null)}
          onSave={async (x) => {
            await act(() => (s as any)[forms[form].method](x));
            setForm(null);
          }}
        />
      )}
      {detail && (
        <RecordDetail
          key={detail.kind + detail.row.id}
          kind={detail.kind}
          row={detail.row}
          s={s}
          from={from}
          to={to}
          onClose={() => setDetail(null)}
          onOpen={setDetail}
          onAction={open}
          act={act}
          onError={notify}
        />
      )}
    </div>
  );
}
const human = (s: string) =>
  s.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
function Tabs({
  values,
  value,
  onChange,
}: {
  values: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="tabs">
      {values.map((v) => (
        <button
          className={v === value ? "selected" : ""}
          key={v}
          onClick={() => onChange(v)}
        >
          {human(v)}
        </button>
      ))}
    </div>
  );
}
function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="card chart-card">
      <h2>{title}</h2>
      <p>{subtitle}</p>
      {children}
    </section>
  );
}
const columns: Record<
  string,
  { key: string; label: string; money?: boolean }[]
> = {
  properties: [
    { key: "name", label: "Property" },
    { key: "category", label: "Type" },
    { key: "address", label: "Location" },
    { key: "units", label: "Units" },
  ],
  units: [
    { key: "number", label: "Unit" },
    { key: "property", label: "Property" },
    { key: "type", label: "Type" },
    { key: "monthly_rent", label: "Base rent", money: true },
    { key: "occupied", label: "Occupied" },
  ],
  tenants: [
    { key: "name", label: "Tenant" },
    { key: "phone", label: "Contact" },
    { key: "email", label: "Email" },
    { key: "occupation", label: "Occupation" },
  ],
  leases: [
    { key: "tenant", label: "Tenant" },
    { key: "property", label: "Property" },
    { key: "unit", label: "Unit" },
    { key: "start_date", label: "Start" },
    { key: "end_date", label: "End" },
    { key: "rent", label: "Rent", money: true },
  ],
  invoices: [
    { key: "number", label: "Invoice" },
    { key: "tenant", label: "Tenant" },
    { key: "month", label: "Period" },
    { key: "due_date", label: "Due date" },
    { key: "total", label: "Total", money: true },
    { key: "balance", label: "Outstanding", money: true },
    { key: "status", label: "Status" },
  ],
  payments: [
    { key: "receipt_number", label: "Receipt" },
    { key: "tenant", label: "Tenant" },
    { key: "payment_date", label: "Date" },
    { key: "method", label: "Method" },
    { key: "amount", label: "Amount", money: true },
    { key: "status", label: "Status" },
  ],
  expenses: [
    { key: "description", label: "Expense" },
    { key: "property", label: "Property" },
    { key: "entry_date", label: "Date" },
    { key: "category", label: "Category" },
    { key: "amount", label: "Amount", money: true },
    { key: "status", label: "Status" },
  ],
  investments: [
    { key: "description", label: "Investment" },
    { key: "entry_date", label: "Date" },
    { key: "category", label: "Category" },
    { key: "amount", label: "Capital", money: true },
  ],
  investment_assets: [
    { key: "name", label: "Investment" },
    { key: "category", label: "Type" },
    { key: "institution", label: "Institution / partner" },
    { key: "balance", label: "Remaining cost basis", money: true },
    { key: "realized", label: "Realized returns", money: true },
  ],
  investment_transactions: [
    { key: "investment", label: "Investment" },
    { key: "entry_date", label: "Date" },
    { key: "kind", label: "Transaction" },
    { key: "amount", label: "Cash amount", money: true },
    { key: "principal", label: "Cost basis", money: true },
    { key: "status", label: "Status" },
  ],
  owners: [
    { key: "name", label: "Owner / investor" },
    { key: "contact", label: "Contact" },
    { key: "balance", label: "Net capital contributed", money: true },
  ],
  owner_transactions: [
    { key: "owner", label: "Owner" },
    { key: "entry_date", label: "Date" },
    { key: "direction", label: "Movement" },
    { key: "amount", label: "Amount", money: true },
    { key: "property", label: "Property" },
    { key: "status", label: "Status" },
  ],
  expense_budgets: [
    { key: "property", label: "Property" },
    { key: "month", label: "Month" },
    { key: "category", label: "Category" },
    { key: "amount", label: "Budget", money: true },
  ],
  budget_report: [
    { key: "property", label: "Property" },
    { key: "month", label: "Month" },
    { key: "category", label: "Category" },
    { key: "budget", label: "Budget", money: true },
    { key: "actual", label: "Actual", money: true },
    { key: "variance", label: "Remaining / overspend", money: true },
  ],
  property_valuations: [
    { key: "valuation_date", label: "Date" },
    { key: "property_id", label: "Property ID" },
    { key: "value", label: "Estimated value", money: true },
    { key: "notes", label: "Basis" },
  ],
  loans: [
    { key: "lender", label: "Lender" },
    { key: "start_date", label: "Disbursed" },
    { key: "principal", label: "Initial principal", money: true },
    { key: "annual_rate_bps", label: "Rate (bps)" },
    { key: "balance", label: "Outstanding", money: true },
  ],
  maintenance_requests: [
    { key: "description", label: "Request" },
    { key: "category", label: "Category" },
    { key: "priority", label: "Priority" },
    { key: "scheduled_on", label: "Scheduled" },
    { key: "status", label: "Status" },
    { key: "estimated_cost", label: "Estimate", money: true },
  ],
  financial_accounts: [
    { key: "code", label: "Code" },
    { key: "name", label: "Account" },
    { key: "type", label: "Type" },
    { key: "balance", label: "Dr − Cr balance", money: true },
  ],
  security_deposits: [
    { key: "entry_date", label: "Date" },
    { key: "lease_id", label: "Lease ID" },
    { key: "direction", label: "Movement" },
    { key: "amount", label: "Amount", money: true },
  ],
  lease_rent_schedules: [
    { key: "effective_on", label: "Effective" },
    { key: "lease_id", label: "Lease ID" },
    { key: "rent", label: "Monthly rent", money: true },
  ],
  credit_notes: [
    { key: "number", label: "Credit note" },
    { key: "entry_date", label: "Date" },
    { key: "reason", label: "Reason" },
    { key: "amount", label: "Credit", money: true },
  ],
  refunds: [
    { key: "entry_date", label: "Date" },
    { key: "reason", label: "Reason" },
    { key: "amount", label: "Refund", money: true },
  ],
  documents: [
    { key: "name", label: "File" },
    { key: "category", label: "Category" },
    { key: "entity_type", label: "Linked to" },
    { key: "version", label: "Version" },
    { key: "size", label: "Bytes" },
  ],
  statement: [
    { key: "date", label: "Date" },
    { key: "description", label: "Description" },
    { key: "charge", label: "Charge", money: true },
    { key: "payment", label: "Payment / credit", money: true },
    { key: "balance", label: "Balance", money: true },
  ],
  account_statement: [
    { key: "date", label: "Date" },
    { key: "description", label: "Description" },
    { key: "debit", label: "Debit", money: true },
    { key: "credit", label: "Credit", money: true },
    { key: "balance", label: "Balance", money: true },
  ],
  trial: [
    { key: "code", label: "Code" },
    { key: "name", label: "Account" },
    { key: "debit", label: "Debits", money: true },
    { key: "credit", label: "Credits", money: true },
  ],
  activity_logs: [
    { key: "created_at", label: "Timestamp" },
    { key: "action", label: "Action" },
    { key: "entity_type", label: "Record type" },
    { key: "entity_id", label: "Record ID" },
  ],
  amortization: [
    { key: "period", label: "Month" },
    { key: "payment", label: "Installment", money: true },
    { key: "principal", label: "Principal", money: true },
    { key: "interest", label: "Interest", money: true },
    { key: "balance", label: "Remaining", money: true },
  ],
};
function DataTable({
  kind,
  rows,
  onOpen,
  onExport,
  compact = false,
  columnOverride,
}: {
  kind: string;
  rows: Row[];
  onOpen?: (r: Row) => void;
  onExport?: (r: Row[]) => void;
  compact?: boolean;
  columnOverride?: { key: string; label: string; money?: boolean }[];
}) {
  const [q, setQ] = useState(""),
    [sort, setSort] = useState(""),
    [desc, setDesc] = useState(false),
    [page, setPage] = useState(0);
  const cols =
    columnOverride ||
    columns[kind] ||
    Object.keys(rows[0] || {})
      .filter(
        (k) =>
          !["id", "snapshot", "content", "journal_id", "updated_at"].includes(
            k,
          ),
      )
      .slice(0, 6)
      .map((k) => ({
        key: k,
        label: human(k),
        money: ["amount", "rent", "principal", "interest"].includes(k),
      }));
  let filtered = rows.filter((r) =>
    Object.entries(r)
      .filter(([k]) => !["content", "snapshot"].includes(k))
      .some(([, v]) =>
        String(v ?? "")
          .toLowerCase()
          .includes(q.toLowerCase()),
      ),
  );
  if (sort)
    filtered = [...filtered].sort(
      (a, b) =>
        (typeof a[sort] === "number"
          ? a[sort] - b[sort]
          : String(a[sort] ?? "").localeCompare(String(b[sort] ?? ""))) *
        (desc ? -1 : 1),
    );
  const pages = Math.ceil(filtered.length / 50),
    visible = filtered.slice(page * 50, page * 50 + 50);
  return (
    <>
      {!compact && (
        <div className="table-toolbar">
          <label>
            <Search size={16} />
            <input
              aria-label="Search this table"
              placeholder="Search records…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
            />
          </label>
          {onExport && (
            <button
              className="secondary small"
              onClick={() => onExport(filtered)}
            >
              <Download size={14} /> Export CSV
            </button>
          )}
        </div>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key}>
                  <button
                    onClick={() => {
                      setDesc(sort === c.key ? !desc : false);
                      setSort(c.key);
                    }}
                  >
                    {c.label}
                    {sort === c.key ? (desc ? " ↓" : " ↑") : ""}
                  </button>
                </th>
              ))}
              {onOpen && <th aria-label="Details" />}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r.id || i}>
                {cols.map((c, ci) => (
                  <td key={c.key} className={c.money ? "money-cell" : ""}>
                    {ci === 0 && onOpen ? (
                      <button className="row-link" onClick={() => onOpen(r)}>
                        {String(r[c.key] ?? "—")}
                      </button>
                    ) : c.money ? (
                      format(Number(r[c.key] ?? 0))
                    ) : c.key === "status" ? (
                      <span
                        className={
                          "badge " + String(r.status).replaceAll(" ", "-")
                        }
                      >
                        {r.status}
                      </span>
                    ) : c.key === "occupied" ? (
                      <span className={r.occupied ? "badge paid" : "badge"}>
                        {r.occupied ? "Yes" : "No"}
                      </span>
                    ) : (
                      <span>{String(r[c.key] ?? "—")}</span>
                    )}
                  </td>
                ))}
                {onOpen && (
                  <td>
                    <button
                      className="icon-btn"
                      aria-label={`Open ${r.name || r.number || r.receipt_number || "record"}`}
                      onClick={() => onOpen(r)}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && (
          <div className="empty-state">
            <FolderOpen size={28} />
            <h3>{q ? "No matching records" : "No records yet"}</h3>
            <p>
              {q ? "Try another search." : "Saved records will appear here."}
            </p>
          </div>
        )}
      </div>
      {!compact && pages > 1 && (
        <div className="pagination">
          <button
            className="secondary small"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span>
            Page {page + 1} of {pages}
          </span>
          <button
            className="secondary small"
            disabled={page >= pages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const d = ref.current;
    const initial = document.activeElement as HTMLElement;
    return () => {
      d?.close();
      initial?.focus?.();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={wide ? "modal wide" : "modal"}
      aria-label={title}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          className="icon-btn"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function RecordForm({
  type,
  prefill,
  s,
  onClose,
  onSave,
}: {
  type: string;
  prefill: Row;
  s: PropertyService;
  onClose: () => void;
  onSave: (x: Row) => Promise<void>;
}) {
  const spec = forms[type];
  const initial: Row = {};
  for (const f of spec.fields)
    initial[f.key] =
      prefill[f.key] ??
      f.default ??
      (f.type === "date"
        ? s.today()
        : f.type === "month"
          ? s.today().slice(0, 7)
          : f.type === "checkbox"
            ? false
            : f.type === "money"
              ? "0"
              : f.type === "select" && f.options
                ? f.options[0]
                : "");
  const [values, setValues] = useState(initial),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const change = (key: string, v: any) => {
    const next = { ...values, [key]: v };
    if (key === "property_id") {
      next.unit_id = "";
      next.building_id = "";
      next.floor_id = "";
    }
    if (key === "building_id") next.floor_id = "";
    if (type === "lease" && key === "unit_id" && v) {
      const unit = s.list("units").find((u) => u.id === v)!;
      next.rent = (unit.monthly_rent / 100).toFixed(2);
      next.service_charge = (unit.service_charge / 100).toFixed(2);
      next.deposit = (unit.deposit_required / 100).toFixed(2);
    }
    setValues(next);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const x = { ...values };
      for (const f of spec.fields) {
        if (f.type === "money") x[f.key] = money(String(values[f.key] || "0"));
        if (f.type === "number") x[f.key] = Number(values[f.key] || 0);
      }
      await onSave(x);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={spec.title} onClose={onClose}>
      <form onSubmit={submit}>
        {spec.hint && <p className="form-hint">{spec.hint}</p>}
        <div className="form-grid">
          {spec.fields.map((f) => (
            <label
              key={f.key}
              className={
                f.type === "textarea" || f.type === "checkbox" ? "span-two" : ""
              }
            >
              {f.type === "checkbox" ? (
                <span className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={!!values[f.key]}
                    onChange={(e) => change(f.key, e.target.checked)}
                  />
                  {f.label}
                </span>
              ) : (
                <>
                  {f.label}
                  {f.optional && <small>Optional</small>}
                  {f.type === "select" ? (
                    <select
                      name={f.key}
                      aria-label={f.label}
                      required={!f.optional}
                      value={values[f.key]}
                      onChange={(e) => change(f.key, e.target.value)}
                    >
                      {!f.options && (
                        <option value="">
                          {f.optional ? "None" : "Choose…"}
                        </option>
                      )}
                      {f.options?.map((o) => (
                        <option value={o} key={o}>
                          {human(o)}
                        </option>
                      ))}
                      {f.source &&
                        choices(s, f.source, values).map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                    </select>
                  ) : f.type === "textarea" ? (
                    <textarea
                      name={f.key}
                      aria-label={f.label}
                      required={!f.optional}
                      value={values[f.key]}
                      onChange={(e) => change(f.key, e.target.value)}
                      rows={3}
                    />
                  ) : (
                    <input
                      name={f.key}
                      aria-label={f.label}
                      required={!f.optional}
                      type={f.type === "money" ? "text" : f.type || "text"}
                      inputMode={f.type === "money" ? "decimal" : undefined}
                      min={f.type === "number" ? 0 : undefined}
                      step={f.type === "number" ? 1 : undefined}
                      value={values[f.key]}
                      onChange={(e) => change(f.key, e.target.value)}
                    />
                  )}
                </>
              )}
            </label>
          ))}
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-footer">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save record"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function RecordDetail({
  kind,
  row,
  s,
  from,
  to,
  onClose,
  onOpen,
  onAction,
  act,
  onError,
}: {
  kind: string;
  row: Row;
  s: PropertyService;
  from: string;
  to: string;
  onClose: () => void;
  onOpen: (d: { kind: string; row: Row }) => void;
  onAction: (k: string, p?: Row) => void;
  act: (f: () => Promise<any>, success?: string) => Promise<any>;
  onError: (e: any) => void;
}) {
  const [view, setView] = useState("overview"),
    [reason, setReason] = useState(""),
    [status, setStatus] = useState(row.status || "open"),
    [moveout, setMoveout] = useState(s.today()),
    [edit, setEdit] = useState(false),
    [values, setValues] = useState<Row>(row);
  const r = (() => {
    try {
      return s.list(kind).find((x) => x.id === row.id) ?? row;
    } catch {
      return row;
    }
  })();
  let related: Row[] = [],
    relatedKind = "";
  if (kind === "properties" && view !== "overview" && view !== "timeline") {
    relatedKind = view;
    related = s
      .list(view)
      .filter(
        (x) =>
          x.property_id === r.id ||
          (view === "leases" &&
            s
              .list("units")
              .some((u) => u.id === x.unit_id && u.property_id === r.id)),
      );
  }
  if (kind === "units" && view !== "overview" && view !== "timeline") {
    relatedKind = view;
    related = s
      .list(view)
      .filter(
        (x) =>
          x.unit_id === r.id ||
          (view === "invoices" &&
            s
              .list("leases")
              .some((l) => l.id === x.lease_id && l.unit_id === r.id)),
      );
  }
  if (kind === "tenants" && view === "leases") {
    relatedKind = "leases";
    related = s.list("leases").filter((l) => l.tenant_id === r.id);
  }
  const statement =
    kind === "tenants"
      ? s.statement(r.id, from, to)
      : kind === "financial_accounts"
        ? s.accountStatement(r.id, from, to)
        : null;
  const title =
    r.name ||
    r.number ||
    r.receipt_number ||
    r.description ||
    r.lender ||
    human(kind);
  const ignore = [
    "id",
    "snapshot",
    "content",
    "journal_id",
    "updated_at",
    "created_at",
    "property_id",
    "unit_id",
    "tenant_id",
    "account_id",
    "lease_id",
  ];
  const editable = ["properties", "units", "tenants"].includes(kind);
  const editKeys =
    kind === "properties"
      ? ["name", "category", "address", "notes"]
      : kind === "units"
        ? ["number", "type", "size", "notes", "status"]
        : [
            "name",
            "phone",
            "email",
            "address",
            "emergency_contact",
            "occupation",
            "guarantor",
            "notes",
          ];
  const getTimeline = () => s.timeline(kind, r.id);
  return (
    <Modal title={title} wide onClose={onClose}>
      <div className="detail-toolbar">
        <span className="record-id">
          {human(kind)} · {r.id?.slice(0, 8)}
        </span>
        {editable && (
          <button className="secondary small" onClick={() => setEdit(!edit)}>
            {edit ? "Cancel editing" : "Edit profile"}
          </button>
        )}
        {kind === "invoices" && (
          <>
            <button
              className="primary small"
              onClick={() => void invoicePDF(s, r).catch(onError)}
            >
              <Download size={15} /> Save PDF
            </button>
            <button className="secondary small" onClick={() => window.print()}>
              Print
            </button>
            <button
              className="secondary small"
              onClick={() => {
                onClose();
                onAction("payment", { lease_id: r.lease_id });
              }}
            >
              Record payment
            </button>
          </>
        )}
        {kind === "payments" && (
          <>
            <button
              className="primary small"
              onClick={() => void receiptPDF(s, r).catch(onError)}
            >
              <Download size={15} /> Receipt PDF
            </button>
            <button className="secondary small" onClick={() => window.print()}>
              Print
            </button>
          </>
        )}
        {kind === "properties" && (
          <button
            className="secondary small"
            onClick={() => {
              onClose();
              onAction("unit", { property_id: r.id });
            }}
          >
            Add unit
          </button>
        )}
        {kind === "units" && (
          <button
            className="secondary small"
            onClick={() => {
              onClose();
              onAction("lease", { unit_id: r.id });
            }}
          >
            Create lease
          </button>
        )}
      </div>
      {["properties", "units", "tenants", "financial_accounts"].includes(
        kind,
      ) && (
        <Tabs
          value={view}
          onChange={setView}
          values={
            kind === "properties"
              ? [
                  "overview",
                  "units",
                  "leases",
                  "invoices",
                  "payments",
                  "expenses",
                  "investments",
                  "maintenance_requests",
                  "timeline",
                ]
              : kind === "units"
                ? [
                    "overview",
                    "leases",
                    "invoices",
                    "expenses",
                    "maintenance_requests",
                    "timeline",
                  ]
                : kind === "tenants"
                  ? ["overview", "statement", "leases", "timeline"]
                  : ["overview", "statement"]
          }
        />
      )}
      {edit ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const changes = Object.fromEntries(
                editKeys.map((k) => [k, String(values[k] ?? "")]),
              );
              await act(() =>
                s.updateRecord(kind as any, r.id, changes, row.updated_at),
              );
              setEdit(false);
              onClose();
            } catch (e) {
              onError(e);
            }
          }}
        >
          <div className="form-grid">
            {editKeys.map((k) => (
              <label key={k}>
                {human(k)}
                {k === "status" ? (
                  <select
                    value={values[k]}
                    onChange={(e) =>
                      setValues({ ...values, [k]: e.target.value })
                    }
                  >
                    <option>available</option>
                    <option>maintenance</option>
                    <option>retired</option>
                  </select>
                ) : (
                  <input
                    value={values[k] ?? ""}
                    required={[
                      "name",
                      "number",
                      "phone",
                      "category",
                      "type",
                    ].includes(k)}
                    onChange={(e) =>
                      setValues({ ...values, [k]: e.target.value })
                    }
                  />
                )}
              </label>
            ))}
          </div>
          <button className="primary">Save profile</button>
        </form>
      ) : view === "timeline" ? (
        <DataTable kind="activity_logs" rows={getTimeline()} />
      ) : view === "statement" && statement ? (
        <>
          <div className="statement-totals">
            <span>
              Opening <b>{format(statement.opening)}</b>
            </span>
            <span>
              Closing <b>{format(statement.closing)}</b>
            </span>
            <button
              className="secondary small"
              onClick={() => {
                try {
                  csv(statement.rows, "PropertyOS-statement");
                } catch (e) {
                  onError(e);
                }
              }}
            >
              CSV
            </button>
            <button
              className="primary small"
              onClick={() =>
                void makePDF(
                  "ACCOUNT STATEMENT",
                  `${title} · ${from} to ${to}`,
                  statement.rows,
                  columns[
                    kind === "tenants" ? "statement" : "account_statement"
                  ].map((c, i) => ({ ...c, width: i === 1 ? 210 : 75 })),
                  [
                    `Opening balance: ${format(statement.opening)}`,
                    `Closing balance: ${format(statement.closing)}`,
                  ],
                  s.settings(),
                  "Statement-" + r.id.slice(0, 8),
                ).catch(onError)
              }
            >
              PDF
            </button>
          </div>
          <DataTable
            kind={kind === "tenants" ? "statement" : "account_statement"}
            rows={statement.rows}
          />
        </>
      ) : relatedKind ? (
        <DataTable
          kind={relatedKind}
          rows={related}
          onOpen={(x) => onOpen({ kind: relatedKind, row: x })}
          onExport={(x) => csv(x, relatedKind)}
        />
      ) : kind === "invoices" || kind === "payments" ? (
        <FinancialDocument s={s} kind={kind} row={r} />
      ) : (
        <>
          <div className="detail-grid">
            {Object.entries(r)
              .filter(([k]) => !ignore.includes(k) && !k.endsWith("_id"))
              .map(([key, value]) => (
                <div key={key}>
                  <span>{human(key)}</span>
                  <b>
                    {[
                      "monthly_rent",
                      "service_charge",
                      "purchase_price",
                      "registration_cost",
                      "deposit_required",
                      "rent",
                      "deposit",
                      "amount",
                      "principal",
                      "interest",
                      "estimated_cost",
                      "value",
                      "balance",
                      "late_fee",
                      "purchases",
                      "proceeds",
                      "realized",
                    ].includes(key)
                      ? format(Number(value ?? 0))
                      : String(value ?? "—")}
                  </b>
                </div>
              ))}
          </div>
          {kind === "tenants" && (
            <div className="balance-strip">
              Current tenant account balance{" "}
              <b>{format(s.tenantBalance(r.id))}</b>
              <button className="text-btn" onClick={() => setView("statement")}>
                View statement <ArrowRight size={15} />
              </button>
            </div>
          )}
          {kind === "properties" && (
            <div className="summary-grid">
              {Object.entries(s.metrics(from, to, r.id))
                .filter(([k]) =>
                  [
                    "rent",
                    "operating",
                    "noi",
                    "cash",
                    "invested",
                    "value",
                    "loans",
                  ].includes(k),
                )
                .map(([k, v]) => (
                  <div className="summary-card" key={k}>
                    <span>{human(k)}</span>
                    <b>{format(Number(v))}</b>
                  </div>
                ))}
            </div>
          )}
          {kind === "loans" && (
            <>
              <h3>Planning amortization schedule</h3>
              <p className="muted">
                Fixed rate, rounded monthly interest; actual payments are
                entered separately.
              </p>
              <DataTable
                kind="amortization"
                rows={amortization(
                  r.principal,
                  r.annual_rate_bps,
                  r.term_months,
                )}
                onExport={(x) => csv(x, "Loan-schedule")}
              />
              <button
                className="primary"
                onClick={() => {
                  onClose();
                  onAction("loanPayment", { loan_id: r.id });
                }}
              >
                Record repayment
              </button>
            </>
          )}
          {kind === "maintenance_requests" && (
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                void act(() => s.updateMaintenance(r.id, status, reason))
                  .then(onClose)
                  .catch(onError);
              }}
            >
              <h3>Update request</h3>
              <label>
                Status
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {[
                    "open",
                    "scheduled",
                    "in_progress",
                    "completed",
                    "cancelled",
                  ].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label>
                Work notes
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <button className="primary">Save status</button>
            </form>
          )}
          {kind === "leases" && (
            <>
              <div className="balance-strip">
                Deposit held <b>{format(s.depositBalance(r.id))}</b>
                <button
                  className="secondary small"
                  onClick={() => {
                    onClose();
                    onAction("deposit", { lease_id: r.id });
                  }}
                >
                  Deposit movement
                </button>
              </div>
              <div className="section-actions">
                <button
                  className="secondary"
                  onClick={() => {
                    onClose();
                    onAction("rentSchedule", { lease_id: r.id });
                  }}
                >
                  Schedule rent increase
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    onClose();
                    onAction("lease", {
                      unit_id: r.unit_id,
                      tenant_id: r.tenant_id,
                      renewed_from: r.id,
                      start_date: new Date(Date.parse(r.end_date) + 86400000)
                        .toISOString()
                        .slice(0, 10),
                      rent: (r.rent / 100).toFixed(2),
                      service_charge: (r.service_charge / 100).toFixed(2),
                    });
                  }}
                >
                  Renew lease
                </button>
              </div>
              {r.status === "active" && (
                <form
                  className="inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act(() => s.endLease(r.id, moveout))
                      .then(onClose)
                      .catch(onError);
                  }}
                >
                  <h3>Record move-out</h3>
                  <p className="muted">
                    Invoices and payments remain. Review the statement and
                    refund the deposit separately for final settlement.
                  </p>
                  <label>
                    Move-out date
                    <input
                      type="date"
                      required
                      value={moveout}
                      onChange={(e) => setMoveout(e.target.value)}
                    />
                  </label>
                  <button className="secondary">End lease</button>
                </form>
              )}
            </>
          )}
        </>
      )}
      {kind === "investment_assets" && (
        <div className="section-actions">
          <button
            className="primary"
            onClick={() => {
              onClose();
              onAction("assetTransaction", { asset_id: r.id });
            }}
          >
            Record investment transaction
          </button>
        </div>
      )}
      {kind === "owners" && (
        <div className="section-actions">
          <button
            className="primary"
            onClick={() => {
              onClose();
              onAction("ownerTransaction", { owner_id: r.id });
            }}
          >
            Record owner capital
          </button>
        </div>
      )}
      {kind === "expense_budgets" && (
        <button
          className="primary"
          onClick={() => {
            onClose();
            onAction("budget", {
              property_id: r.property_id,
              month: r.month,
              category: r.category,
              amount: (r.amount / 100).toFixed(2),
            });
          }}
        >
          Edit this budget
        </button>
      )}
      {["owner_transactions", "investment_transactions"].includes(kind) &&
        r.status !== "reversed" && (
          <form
            className="reversal-form"
            onSubmit={(e) => {
              e.preventDefault();
              void act(() =>
                s.reversePortfolioTransaction(
                  kind as "owner_transactions" | "investment_transactions",
                  r.id,
                  reason,
                ),
              )
                .then(onClose)
                .catch(onError);
            }}
          >
            <details>
              <summary>Correct this posted transaction</summary>
              <p>
                Post a dated reversal while preserving the original transaction.
                Investment reversals must preserve a valid principal balance.
              </p>
              <label>
                Reason
                <input
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <button className="danger">Post reversal</button>
            </details>
          </form>
        )}
      {["invoices", "payments", "expenses"].includes(kind) &&
        !["reversed", "voided"].includes(r.status) && (
          <form
            className="reversal-form"
            onSubmit={(e) => {
              e.preventDefault();
              const type =
                kind === "invoices"
                  ? "invoice"
                  : kind === "payments"
                    ? "payment"
                    : "expense";
              void act(() => s.reverse(type, r.id, reason))
                .then(onClose)
                .catch(onError);
            }}
          >
            <details>
              <summary>Correct this posted transaction</summary>
              <p>
                Reversals add a new financial record and preserve the original.
                Allocated invoice payments must be reversed first.
              </p>
              <label>
                Reason
                <input
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <button className="danger">Post reversal</button>
            </details>
          </form>
        )}
    </Modal>
  );
}
function FinancialDocument({
  s,
  kind,
  row,
}: {
  s: PropertyService;
  kind: string;
  row: Row;
}) {
  const snap = JSON.parse(row.snapshot),
    invoice = kind === "invoices",
    items = invoice
      ? s.v.all(
          "SELECT description,amount FROM invoice_items WHERE invoice_id=?",
          [row.id],
        )
      : (snap.allocations ??
        s.v.all(
          "SELECT i.number description,a.amount FROM payment_allocations a JOIN invoices i ON i.id=a.invoice_id WHERE a.payment_id=? ORDER BY i.issue_date",
          [row.id],
        ));
  return (
    <article className="financial-document">
      <header>
        <div>
          {snap.business.logo_data && (
            <img
              className="document-logo"
              src={snap.business.logo_data}
              alt="Business logo"
            />
          )}
          <h2>{snap.business.business_name}</h2>
          <p>{snap.business.address}</p>
          <p>
            {snap.business.phone} {snap.business.email}
          </p>
        </div>
        <div>
          <h1>{invoice ? "INVOICE" : "MONEY RECEIPT"}</h1>
          <strong>{invoice ? row.number : row.receipt_number}</strong>
          <span className={"badge " + row.status}>{row.status}</span>
        </div>
      </header>
      <div className="document-meta">
        <div>
          <span>{invoice ? "BILL TO" : "RECEIVED FROM"}</span>
          <b>{snap.tenant}</b>
          <p>{snap.phone}</p>
          <p>
            {snap.property} · {snap.unit}
          </p>
        </div>
        <div>
          <p>
            <span>Date</span>
            <b>{invoice ? row.issue_date : row.payment_date}</b>
          </p>
          {invoice ? (
            <>
              <p>
                <span>Due date</span>
                <b>{row.due_date}</b>
              </p>
              <p>
                <span>Billing period</span>
                <b>{row.month}</b>
              </p>
            </>
          ) : (
            <>
              <p>
                <span>Method</span>
                <b>{row.method}</b>
              </p>
              <p>
                <span>Reference</span>
                <b>{row.reference || "—"}</b>
              </p>
            </>
          )}
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>{invoice ? "Description" : "Invoice allocation at receipt"}</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i: Row, n: number) => (
            <tr key={n}>
              <td>{i.description}</td>
              <td>{format(i.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="document-total">
        <span>{invoice ? "Current invoice total" : "Amount received"}</span>
        <b>{format(invoice ? row.total : row.amount)}</b>
      </div>
      {invoice ? (
        <div className="document-balances">
          <p>
            <span>
              Previous account balance at issue{" "}
              <small>Information only; excluded from invoice total</small>
            </span>
            <b>{format(snap.previous_balance)}</b>
          </p>
          <p>
            <span>Total account payable at issue</span>
            <b>{format(snap.account_payable)}</b>
          </p>
          <p>
            <span>Current unpaid invoice amount</span>
            <b>{format(s.invoiceBalance(row.id))}</b>
          </p>
        </div>
      ) : (
        <p className="document-balances">
          Account balance after payment was recorded:{" "}
          <b>{format(snap.balance_after)}</b>
        </p>
      )}
      <div className="document-notes">
        <h4>{invoice ? "Payment instructions" : "Payment confirmation"}</h4>
        <p>
          {invoice
            ? snap.business.payment_instructions
            : `${row.receipt_number} acknowledges receipt of ${format(row.amount)} by ${row.method}.`}
        </p>
        <p>{snap.business.terms}</p>
      </div>
      <footer>
        <span>Generated locally by PropertyOS</span>
        <div>Authorized signature</div>
      </footer>
    </article>
  );
}
function Reports({
  s,
  initialReport,
  from,
  to,
  property,
  onOpen,
  onError,
}: {
  s: PropertyService;
  initialReport: string;
  from: string;
  to: string;
  property: string;
  onOpen: (d: { kind: string; row: Row }) => void;
  onError: (e: any) => void;
}) {
  const [report, setReport] = useState(initialReport),
    [tenant, setTenant] = useState("");
  const reports = [
    "Portfolio summary",
    "Rent collection",
    "Monthly rent roll",
    "Tenant statement",
    "Property statement",
    "Unit statement",
    "Outstanding dues",
    "Arrears ageing",
    "Occupancy & vacancy",
    "Property income statement",
    "Income versus expense",
    "Cash flow",
    "Investment performance",
    "Financial investments",
    "Owner capital",
    "Budget versus actual",
    "Property comparison",
    "Rental yields",
    "Maintenance cost",
    "Security deposits",
    "Loan balances",
    "Annual summary",
    "Custom account statement",
    "Trial balance",
  ];
  const [account, setAccount] = useState("bank");
  const m = s.metrics(from, to, property);
  const scoped = (r: Row) => !property || r.property_id === property;
  const inDate = (d: string) => d >= from && d <= to;
  let rows: Row[] = [],
    tableKind = "",
    summary: string[] = [],
    rowKind = "";
  const income = [
    { description: "Rental income billed", amount: m.rent },
    { description: "Service charges billed", amount: m.service },
    { description: "Other income / credits", amount: m.other },
    { description: "Operating expenses", amount: -m.operating },
    { description: "Net operating income", amount: m.noi },
    { description: "Loan interest", amount: -m.interest },
    { description: "Income after interest", amount: m.noi - m.interest },
  ];
  const performance = s
    .list("properties")
    .filter((p) => !property || p.id === property)
    .map((p) => {
      const x = s.metrics(from, to, p.id),
        lifetime = s.metrics("0001-01-01", to, p.id);
      const days = Math.max(
        1,
        (Date.parse(to) - Date.parse(from)) / 86400000 + 1,
      );
      return {
        id: p.id,
        property: p.name,
        income: x.rent + x.service + x.other,
        operating: x.operating,
        noi: x.noi,
        cash: x.cash,
        capital: x.invested,
        estimated_value: x.value,
        gross_yield: x.invested
          ? ((((x.rent + x.service) * 365) / days / x.invested) * 100).toFixed(
              2,
            ) + "%"
          : "—",
        net_yield: x.invested
          ? (((x.noi * 365) / days / x.invested) * 100).toFixed(2) + "%"
          : "—",
        estimated_roi: x.invested
          ? (
              ((x.value - x.invested + lifetime.noi - lifetime.interest) /
                x.invested) *
              100
            ).toFixed(2) + "%"
          : "—",
      };
    });
  switch (report) {
    case "Portfolio summary":
      rows = Object.entries(m)
        .filter(
          ([k, v]) =>
            typeof v === "number" &&
            ![
              "occupancy",
              "properties",
              "units",
              "occupied",
              "vacant",
              "overdue",
              "maintenance",
              "expiring",
            ].includes(k),
        )
        .map(([k, v]) => ({ description: human(k), amount: v }));
      summary = [
        `${m.properties} properties · ${m.units} units · ${m.occupancy.toFixed(1)}% occupied`,
      ];
      break;
    case "Rent collection":
      rows = s
        .list("payments")
        .filter((r) => scoped(r) && inDate(r.payment_date));
      tableKind = "payments";
      rowKind = "payments";
      summary = [
        `Net receipts including reversals / refunds: ${format(m.collected)}`,
      ];
      break;
    case "Monthly rent roll":
      rows = s
        .list("leases")
        .filter(
          (l) =>
            l.start_date <= to &&
            (l.move_out_date || l.end_date) >= from &&
            (!property ||
              s
                .list("units")
                .some((u) => u.id === l.unit_id && u.property_id === property)),
        );
      tableKind = "leases";
      rowKind = "leases";
      break;
    case "Tenant statement":
      if (tenant) {
        const x = s.statement(tenant, from, to);
        rows = x.rows;
        tableKind = "statement";
        summary = [
          `Opening ${format(x.opening)} · Closing ${format(x.closing)}`,
        ];
      }
      break;
    case "Property statement":
    case "Unit statement":
      rows = s.v.all(
        "SELECT e.id,e.entry_date date,e.description,u.number unit,SUM(CASE WHEN a.cash=1 THEN l.debit ELSE 0 END) debit,SUM(CASE WHEN a.cash=1 THEN l.credit ELSE 0 END) credit FROM journal_entries e JOIN journal_lines l ON l.entry_id=e.id JOIN financial_accounts a ON a.id=l.account_id LEFT JOIN units u ON u.id=e.unit_id WHERE e.entry_date BETWEEN ? AND ? AND (?='' OR e.property_id=?) GROUP BY e.id ORDER BY e.entry_date,e.created_at",
        [from, to, property, property],
      );
      break;
    case "Outstanding dues":
    case "Arrears ageing":
      rows = s
        .list("invoices")
        .filter(
          (r) =>
            scoped(r) && r.issue_date <= to && s.invoiceBalance(r.id, to) > 0,
        )
        .map((r) => ({
          ...r,
          balance: s.invoiceBalance(r.id, to),
          days_overdue: Math.max(
            0,
            Math.floor((Date.parse(to) - Date.parse(r.due_date)) / 86400000),
          ),
        }));
      tableKind = "invoices";
      rowKind = "invoices";
      summary = m.ages.map(
        (n, i) =>
          `${["0–30", "31–60", "61–90", "90+"][i]} days overdue: ${format(n)}`,
      );
      break;
    case "Occupancy & vacancy":
      rows = s
        .list("units")
        .filter(scoped)
        .map((u) => ({
          ...u,
          occupied: s.v.one(
            "SELECT id FROM leases WHERE unit_id=? AND start_date<=? AND COALESCE(move_out_date,end_date)>=?",
            [u.id, to, to],
          )
            ? 1
            : 0,
        }));
      tableKind = "units";
      rowKind = "units";
      break;
    case "Property income statement":
    case "Income versus expense":
      rows = income;
      break;
    case "Cash flow":
      rows = s.cashFlow(from, to, property);
      summary = [
        "Operating includes rent, deposits, expenses, investment income and loan interest. Investing includes capital spending and investment purchases/redemptions. Financing includes owner capital and loan principal. Internal transfers net to zero.",
      ];
      break;
    case "Financial investments":
      rows = s
        .list("investment_assets")
        .filter(scoped)
        .map((a) => ({ ...a, ...s.investmentPosition(a.id, to) }));
      tableKind = "investment_assets";
      summary = [
        "Balances and realized returns are cumulative through the selected end date. Cost basis is entered when redeeming. Market prices and future interest are not assumed.",
      ];
      break;
    case "Owner capital":
      rows = s
        .list("owner_transactions")
        .filter((r) => scoped(r) && inDate(r.entry_date));
      tableKind = "owner_transactions";
      summary = [
        "Contributions and distributions are equity movements. Owner opening balances remain in the financial account ledger.",
      ];
      break;
    case "Budget versus actual":
      rows = s.budgetReport(from, to, property);
      tableKind = "budget_report";
      summary = [
        "Budgets are for whole months. Actuals use operating expenses incurred within the selected dates, including dated reversals. Positive variance is remaining budget; negative variance is overspend.",
      ];
      break;
    case "Investment performance":
    case "Property comparison":
    case "Rental yields":
      rows = performance;
      summary = [
        "Yields are annualized from the selected period’s billed income / posted capital. Valuations are estimates. Estimated ROI is (value minus posted capital plus lifetime NOI minus lifetime interest) / posted capital. It includes unrealized valuation changes and is not realized profit. Cash-on-cash requires a separately defined owner equity basis and is not shown.",
      ];
      break;
    case "Maintenance cost":
      rows = s
        .list("expenses")
        .filter(
          (r) =>
            scoped(r) &&
            inDate(r.entry_date) &&
            ["Repairs", "Maintenance"].includes(r.category),
        );
      tableKind = "expenses";
      rowKind = "expenses";
      break;
    case "Security deposits":
      rows = s.v.all(
        "SELECT t.name tenant,u.number unit,p.name property,SUM(CASE WHEN d.direction='received' THEN d.amount ELSE -d.amount END) amount FROM security_deposits d JOIN leases l ON l.id=d.lease_id JOIN tenants t ON t.id=l.tenant_id JOIN units u ON u.id=l.unit_id JOIN properties p ON p.id=u.property_id WHERE d.entry_date<=? AND (?='' OR p.id=?) GROUP BY l.id",
        [to, property, property],
      );
      summary = [
        `Deposits held: ${format(m.deposits)} · A liability, not income`,
      ];
      break;
    case "Loan balances":
      rows = s
        .list("loans")
        .filter(scoped)
        .map((l) => ({
          ...l,
          balance:
            l.principal -
            Number(
              s.v.one(
                "SELECT COALESCE(SUM(principal),0) n FROM loan_transactions WHERE loan_id=? AND entry_date<=?",
                [l.id, to],
              )!.n,
            ),
        }));
      tableKind = "loans";
      rowKind = "loans";
      break;
    case "Annual summary":
      rows = Array.from({ length: 12 }, (_, i) => {
        const mm = to.slice(0, 4) + "-" + String(i + 1).padStart(2, "0"),
          last = new Date(Date.UTC(Number(mm.slice(0, 4)), i + 1, 0))
            .toISOString()
            .slice(0, 10),
          x = s.metrics(mm + "-01", last, property);
        return {
          month: mm,
          billed: x.rent + x.service + x.other,
          collected: x.collected,
          operating: x.operating,
          noi: x.noi,
          cash: x.cash,
        };
      });
      break;
    case "Custom account statement": {
      const x = s.accountStatement(account, from, to);
      rows = x.rows;
      tableKind = "account_statement";
      summary = [`Opening ${format(x.opening)} · Closing ${format(x.closing)}`];
      break;
    }
    case "Trial balance":
      rows = s.trialBalance(to);
      tableKind = "trial";
      summary = [
        `Difference: ${format(rows.reduce((n, r) => n + r.debit - r.credit, 0))}`,
      ];
      break;
  }
  const specialKeys =
    report === "Rental yields"
      ? ["property", "income", "capital", "gross_yield", "net_yield"]
      : report === "Investment performance"
        ? ["property", "capital", "estimated_value", "noi", "estimated_roi"]
        : undefined;
  const reportCols =
    specialKeys?.map((k) => ({
      key: k,
      label: human(k),
      money: ["income", "capital", "estimated_value", "noi"].includes(k),
    })) ||
    columns[tableKind] ||
    Object.keys(rows[0] || { description: "", amount: 0 })
      .filter((k) => k !== "id")
      .slice(0, 6)
      .map((k) => ({
        key: k,
        label: human(k),
        money: [
          "amount",
          "income",
          "operating",
          "noi",
          "cash",
          "capital",
          "estimated_value",
          "billed",
          "collected",
          "debit",
          "credit",
        ].includes(k),
      }));
  return (
    <>
      <div className="report-picker">
        <label>
          Report
          <select
            aria-label="Report"
            value={report}
            onChange={(e) => setReport(e.target.value)}
          >
            {reports.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        {report === "Tenant statement" && (
          <label>
            Tenant
            <select value={tenant} onChange={(e) => setTenant(e.target.value)}>
              <option value="">Choose tenant</option>
              {s.list("tenants").map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {report === "Custom account statement" && (
          <label>
            Account
            <select
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            >
              {s.list("financial_accounts").map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          className="secondary"
          onClick={() => {
            try {
              csv(rows, "PropertyOS-" + report.replaceAll(" ", "-"));
            } catch (e) {
              onError(e);
            }
          }}
        >
          <Download size={15} /> CSV
        </button>
        <button
          className="primary"
          onClick={() =>
            void makePDF(
              report.toUpperCase(),
              `${from} to ${to} · ${property ? s.list("properties").find((p) => p.id === property)?.name : "All properties"}`,
              rows,
              reportCols.slice(0, 6).map((c, i) => ({
                ...c,
                width:
                  reportCols.length <= 2
                    ? i === 0
                      ? 365
                      : 150
                    : 515 / Math.min(6, reportCols.length),
              })),
              summary,
              s.settings(),
              "PropertyOS-" + report.replaceAll(" ", "-"),
            ).catch(onError)
          }
        >
          Save PDF
        </button>
      </div>
      <section className="card table-card">
        <div className="card-heading">
          <h2>{report}</h2>
          <span>{rows.length} records</span>
        </div>
        {summary.length > 0 && (
          <div className="report-summary">
            {summary.map((x) => (
              <p key={x}>{x}</p>
            ))}
          </div>
        )}
        <DataTable
          key={report + tenant + account}
          kind={tableKind || "report"}
          columnOverride={reportCols}
          rows={rows}
          onOpen={
            rowKind ? (r) => onOpen({ kind: rowKind, row: r }) : undefined
          }
        />
      </section>
      {[
        "Income versus expense",
        "Annual summary",
        "Portfolio summary",
      ].includes(report) && (
        <ChartCard
          title="Income and operating expenses"
          subtitle="Six months · accrual basis"
        >
          <ResponsiveContainer width="100%" height={260}>
            <LineChart
              data={s.trends(to, property).map((t) => ({
                month: t.month,
                income: (t.rent + t.service + t.other) / 100,
                expense: t.operating / 100,
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                isAnimationActive={false}
                dataKey="income"
                stroke="#2e705b"
                strokeWidth={2}
              />
              <Line
                isAnimationActive={false}
                dataKey="expense"
                stroke="#c79d65"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </>
  );
}
function DatabaseScreen({
  s,
  adapter,
  act,
  onError,
}: {
  s: PropertyService;
  adapter: StorageAdapter;
  act: (fn: () => Promise<any>, msg?: string) => Promise<any>;
  onError: (e: any) => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [audit, setAudit] = useState(false),
    [history, setHistory] = useState<{ day: string; value: Envelope }[]>([]),
    [rotating, setRotating] = useState(false),
    [lastBackup, setLastBackup] = useState<string | null>(null);
  useEffect(() => {
    adapter.lastBackup?.().then(setLastBackup).catch(onError);
  }, []);
  const health = s.v.health();
  async function backup() {
    const e = await s.v.backup();
    download(
      new Blob([JSON.stringify(e)], { type: "application/json" }),
      `PropertyOS-${s.today()}-r${e.revision}.posvault`,
    );
  }
  return (
    <>
      <div className="stat-grid">
        {[
          ["Database health", health.integrity],
          ["Migration version", health.version],
          ["Saved records", health.records],
          ["SQLite size", (health.size / 1024).toFixed(0) + " KB"],
        ].map(([label, value]) => (
          <div className="stat-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="chart-grid">
        <section className="card padded">
          <ShieldCheck size={28} className="green" />
          <h2>Encrypted backups</h2>
          <p>
            Export the complete SQLite database, including attached documents.
            The backup uses your workspace passphrase and opens on another
            PropertyOS device.
          </p>
          <button
            className="primary"
            onClick={() => void backup().catch(onError)}
          >
            <Download size={16} /> Create encrypted backup
          </button>
          <p className="muted small-copy">
            Latest saved revision: {health.revision}. Last automatic backup:{" "}
            {lastBackup || "Not yet created"}. A recovery copy of the previous
            save is retained{" "}
            {adapter instanceof CloudStorage
              ? "in your cloud account"
              : "locally"}
            . Keep regular external backups.
          </p>
          <button
            className="secondary"
            onClick={() =>
              void (async () => {
                const e = await adapter.recovery?.();
                if (!e) throw new Error("No recovery copy is available yet.");
                download(
                  new Blob([JSON.stringify(e)], { type: "application/json" }),
                  "PropertyOS-recovery.posvault",
                );
              })().catch(onError)
            }
          >
            Export previous-save recovery copy
          </button>
        </section>
        <section className="card padded">
          <h2>Restore a workspace</h2>
          <p>
            Restore replaces the entire workspace. First export the current
            database. Restoring replaces all records; it does not merge two
            workspaces.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                if (!file) throw new Error("Select a backup.");
                if (confirm !== "RESTORE")
                  throw new Error("Type RESTORE to authorize replacement.");
                const envelope = JSON.parse(await file.text());
                await act(
                  () => s.v.restore(envelope, password),
                  "Backup verified and restored.",
                );
                setConfirm("");
                setPassword("");
              } catch (e) {
                onError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Backup file
              <input
                type="file"
                accept=".posvault,.json"
                required
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <label>
              Backup passphrase
              <input
                type="password"
                required
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label>
              Type RESTORE
              <input
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="RESTORE"
              />
            </label>
            <button className="danger" disabled={busy}>
              {busy ? "Verifying…" : "Verify and restore"}
            </button>
          </form>
        </section>
      </div>
      <section className="card padded">
        <h2>Workspace connection</h2>
        <ConnectionStatus adapter={adapter} />
        <p>
          {adapter instanceof CloudStorage
            ? "Each saved change is committed to your private cloud account. Lock and reopen on another device to load the latest records. Offline viewing uses an encrypted device copy; editing requires internet."
            : "This workspace is stored in this browser or desktop app and works offline. Export an encrypted backup to move it to a cloud workspace or another device."}
        </p>
        <CloudAccountActions adapter={adapter} />
      </section>
      <div className="chart-grid">
        <section className="card padded">
          <h2>Automatic backup history</h2>
          <p>
            Daily snapshots are retained while the app is open. Download a
            snapshot, then use Restore to verify and recover it.
          </p>
          <button
            className="secondary"
            disabled={!adapter.snapshots}
            onClick={() => {
              void adapter.snapshots?.().then(setHistory).catch(onError);
            }}
          >
            Load backup history
          </button>
          {history.length > 0 && (
            <ul className="backup-history">
              {history.map((item) => (
                <li key={item.day}>
                  <span>
                    {item.day} · revision {item.value.revision}
                  </span>
                  <button
                    className="secondary small"
                    onClick={() =>
                      download(
                        new Blob([JSON.stringify(item.value)], {
                          type: "application/json",
                        }),
                        `PropertyOS-${item.day}-r${item.value.revision}.posvault`,
                      )
                    }
                  >
                    Download
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card padded">
          <h2>Change workspace passphrase</h2>
          <p>
            The workspace is re-encrypted with your new passphrase. Older
            downloaded backups still need the passphrase they were created with.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const d = new FormData(form);
              setRotating(true);
              try {
                const password = String(d.get("new_passphrase"));
                if (password !== d.get("confirm_passphrase"))
                  throw new Error("The new passphrases do not match.");
                await act(
                  () => s.v.changePassphrase(password),
                  "Workspace re-encrypted. Create a fresh backup with your new passphrase.",
                );
                form.reset();
              } catch (error) {
                onError(error);
              } finally {
                setRotating(false);
              }
            }}
          >
            <label>
              New passphrase
              <input
                type="password"
                name="new_passphrase"
                minLength={12}
                autoComplete="new-password"
                required
              />
            </label>
            <label>
              Confirm new passphrase
              <input
                type="password"
                name="confirm_passphrase"
                minLength={12}
                autoComplete="new-password"
                required
              />
            </label>
            <button className="primary" disabled={rotating}>
              {rotating ? "Re-encrypting…" : "Change passphrase"}
            </button>
          </form>
        </section>
      </div>
      <section className="card padded">
        <h2>Database audit & exports</h2>
        <p>
          Financial records are protected from changes. Corrections use additive
          postings with their original references.
        </p>
        <div className="section-actions">
          <button className="secondary" onClick={() => setAudit(!audit)}>
            {audit ? "Hide audit trail" : "View audit trail"}
          </button>
          <button
            className="secondary"
            onClick={() => {
              try {
                csv(s.list("activity_logs"), "PropertyOS-audit");
              } catch (e) {
                onError(e);
              }
            }}
          >
            Export audit CSV
          </button>
          <button
            className="secondary"
            onClick={() => {
              try {
                csv(s.trialBalance(), "PropertyOS-trial-balance");
              } catch (e) {
                onError(e);
              }
            }}
          >
            Export trial balance
          </button>
          <button
            className="secondary"
            onClick={() =>
              void act(async () => {
                s.v.health();
              }, "Database integrity and journal balance verified.").catch(
                onError,
              )
            }
          >
            Verify integrity
          </button>
        </div>
        {audit && (
          <DataTable kind="activity_logs" rows={s.list("activity_logs")} />
        )}
      </section>
      <DataImport s={s} act={act} onError={onError} />
    </>
  );
}
function SettingsScreen({
  s,
  act,
  onError,
  onTheme,
}: {
  s: PropertyService;
  act: (fn: () => Promise<any>, msg?: string) => Promise<any>;
  onError: (e: any) => void;
  onTheme: (theme: string) => void;
}) {
  const [values, setValues] = useState(s.settings());
  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await act(() =>
        s.saveSettings(
          Object.fromEntries(
            Object.entries(values).filter(([k]) => k !== "currency"),
          ),
        ),
      );
      onTheme(values.theme);
    } catch (e) {
      onError(e);
    }
  };
  return (
    <section className="card settings-card">
      <h2>Business & workspace settings</h2>
      <p>
        These details appear on new invoices and receipts. Previously issued
        documents retain their original business profile.
      </p>
      <form onSubmit={save}>
        <div className="form-grid">
          {[
            "business_name",
            "address",
            "phone",
            "email",
            "locale",
            "timezone",
            "payment_instructions",
            "terms",
          ].map((k) => (
            <label
              key={k}
              className={
                ["address", "payment_instructions", "terms"].includes(k)
                  ? "span-two"
                  : ""
              }
            >
              {human(k)}
              {["address", "payment_instructions", "terms"].includes(k) ? (
                <textarea
                  rows={3}
                  value={values[k]}
                  onChange={(e) =>
                    setValues({ ...values, [k]: e.target.value })
                  }
                />
              ) : (
                <input
                  required={["business_name", "locale", "timezone"].includes(k)}
                  value={values[k]}
                  onChange={(e) =>
                    setValues({ ...values, [k]: e.target.value })
                  }
                />
              )}
            </label>
          ))}
          <label>
            Currency
            <input readOnly value="BDT (Bangladeshi Taka)" />
          </label>
          <label>
            Theme
            <select
              value={values.theme}
              onChange={(e) => setValues({ ...values, theme: e.target.value })}
            >
              <option>light</option>
              <option>dark</option>
            </select>
          </label>
          <label>
            Financial year starts
            <select
              value={values.financial_year_start}
              onChange={(e) =>
                setValues({ ...values, financial_year_start: e.target.value })
              }
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i + 1}>
                  {new Date(2000, i, 1).toLocaleString("en", { month: "long" })}
                </option>
              ))}
            </select>
          </label>
          <label className="span-two">
            Business logo (PNG; max 500 KB)
            <input
              type="file"
              accept="image/png"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  if (file.type !== "image/png" || file.size > 500000)
                    throw new Error("Choose a PNG logo smaller than 500 KB.");
                  const result = await new Promise<string>(
                    (resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () => resolve(String(reader.result));
                      reader.onerror = reject;
                      reader.readAsDataURL(file);
                    },
                  );
                  setValues({ ...values, logo_data: result });
                } catch (e) {
                  onError(e);
                }
              }}
            />
            {values.logo_data && (
              <img
                className="logo-preview"
                src={values.logo_data}
                alt="Business logo"
              />
            )}
          </label>
          <label className="span-two checkbox-label">
            <input
              type="checkbox"
              checked={values.auto_billing === "true"}
              onChange={(e) =>
                setValues({ ...values, auto_billing: String(e.target.checked) })
              }
            />
            Automatically catch up monthly invoices when this application opens
          </label>
        </div>
        <p className="form-hint">
          Automations run while the application is open and catch up missed jobs
          on reopening. They record transactions in this workspace; they do not
          transfer money or send SMS/email.
        </p>
        <button className="primary">Save settings</button>
      </form>
    </section>
  );
}
function DocumentsScreen({
  s,
  act,
  onError,
}: {
  s: PropertyService;
  act: (fn: () => Promise<any>, msg?: string) => Promise<any>;
  onError: (e: any) => void;
}) {
  const [type, setType] = useState("properties"),
    [entity, setEntity] = useState(""),
    [category, setCategory] = useState("Legal document"),
    [file, setFile] = useState<File | null>(null),
    [previous, setPrevious] = useState("");
  return (
    <>
      <section className="card padded">
        <h2>Attach a local document</h2>
        <p>
          Files are kept inside the encrypted database and included in backups.
          Up to 10 MB per file.
        </p>
        <form
          className="document-upload"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              if (!file) throw new Error("Choose a file.");
              await act(() =>
                s.attach(
                  {
                    entity_type: type,
                    entity_id: entity,
                    category,
                    supersedes_id: previous,
                  },
                  file,
                ),
              );
              setFile(null);
              setPrevious("");
            } catch (e) {
              onError(e);
            }
          }}
        >
          <label>
            Record type
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setEntity("");
                setPrevious("");
              }}
            >
              {[
                "properties",
                "units",
                "tenants",
                "leases",
                "maintenance_requests",
                "loans",
                "expenses",
                "investment_assets",
                "investment_transactions",
                "owners",
                "owner_transactions",
              ].map((k) => (
                <option key={k} value={k}>
                  {human(k)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Linked record
            <select
              required
              value={entity}
              onChange={(e) => setEntity(e.target.value)}
            >
              <option value="">Choose…</option>
              {choices(s, type, {}).map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Category
            <input
              required
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </label>
          <label>
            New version of
            <select
              value={previous}
              onChange={(e) => setPrevious(e.target.value)}
            >
              <option value="">New document</option>
              {s
                .list("documents")
                .filter((x) => x.entity_type === type && x.entity_id === entity)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} · v{x.version}
                  </option>
                ))}
            </select>
          </label>
          <label>
            File
            <input
              type="file"
              required
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <button className="primary">Save attachment</button>
        </form>
      </section>
      <section className="card table-card">
        <div className="card-heading">
          <h2>Your documents</h2>
          <span>Click a file to download its original bytes.</span>
        </div>
        <DataTable
          kind="documents"
          rows={s.list("documents")}
          onOpen={(r) => {
            const full = s.v.one("SELECT * FROM documents WHERE id=?", [r.id])!;
            download(
              new Blob([full.content.slice().buffer], { type: full.mime }),
              full.name,
            );
          }}
          onExport={(rows) => csv(rows, "PropertyOS-documents-index")}
        />
      </section>
    </>
  );
}
