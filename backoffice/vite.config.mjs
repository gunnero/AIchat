import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "/backoffice/",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    proxy: { "/backoffice/api": "http://127.0.0.1:8765" },
  },
});
