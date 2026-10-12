import React from "react";
import { createRoot } from "react-dom/client";
import App from "./ui/App";
import "./ui/styles.css";
class Boundary extends React.Component<
  { children: React.ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(e: Error) {
    return { error: e.message };
  }
  render() {
    return this.state.error ? (
      <main className="fatal">
        <h1>PropertyOS could not open this screen.</h1>
        <p>{this.state.error}</p>
        <p>Your last saved records remain in your selected workspace.</p>
        <button onClick={() => location.reload()}>Reopen application</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <Boundary>
    <App />
  </Boundary>,
);
if (
  "serviceWorker" in navigator &&
  !("__TAURI_INTERNALS__" in window) &&
  import.meta.env.PROD
)
  navigator.serviceWorker.register("./sw.js").catch(() => {
    /* Installation may not be supported on every browser. */
  });
