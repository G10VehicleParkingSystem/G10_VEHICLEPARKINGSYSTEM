import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During development the UI runs on Vite and forwards /api calls to the backend.
// macOS uses port 5000 for AirPlay, so start the backend on another port and set
// API_URL, e.g. API_URL=http://localhost:5050 npm run dev
export default defineConfig(({ command }) => {
  // A global NODE_ENV=development in someone's shell would otherwise ship React's
  // development build.
  if (command === "build") process.env.NODE_ENV = "production";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": process.env.API_URL || "http://localhost:5000"
      }
    }
  };
});
