import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { gzipSync } from "node:zlib";
function workspaceBudget() {
  return {
    name: "workspace-startup-budget",
    generateBundle(_, bundle) {
      const entry = Object.values(bundle).find(
        (item) => item.type === "chunk" && item.isEntry,
      );
      const initial = new Set();
      const visit = (name) => {
        if (initial.has(name) || bundle[name]?.type !== "chunk") return;
        initial.add(name);
        bundle[name].imports.forEach(visit);
      };
      if (!entry) this.error("Missing workspace build entry");
      visit(entry.fileName);
      let bytes = 0,
        compressed = 0;
      for (const name of initial) {
        const chunk = bundle[name];
        bytes += Buffer.byteLength(chunk.code);
        compressed += gzipSync(chunk.code).length;
        if (
          Object.keys(chunk.modules).some((id) =>
            /\/(?:AdminApp|UsagePage|AccountPanel|Registration|AuthenticatorSetup)\.tsx$/.test(
              id,
            ),
          )
        )
          this.error(
            "Optional administration/account/setup code entered the workspace startup bundle",
          );
      }
      if (bytes > 330000 || compressed > 102000)
        this.error(
          `Workspace startup budget exceeded: ${bytes} bytes, ${compressed} gzip`,
        );
      console.log(
        `Workspace startup budget: ${bytes} bytes, ${compressed} gzip; optional screens deferred.`,
      );
    },
  };
}
export default defineConfig({
  base: "/backoffice/",
  plugins: [react(), workspaceBudget()],
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": "http://127.0.0.1:8765",
      "/backoffice/api": "http://127.0.0.1:8765",
    },
  },
});
