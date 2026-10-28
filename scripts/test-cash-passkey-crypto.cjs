// Real WebAuthn verification with a generated ES256 key. No owner credentials/device enrollment.
const assert = require("node:assert/strict"),
  crypto = require("node:crypto");
function cbor(value) {
  const head = (kind, n) =>
    n < 24
      ? Buffer.from([(kind << 5) | n])
      : n < 256
        ? Buffer.from([(kind << 5) | 24, n])
        : Buffer.from([(kind << 5) | 25, n >> 8, n & 255]);
  if (typeof value === "number")
    return value >= 0 ? head(0, value) : head(1, -1 - value);
  if (typeof value === "string") {
    const b = Buffer.from(value);
    return Buffer.concat([head(3, b.length), b]);
  }
  if (Buffer.isBuffer(value))
    return Buffer.concat([head(2, value.length), value]);
  if (value instanceof Map)
    return Buffer.concat([
      head(5, value.size),
      ...Array.from(value, ([k, v]) => Buffer.concat([cbor(k), cbor(v)])),
    ]);
  throw Error("Unsupported fixture CBOR");
}
const base64 = (value) => Buffer.from(value).toString("base64url");
(async () => {
  const {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
  } = await import(process.env.WEBAUTHN_MODULE || "@simplewebauthn/server");
  const rpID = "salon.example.test",
    origin = "https://" + rpID;
  const pair = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = pair.publicKey.export({ format: "jwk" }),
    id = crypto.randomBytes(32);
  const rpHash = crypto.createHash("sha256").update(rpID).digest();
  const registration = await generateRegistrationOptions({
    rpName: "Cash test",
    rpID,
    userName: "fixture@example.test",
    authenticatorSelection: { userVerification: "required" },
  });
  const cose = cbor(
    new Map([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, Buffer.from(jwk.x, "base64url")],
      [-3, Buffer.from(jwk.y, "base64url")],
    ]),
  );
  const length = Buffer.alloc(2);
  length.writeUInt16BE(id.length);
  const authData = Buffer.concat([
    rpHash,
    Buffer.from([0x45]),
    Buffer.alloc(4),
    Buffer.alloc(16),
    length,
    id,
    cose,
  ]);
  const registrationResponse = {
    id: base64(id),
    rawId: base64(id),
    type: "public-key",
    authenticatorAttachment: "platform",
    clientExtensionResults: {},
    response: {
      clientDataJSON: base64(
        JSON.stringify({
          type: "webauthn.create",
          challenge: registration.challenge,
          origin,
          crossOrigin: false,
        }),
      ),
      attestationObject: base64(
        cbor(
          new Map([
            ["fmt", "none"],
            ["attStmt", new Map()],
            ["authData", authData],
          ]),
        ),
      ),
      transports: ["internal"],
    },
  };
  const registered = await verifyRegistrationResponse({
    response: registrationResponse,
    expectedChallenge: registration.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  });
  assert.equal(registered.verified, true);
  const credential = registered.registrationInfo.credential;
  const auth = await generateAuthenticationOptions({
    rpID,
    allowCredentials: [{ id: credential.id }],
    userVerification: "required",
  });
  function assertion(flags = 5) {
    const client = Buffer.from(
      JSON.stringify({
        type: "webauthn.get",
        challenge: auth.challenge,
        origin,
        crossOrigin: false,
      }),
    );
    const count = Buffer.alloc(4);
    count.writeUInt32BE(1);
    const authenticator = Buffer.concat([rpHash, Buffer.from([flags]), count]);
    const signature = crypto.sign(
      "sha256",
      Buffer.concat([
        authenticator,
        crypto.createHash("sha256").update(client).digest(),
      ]),
      pair.privateKey,
    );
    return {
      id: credential.id,
      rawId: credential.id,
      type: "public-key",
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      response: {
        clientDataJSON: base64(client),
        authenticatorData: base64(authenticator),
        signature: base64(signature),
      },
    };
  }
  const options = {
    expectedChallenge: auth.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential,
  };
  const result = await verifyAuthenticationResponse({
    ...options,
    response: assertion(),
  });
  assert.equal(result.verified, true);
  assert.equal(result.authenticationInfo.newCounter, 1);
  const rejected = async (options) => {
    try {
      const r = await verifyAuthenticationResponse(options);
      assert.equal(r.verified, false);
    } catch (error) {
      if (error.code === "ERR_ASSERTION") throw error;
    }
  };
  const tampered = assertion();
  tampered.response.signature = base64(crypto.randomBytes(70));
  await rejected({ ...options, response: tampered });
  await rejected({ ...options, response: assertion(1) }); // signed, but missing device user verification
  await rejected({
    ...options,
    response: assertion(),
    expectedChallenge: "another-challenge",
  });
  await rejected({
    ...options,
    response: assertion(),
    expectedOrigin: "https://another.example.test",
  });
  await rejected({
    ...options,
    response: assertion(),
    expectedRPID: "another.example.test",
  });
  console.log(
    "PASS: real ES256 registration/authentication, signature verification, counter, required device verification, challenge/origin/RP binding. Generated authenticator fixture; not a physical Face ID/fingerprint test.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
