import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const firebaseKeys = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
] as const;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  const define = Object.fromEntries(
    firebaseKeys.map((key) => [`process.env.${key}`, JSON.stringify(env[key] ?? "")]),
  );

  return {
    root: path.resolve(__dirname, "firebase-hosting"),
    publicDir: path.resolve(__dirname, "public"),
    plugins: [react()],
    define,
    build: {
      outDir: path.resolve(__dirname, "dist-firebase"),
      emptyOutDir: true,
    },
  };
});
