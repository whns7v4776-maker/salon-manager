// Component integration test with a real React tree and an isolated DOM/storage.
// Authenticator responses are controlled here; server crypto is tested separately.
const { JSDOM } = require(process.env.JSDOM_MODULE || "jsdom");
const fs = require("node:fs"),
  vm = require("node:vm"),
  ts = require("typescript");
const assert = require("node:assert/strict");
const dom = new JSDOM('<div id="root"></div>', {
  url: "https://salon.example.test",
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require("react"),
  { createRoot } = require("react-dom/client");
const h = React.createElement,
  { act } = React;
const scope = "salon:owner@example.test",
  amount = "9876,54 €";
let timers = new Map(),
  timerId = 0,
  childrenRenders = 0,
  biometricCalls = 0,
  pendingPasskey = null;
function load(path, deps) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.React,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    {
      exports,
      require: (name) => deps[name],
      Error,
      window: dom.window,
      document: dom.window.document,
      DOMException: dom.window.DOMException,
      setTimeout: (fn, ms) => {
        const id = ++timerId;
        timers.set(id, { fn, ms });
        return id;
      },
      clearTimeout: (id) => timers.delete(id),
    },
  );
  return exports;
}
const native = {
  View: ({ children, dataSet }) =>
    h(
      "div",
      Object.fromEntries(
        Object.entries(dataSet || {}).map(([k, v]) => [
          "data-" + k.replace(/[A-Z]/g, (x) => "-" + x.toLowerCase()),
          v,
        ]),
      ),
      children,
    ),
  Text: ({ children }) => h("span", null, children),
  Pressable: ({ children, onPress, disabled, accessibilityLabel }) =>
    h(
      "button",
      { onClick: onPress, disabled, "aria-label": accessibilityLabel },
      children,
    ),
  TextInput: ({
    value,
    onChangeText,
    secureTextEntry,
    accessibilityLabel,
    editable,
  }) =>
    h("input", {
      "aria-label": accessibilityLabel,
      type: secureTextEntry ? "password" : "text",
      value,
      disabled: editable === false,
      onInput: (e) => onChangeText(e.currentTarget.value),
    }),
};
const savedPermissions = new Map();
const memoryStorage = {
  getItem: async (k) => (savedPermissions.has(k) ? savedPermissions.get(k) : null),
  setItem: async (k, v) => { savedPermissions.set(k, v); },
};
function freshGate() {
  const preferences = load("src/lib/cash-device-privacy.ts", { react: React });
  const lockedPermissions = load("src/lib/cash-locked-permissions.ts", {
    react: React,
    "@react-native-async-storage/async-storage": { __esModule: true, default: memoryStorage },
  });
  return load("components/cash-device-gate.tsx", {
    react: React,
    "../src/lib/cash-locked-permissions": lockedPermissions,
    "./ui/haptic-touchable": { HapticTouchable: native.Pressable },
    "../src/context/AppContext": { useAppContext: () => ({ requestOwnerPasswordReset: async () => ({ ok: true }) }) },
    "react-native": native,
    "@expo/vector-icons": { Ionicons: () => null },
    "./access-premium": {
      useAccessAppearance: () => ({
        palette: {
          ink: "#222",
          muted: "#555",
          action: "#222",
          field: "#ddd",
          actionText: "#fff",
          border: "#777",
          line: "#bbb",
        },
      }),
    },
    "../src/lib/cash-device-privacy": preferences,
    "../src/lib/cash-owner-verification": {
      verifyCashOwnerPassword: async (password) => {
        if (password !== "owner-fixture") throw Error("Password non valida");
      },
    },
    "../src/lib/cash-passkey": {
      cashPasskeyStatus: async () => ({
        supported: true,
        ready: true,
        registered: true,
      }),
      verifyCashPasskey: async () => {
        biometricCalls++;
        if (pendingPasskey) await pendingPasskey.promise;
      },
    },
    "./cash-web-dialog": {
      CashWebDialog: ({ title, children, footer, onClose }) =>
        h(
          "section",
          { role: "dialog" },
          h("h2", null, title),
          children,
          footer,
          h("button", { onClick: onClose }, "Chiudi"),
        ),
    },
  }).CashDeviceGate;
}
let Gate = freshGate(),
  root = createRoot(document.getElementById("root"));
// Stand-in for the Cassa page: totals only while unlocked, a reserved notice while locked.
let unlockedRenders = 0, lastControls = null;
const body = (controls) => {
  childrenRenders++;
  lastControls = controls;
  if (!controls.locked) unlockedRenders++;
  return h(
    "main",
    null,
    controls.locked
      ? h("section", { "data-cash-reserved": true }, h("span", null, "Totali riservati"), h("button", { onClick: controls.onUnlock }, "Sblocca Cassa"))
      : h("span", { "data-cash-sensitive": true }, amount),
    h("button", { onClick: controls.onConfigure }, "Configura"),
    controls.enabled && !controls.locked ? h("button", { onClick: controls.onLock }, "Blocca") : null,
  );
};
const render = async (active = true) =>
  act(async () =>
    root.render(h(Gate, { scope, email: "owner@example.test", active }, body)),
  );
const button = (label) =>
  Array.from(document.querySelectorAll("button")).find(
    (e) => e.textContent === label,
  );
const click = async (label) => {
  assert.ok(button(label), "Missing " + label);
  await act(async () => button(label).click());
};
const enter = async (value) =>
  act(async () => {
    const input = document.querySelector("input");
    assert.ok(input);
    input.value = value;
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
// Locked = reserved mode: the page is usable but the sensitive totals are absent from the DOM.
const concealed = () => {
  assert.equal(document.querySelector("[data-cash-sensitive]"), null);
  assert.ok(!document.body.textContent.includes(amount));
  assert.ok(document.querySelector("[data-cash-reserved]"), "Locked Cassa must stay usable in reserved mode");
  assert.equal(lastControls.locked, true);
};
const shown = () => {
  assert.ok(document.body.textContent.includes(amount));
  assert.equal(lastControls.locked, false);
};
const unlockPassword = async () => {
  await click("Sblocca Cassa");
  await enter("owner-fixture");
  await click("Sblocca");
  shown();
};

(async () => {
  await render();
  shown(); // optional and off by default
  assert.equal(
    window.localStorage.getItem("salonpro:cash-device-privacy:v1:" + scope),
    null,
  );
  await click("Configura");
  await enter("owner-fixture");
  await click("Attiva protezione");
  shown();
  assert.equal(
    window.localStorage.getItem("salonpro:cash-device-privacy:v1:" + scope),
    "enabled",
  );
  await click("Blocca");
  concealed();
  // Owner-chosen defaults: day-to-day work open, money overview closed.
  assert.deepEqual(
    { ...lastControls.permissions },
    { newPayment: true, completePending: true, payments: true, movements: false, totals: false, reports: false },
  );
  // A locked Cassa cannot change what it allows.
  await act(async () => lastControls.setPermission("totals", true));
  assert.equal(lastControls.permissions.totals, false);
  await click("Sblocca Cassa");
  await enter("wrong-fixture");
  await click("Sblocca");
  concealed();
  assert.ok(document.body.textContent.includes("Password non valida"));
  await click("Chiudi");
  await unlockPassword();
  // The owner, unlocked, decides what the locked Cassa allows; the choice is stored on the device.
  await act(async () => lastControls.setPermission("movements", true));
  assert.equal(lastControls.permissions.movements, true);
  await act(async () => new Promise((r) => setImmediate(r)));
  assert.ok(Array.from(savedPermissions.values()).some((v) => JSON.parse(v).movements === true));
  await act(async () => lastControls.setPermission("movements", false));
  // Full remount AND a fresh preference module model a refresh: never an unlocked render, even transiently.
  await act(async () => root.unmount());
  childrenRenders = 0;
  unlockedRenders = 0;
  Gate = freshGate();
  root = createRoot(document.getElementById("root"));
  await render();
  concealed();
  assert.equal(unlockedRenders, 0, "Totals must never render before unlock after reload");
  await unlockPassword();
  await act(async () => window.dispatchEvent(new dom.window.Event("blur")));
  shown();
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "hidden",
  });
  await act(async () =>
    document.dispatchEvent(new dom.window.Event("visibilitychange")),
  );
  shown();
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  await render(false);
  shown();
  await render(true);
  shown();
  assert.equal(timers.size, 0, "No automatic expiry may interrupt the owner");
  await click("Blocca");
  concealed();
  // Direct biometric action leaves values absent while the authenticator is pending.
  let resolvePasskey;
  pendingPasskey = {
    promise: new Promise((resolve) => {
      resolvePasskey = resolve;
    }),
  };
  await click("Sblocca Cassa");
  await click("Usa Face ID / impronta");
  concealed();
  assert.equal(biometricCalls, 1);
  await act(async () => resolvePasskey());
  pendingPasskey = null;
  shown();
  await click("Blocca");
  concealed();
  const cancelled = Promise.reject(new dom.window.DOMException("Cancelled", "NotAllowedError"));
  cancelled.catch(() => {}); // handled by the gate once the button is pressed
  pendingPasskey = { promise: cancelled };
  await click("Sblocca Cassa");
  await click("Usa Face ID / impronta");
  pendingPasskey = null;
  concealed();
  assert.ok(document.body.textContent.includes("annullato"));
  await click("Chiudi");
  await unlockPassword();
  await click("Configura");
  await enter("owner-fixture");
  await click("Disattiva protezione");
  shown();
  assert.equal(
    window.localStorage.getItem("salonpro:cash-device-privacy:v1:" + scope),
    "disabled",
  );
  // Settings entry reuses the authenticated configuration without rendering ledger children.
  await act(async () => root.unmount());
  Gate = freshGate(); root = createRoot(document.getElementById("root"));
  childrenRenders = 0; let settingsCloses = 0;
  const settings = () => act(async () => root.render(h(Gate, { scope, email: "owner@example.test", active: true, settingsOnly: true, onSettingsClose: () => settingsCloses++ }, body)));
  await settings(); assert.ok(!document.body.textContent.includes(amount)); assert.equal(childrenRenders, 0);
  assert.ok(document.body.textContent.includes("Protezione della Cassa"));
  await enter("wrong-fixture"); await click("Attiva protezione");
  assert.equal(settingsCloses, 0); assert.ok(document.body.textContent.includes("Password non valida")); assert.ok(!document.body.textContent.includes(amount));
  await click("Chiudi"); assert.equal(settingsCloses, 1); assert.ok(!document.body.textContent.includes(amount));
  await act(async () => root.unmount());
  Gate = freshGate(); root = createRoot(document.getElementById("root"));
  await settings(); await enter("owner-fixture"); await click("Attiva protezione");
  assert.equal(settingsCloses, 2); assert.equal(childrenRenders, 0); assert.ok(!document.body.textContent.includes(amount));
  assert.equal(window.localStorage.getItem("salonpro:cash-device-privacy:v1:" + scope), "enabled");
  await act(async () => root.unmount());
  dom.window.close();
  console.log(
    "PASS: optional default off, owner activation, manual lock, reserved mode while locked (usable page, totals absent), owner-chosen locked permissions (defaults, read-only while locked, saved when unlocked), wrong password, password unlock, hard refresh with zero unlocked renders, no relock on blur/background/section changes, no expiry timer, pending/cancelled biometric verification and authenticated disable. Isolated DOM/auth fixtures; not physical biometric proof.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
  dom.window.close();
});
