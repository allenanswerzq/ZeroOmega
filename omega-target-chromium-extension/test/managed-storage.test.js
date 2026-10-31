const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(
  new URL("../overlay/managed-storage.js", `file://${__filename}`),
  "utf8",
);
const context = { console, crypto: globalThis.crypto, TextEncoder };
context.globalThis = context;
vm.runInNewContext(source, context);

const { parseManagedSettings, sha256Hex } = context.ZeroOmegaManaged;
const json = JSON.stringify({
  schemaVersion: 1,
  startupProfile: "Automatic (TUN)",
  quickSwitchProfiles: ["Automatic (TUN)", "Proxy"],
  profiles: {
    "Automatic (TUN)": { type: "direct", color: "#55ccbb" },
    Proxy: { type: "socks5", color: "#5577dd", host: "127.0.0.1", port: 4080 },
  },
});

const parsed = parseManagedSettings(json);
assert.equal(parsed.changes["+Automatic (TUN)"].defaultProfileName, "direct");
assert.deepEqual(
  JSON.parse(JSON.stringify(parsed.changes["+Proxy"].fallbackProxy)),
  { scheme: "socks5", host: "127.0.0.1", port: 4080 },
);
assert.equal(parsed.changes["-enableQuickSwitch"], true);
assert.deepEqual(
  JSON.parse(JSON.stringify(parsed.profileKeys)),
  ["+Automatic (TUN)", "+Proxy"],
);

assert.throws(
  () => parseManagedSettings(json.replace('"port":4080', '"port":70000')),
  /invalid port/,
);

async function main() {
  const digest = await sha256Hex("hello");
  assert.equal(digest, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
