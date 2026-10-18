import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { english, translate } from "../server/messages.mjs";
import { invitationMessage } from "../server/mail.mjs";

test("all Danish API messages and static UI text have translations, while user content remains untouched", async () => {
  for (const file of [
    "server/app.mjs",
    "server/accounts.mjs",
    "server/recovery.mjs",
    "src/Recovery.tsx",
    "src/RecoveryCodes.tsx",
    "src/Login.tsx",
    "src/Registration.tsx",
    "server/account-area.mjs",
    "server/customer.mjs",
    "server/usage.mjs",
    "src/CustomerWorkspace.tsx",
    "src/SecurityConfirmation.tsx",
    "src/AuthenticatorSetup.tsx",
    "src/AccountPanel.tsx",
    "src/UsagePage.tsx",
    "src/ProjectColorPicker.tsx",
    "src/project-colors.ts",
    "src/Dialog.tsx",
    "src/PromptImportForm.tsx",
    "src/PlatformPromptForm.tsx",
    "src/main.tsx",
  ]) {
    const src = await readFile(new URL("../" + file, import.meta.url), "utf8");
    const ast = ts.createSourceFile(
      file,
      src,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.JS,
    );
    function walk(n) {
      if (ts.isStringLiteral(n) && /[æøåÆØÅ]/.test(n.text))
        assert.ok(english[n.text], `Missing translation: ${n.text}`);
      if (ts.isJsxText(n))
        assert.ok(
          !/[æøåÆØÅ]/.test(n.text),
          `Untranslated visible UI: ${n.text.trim()}`,
        );
      ts.forEachChild(n, walk);
    }
    walk(ast);
  }
  assert.equal(
    translate("Private customer content", "en"),
    "Private customer content",
  );
  assert.equal(translate("Log ind", "en"), "Sign in");
  assert.equal(translate("Log ind", "da"), "Log ind");
  assert.equal(translate("Sign in", "da"), "Log ind");
});
test("both invitation templates use Admin/Customer, expiry and a personal registration link without passwords", () => {
  for (const locale of ["en", "da"]) {
    const msg = invitationMessage({
      email: "synthetic@example.test",
      name: "Synthetic Person",
      locale,
      url: "https://example.test/backoffice/#invite=SYNTHETIC",
      role: "admin",
    });
    assert.ok(msg.text.includes("Admin"));
    assert.ok(msg.text.includes("48"));
    assert.ok(msg.text.includes("#invite=SYNTHETIC"));
    assert.ok(msg.text.includes("2FA"));
    assert.ok(!msg.text.includes("Main Admin"));
    assert.ok(!msg.text.includes("password:"));
  }
});
test("local mail adapter pins loopback, requires verified TLS, prevents external content loads and suppresses raw failures", async () => {
  const { localMailer } = await import("../server/mail.mjs");
  let options, payload;
  const send = localMailer("no-reply@example.test", {
    createTransport: (o) => {
      options = o;
      return {
        sendMail: async (p) => {
          payload = p;
          return { accepted: ["synthetic@example.test"], rejected: [] };
        },
      };
    },
  });
  assert.equal(
    await send({
      to: "synthetic@example.test",
      subject: "Test",
      text: "Synthetic content",
    }),
    true,
  );
  assert.equal(options.host, "127.0.0.1");
  assert.equal(options.port, 25);
  assert.equal(options.requireTLS, true);
  assert.equal(options.tls.rejectUnauthorized, true);
  assert.equal(options.disableFileAccess, true);
  assert.equal(options.disableUrlAccess, true);
  assert.equal(options.debug, false);
  assert.equal(options.logger, false);
  assert.deepEqual(payload.envelope, {
    from: "no-reply@example.test",
    to: ["synthetic@example.test"],
  });
  const fail = localMailer("no-reply@example.test", {
    createTransport: () => ({
      sendMail: async () => {
        throw new Error("synthetic provider secret");
      },
    }),
  });
  assert.equal(
    await fail({ to: "synthetic@example.test", subject: "Test", text: "Test" }),
    false,
  );
  assert.throws(() =>
    localMailer("sender@example.test\r\nBcc:other@example.test"),
  );
});
