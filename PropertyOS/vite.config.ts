import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = (
    env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY
  )?.trim();
  if (!!url !== !!key)
    throw new Error(
      "Set both the Supabase URL and publishable key, or leave both blank for local mode.",
    );
  if (key?.startsWith("sb_secret_"))
    throw new Error(
      "Use a publishable Supabase key in VITE_ variables. Server secret keys cannot be bundled.",
    );
  if (key?.split(".").length === 3) {
    let role: string | undefined;
    try {
      role = JSON.parse(
        Buffer.from(key.split(".")[1], "base64url").toString(),
      ).role;
    } catch {
      /* Supabase validates malformed public keys. */
    }
    if (role && role !== "anon")
      throw new Error(
        "Only a public anon/publishable Supabase key can be bundled.",
      );
  }
  if (url) {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(parsed.hostname)
    )
      throw new Error("Cloud project URL must use HTTPS.");
  }
  return {
    plugins: [react()],
    base: "./",
    server: { port: 1420, strictPort: true },
    build: { target: "es2022", emptyOutDir: true },
    clearScreen: false,
  };
});
