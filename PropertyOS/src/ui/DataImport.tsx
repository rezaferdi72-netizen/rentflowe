import { useState, type FormEvent } from "react";
import { Download, Upload, CheckCircle2 } from "lucide-react";
import { type PropertyService } from "../core/service";
import { csvTemplate, type ImportKind } from "../core/imports";
import { download } from "./documents";

export function DataImport({
  s,
  act,
  onError,
}: {
  s: PropertyService;
  act: (fn: () => Promise<any>, msg?: string) => Promise<any>;
  onError: (error: any) => void;
}) {
  const [kind, setKind] = useState<ImportKind>("properties");
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<ReturnType<
    PropertyService["planImport"]
  > | null>(null);
  const [busy, setBusy] = useState(false);
  async function preview(file?: File) {
    setPlan(null);
    setText("");
    try {
      if (!file) return;
      if (file.size > 3_000_000)
        throw new Error("Choose a CSV smaller than 3 MB.");
      const content = await file.text();
      const result = s.planImport(kind, content);
      setText(content);
      setPlan(result);
    } catch (error) {
      onError(error);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!plan || plan.errors.length) return;
    setBusy(true);
    try {
      await act(
        () => s.importRecords(kind, text),
        `${plan.prepared.length} records imported and saved.`,
      );
      setText("");
      setPlan(null);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card padded">
      <div className="card-heading">
        <div>
          <h2>Bulk data import</h2>
          <p>
            Move your existing property records into one organized workspace.
          </p>
        </div>
        <Upload size={24} className="green" />
      </div>
      <p className="muted small-copy">
        Import in order: properties → tenants → units → leases. Enter money in
        taka without commas. Property names, unit numbers, and tenant phones
        connect the records. A file is saved only if every row is valid.
      </p>
      <div className="section-actions">
        <label>
          Record type
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as ImportKind);
              setPlan(null);
              setText("");
            }}
          >
            <option value="properties">Properties</option>
            <option value="tenants">Tenants</option>
            <option value="units">Units</option>
            <option value="leases">Leases</option>
          </select>
        </label>
        <button
          className="secondary"
          onClick={() =>
            download(
              new Blob(["\uFEFF" + csvTemplate(kind)], {
                type: "text/csv;charset=utf-8",
              }),
              `PropertyOS-${kind}-template.csv`,
            )
          }
        >
          <Download size={16} /> Download CSV template
        </button>
      </div>
      <form onSubmit={submit}>
        <label>
          Choose your CSV file
          <input
            key={kind}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              void preview(e.target.files?.[0]);
            }}
          />
        </label>
        {plan && (
          <>
            <div className={plan.errors.length ? "error" : "notice"}>
              {plan.errors.length ? (
                `${plan.errors.length} issue(s) to fix before import.`
              ) : (
                <>
                  <CheckCircle2 size={17} /> {plan.prepared.length} records
                  checked and ready to import.
                </>
              )}
            </div>
            {!!plan.errors.length && (
              <ul className="import-errors">
                {plan.errors.slice(0, 30).map((message, i) => (
                  <li key={i}>{message}</li>
                ))}
              </ul>
            )}
            <div className="import-preview">
              <table>
                <thead>
                  <tr>
                    {Object.keys(plan.rows[0] || {})
                      .slice(0, 6)
                      .map((key) => (
                        <th key={key}>{key.replaceAll("_", " ")}</th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {plan.rows.slice(0, 5).map((row, i) => (
                    <tr key={i}>
                      {Object.values(row)
                        .slice(0, 6)
                        .map((value, j) => (
                          <td key={j}>{value}</td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <small className="muted">
                Preview shows the first five records. All rows will be validated
                again when saved.
              </small>
            </div>
            <button
              className="primary"
              disabled={busy || !!plan.errors.length || !plan.prepared.length}
            >
              {busy ? "Importing…" : `Import ${plan.prepared.length} records`}
            </button>
          </>
        )}
      </form>
    </section>
  );
}
