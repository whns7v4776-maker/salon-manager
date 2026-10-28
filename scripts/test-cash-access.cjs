const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const ts = require("typescript");

function moduleFrom(path, dependencies, globals = {}) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    { exports, require: (name) => dependencies[name], ...globals },
  );
  return exports;
}

(async () => {
  // Password verification uses the authenticated server endpoint; the app session is not replaced.
  let login = 0,
    valid = true;
  const identity = { id: "owner", email: "owner@example.test" };
  const current = {
    auth: { getUser: async () => ({ data: { user: identity } }) },
  };
  const auth = moduleFrom("src/lib/cash-owner-verification.ts", {
    "./supabase": { supabase: current },
    "./cash-passkey": {
      requestCashAccess: async (body) => {
        login++;
        assert.equal(body.action, "verify-password");
        assert.equal(body.password, "fixture");
        return { verified: valid };
      },
    },
  });
  await auth.verifyCashOwnerPassword("fixture", "OWNER@example.test");
  assert.equal(login, 1);
  valid = false;
  await assert.rejects(() =>
    auth.verifyCashOwnerPassword("fixture", identity.email),
  );
  await assert.rejects(() =>
    auth.verifyCashOwnerPassword("fixture", "other@example.test"),
  );
  await assert.rejects(() => auth.verifyCashOwnerPassword("", identity.email));
  assert.equal(login, 2);

  // Optional protection is scoped by salon/account and survives a fresh module read.
  const storage = new Map();
  let changed = 0,
    callback;
  const fakeWindow = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    addEventListener: (_name, fn) => {
      callback = fn;
    },
    removeEventListener: () => {},
  };
  const readPrivacy = () =>
    moduleFrom(
      "src/lib/cash-device-privacy.ts",
      {
        react: {
          useSyncExternalStore: (subscribe, snapshot) => {
            subscribe(() => changed++);
            return snapshot();
          },
        },
      },
      { window: fakeWindow },
    );
  let privacy = readPrivacy();
  assert.equal(privacy.useCashDevicePrivacy("salon:owner").enabled, false);
  privacy.useCashDevicePrivacy("salon:owner").setEnabled(true);
  assert.ok(changed > 0);
  assert.equal(privacy.useCashDevicePrivacy("salon:owner").enabled, true);
  assert.equal(privacy.useCashDevicePrivacy("other:owner").enabled, false);
  privacy = readPrivacy();
  assert.equal(privacy.useCashDevicePrivacy("salon:owner").enabled, true);
  storage.set("salonpro:cash-device-privacy:v1:salon:owner", "disabled");
  callback({ key: null });
  assert.equal(privacy.useCashDevicePrivacy("salon:owner").enabled, false);
  fakeWindow.localStorage.setItem = () => {
    throw Error("storage blocked");
  };
  assert.throws(() =>
    privacy.useCashDevicePrivacy("salon:owner").setEnabled(true),
  );
  assert.equal(privacy.useCashDevicePrivacy("salon:owner").enabled, false);
  console.log(
    "PASS: owner identity, authenticated password endpoint, optional default, scoped storage, refresh and cross-tab updates.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
