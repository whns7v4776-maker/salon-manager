const fs = require("node:fs"),
  vm = require("node:vm"),
  ts = require("typescript");
const assert = require("node:assert/strict");

let handler,
  authenticated = true,
  owner = true,
  passwordValid = true,
  serial = 0;
let data = {
  workspace_members: [
    { user_id: "owner", workspace_id: "salon", role: "owner" },
  ],
  cash_owner_passkeys: [],
  cash_owner_passkey_challenges: [],
};
class Query {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.kind = "read";
  }
  select() {
    return this;
  }
  eq(key, value) {
    this.filters.push((row) => row[key] === value);
    return this;
  }
  gt(key, value) {
    this.filters.push((row) => row[key] > value);
    return this;
  }
  gte(key, value) {
    this.filters.push((row) => row[key] >= value);
    return this;
  }
  lt(key, value) {
    this.filters.push((row) => row[key] < value);
    return this;
  }
  insert(row) {
    this.kind = "insert";
    this.value = row;
    return this;
  }
  delete() {
    this.kind = "delete";
    return this;
  }
  update(row) {
    this.kind = "update";
    this.value = row;
    return this;
  }
  async execute(single = false) {
    let rows = data[this.table].filter((row) =>
      this.filters.every((filter) => filter(row)),
    );
    if (this.table === "workspace_members" && !owner) rows = [];
    if (this.kind === "insert") {
      const row = {
        id: String(++serial),
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 300000).toISOString(),
        ...this.value,
      };
      data[this.table].push(row);
      rows = [row];
    } else if (this.kind === "delete")
      data[this.table] = data[this.table].filter((row) => !rows.includes(row));
    else if (this.kind === "update")
      rows.forEach((row) => Object.assign(row, this.value));
    return { data: single ? (rows[0] ?? null) : rows, error: null };
  }
  single() {
    return this.execute(true);
  }
  maybeSingle() {
    return this.execute(true);
  }
  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }
}
const auth = {
  getUser: async () => ({
    data: {
      user: authenticated ? { id: "owner", email: "owner@example.test" } : null,
    },
  }),
  signInWithPassword: async () => ({
    data: { user: passwordValid ? { id: "owner" } : null },
  }),
  signOut: async () => {},
};
const verifyOptions = (options) => {
  assert.equal(options.expectedChallenge, "challenge");
  assert.equal(options.expectedOrigin, "https://salon.example.test");
  assert.equal(options.expectedRPID, "salon.example.test");
  assert.equal(options.requireUserVerification, true);
};
const dependencies = {
  "https://esm.sh/@supabase/supabase-js@2": {
    createClient: (_url, key) =>
      key === "service"
        ? { from: (table) => new Query(table) }
        : {
            auth,
            rpc: async (name) => ({
              data: name === "current_workspace_id" ? "salon" : true,
            }),
          },
  },
  "npm:@simplewebauthn/server@13.2.2": {
    generateRegistrationOptions: async (options) => {
      assert.equal(options.authenticatorSelection.userVerification, "required");
      return { challenge: "challenge" };
    },
    generateAuthenticationOptions: async (options) => {
      assert.equal(options.userVerification, "required");
      return { challenge: "challenge" };
    },
    verifyRegistrationResponse: async (options) => {
      verifyOptions(options);
      return {
        verified: !options.response.invalid,
        registrationInfo: {
          credential: {
            id: "passkey",
            publicKey: new Uint8Array([1, 2]),
            counter: 0,
            transports: ["internal"],
          },
        },
      };
    },
    verifyAuthenticationResponse: async (options) => {
      verifyOptions(options);
      return {
        verified: !options.response.invalid,
        authenticationInfo: { newCounter: options.credential.counter + 1 },
      };
    },
  },
};
const env = {
  SUPABASE_URL: "https://example.test",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  CASH_PASSKEY_ALLOWED_ORIGINS: "https://salon.example.test",
};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync("supabase/functions/cash-passkey/index.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  {
    exports: {},
    require: (name) => dependencies[name],
    Deno: {
      env: { get: (name) => env[name] },
      serve: (callback) => {
        handler = callback;
      },
    },
    Response,
    Request,
    URL,
    TextEncoder,
    Uint8Array,
    Date,
    btoa,
    atob,
  },
);
async function call(action, extra = {}, origin = "https://salon.example.test") {
  const response = await handler(
    new Request("https://example.test/functions/v1/cash-passkey", {
      method: "POST",
      headers: { Origin: origin, Authorization: "Bearer fixture" },
      body: JSON.stringify({ action, ...extra }),
    }),
  );
  return { status: response.status, body: await response.json() };
}
(async () => {
  assert.equal(
    (await call("status", {}, "https://untrusted.example.test")).status,
    503,
  );
  authenticated = false;
  assert.equal((await call("status")).status, 401);
  authenticated = true;
  owner = false;
  assert.equal((await call("status")).status, 403);
  owner = true;
  assert.equal((await call("status")).body.registered, false);
  assert.equal(
    (await call("verify-password", { password: "fixture" })).body.verified,
    true,
  );
  assert.equal((await call("verify-password")).status, 403);
  passwordValid = false;
  assert.equal(
    (await call("register-begin", { password: "fixture" })).status,
    403,
  );
  assert.equal(
    (await call("verify-password", { password: "fixture" })).status,
    403,
  );
  passwordValid = true;
  let begin = await call("register-begin", { password: "fixture" });
  const register = {
    challengeId: begin.body.challengeId,
    credential: { id: "passkey" },
  };
  assert.equal((await call("register-finish", register)).body.verified, true);
  assert.equal((await call("register-finish", register)).status, 403); // one use only
  assert.equal((await call("status")).body.registered, true);
  begin = await call("authenticate-begin");
  data.cash_owner_passkey_challenges.find(
    (row) => row.id === begin.body.challengeId,
  ).expires_at = "2000-01-01";
  assert.equal(
    (
      await call("authenticate-finish", {
        challengeId: begin.body.challengeId,
        credential: { id: "passkey" },
      })
    ).status,
    403,
  );
  begin = await call("authenticate-begin");
  assert.equal(
    (
      await call("authenticate-finish", {
        challengeId: begin.body.challengeId,
        credential: { id: "other" },
      })
    ).status,
    403,
  );
  begin = await call("authenticate-begin");
  const invalid = {
    challengeId: begin.body.challengeId,
    credential: { id: "passkey", invalid: true },
  };
  assert.equal((await call("authenticate-finish", invalid)).status, 403);
  assert.equal(
    (
      await call("authenticate-finish", {
        ...invalid,
        credential: { id: "passkey" },
      })
    ).status,
    403,
  );
  begin = await call("authenticate-begin");
  assert.equal(
    (
      await call("authenticate-finish", {
        challengeId: begin.body.challengeId,
        credential: { id: "passkey" },
      })
    ).body.verified,
    true,
  );
  assert.equal(data.cash_owner_passkeys[0].counter, 1);
  console.log(
    "PASS: allowed origin, authenticated owner, password enrollment, challenge expiry/replay, credential ownership, required device verification and signature counter. Cryptography is mocked; physical passkey enrollment remains a release check.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
