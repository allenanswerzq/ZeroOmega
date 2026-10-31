const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(
  new URL("../overlay/managed-storage.js", `file://${__filename}`),
  "utf8",
);
let managedPolicy = {};
const context = {
  console,
  crypto: globalThis.crypto,
  TextEncoder,
  chrome: {
    runtime: { lastError: null },
    storage: {
      managed: {
        get(_keys, callback) {
          callback(managedPolicy);
        },
      },
    },
  },
};
context.globalThis = context;
vm.runInNewContext(source, context);

const { buildManagedChanges, dismissOnboarding, parseManagedSettings, sha256Hex } =
  context.ZeroOmegaManaged;
const json = JSON.stringify({
  schemaVersion: 1,
  startupProfile: "auto switch",
  quickSwitchEnabled: false,
  exclusiveProfiles: true,
  hideBuiltinProfiles: true,
  quickSwitchProfiles: ["dubai", "force-direct", "proxy", "auto switch"],
  profiles: {
    dubai: {
      type: "socks5",
      color: "#dd9955",
      host: "127.0.0.1",
      port: 5080,
    },
    "force-direct": {
      type: "socks5",
      displayName: "direct",
      color: "#77bb66",
      host: "127.0.0.1",
      port: 6080,
    },
    proxy: {
      type: "socks5",
      color: "#5577dd",
      host: "127.0.0.1",
      port: 4080,
    },
    "auto switch": {
      type: "switch",
      color: "#55ccbb",
      defaultProfile: "proxy",
    },
  },
});

const parsed = parseManagedSettings(json);
assert.equal(parsed.changes["+force-direct"].displayName, "direct");
assert.deepEqual(
  JSON.parse(JSON.stringify(parsed.changes["+proxy"].fallbackProxy)),
  { scheme: "socks5", host: "127.0.0.1", port: 4080 },
);
assert.equal(parsed.changes["+auto switch"].defaultProfileName, "proxy");
assert.equal(parsed.changes["-enableQuickSwitch"], false);
assert.equal(parsed.changes["-hideBuiltinProfiles"], true);
assert.equal(parsed.exclusiveProfiles, true);
assert.deepEqual(
  JSON.parse(JSON.stringify(parsed.profileKeys)),
  ["+dubai", "+force-direct", "+proxy", "+auto switch"],
);
assert.deepEqual(JSON.parse(JSON.stringify(parsed.mutableProfileKeys)), [
  "+auto switch",
]);

const preservedRule = {
  condition: { conditionType: "HostWildcardCondition", pattern: "*.example.com" },
  profileName: "proxy",
};
const managedChanges = buildManagedChanges(
  parsed,
  { managedProfileKeys: parsed.profileKeys },
  {
    "+old profile": { name: "old profile", profileType: "FixedProfile" },
    "+auto switch": {
      ...parsed.changes["+auto switch"],
      color: "#000000",
      rules: [preservedRule],
      defaultProfileName: "force-direct",
    },
  },
);
assert.equal(
  Object.prototype.hasOwnProperty.call(managedChanges, "+old profile"),
  true,
);
assert.equal(managedChanges["+old profile"], undefined);
assert.deepEqual(
  JSON.parse(JSON.stringify(managedChanges["+auto switch"].rules)),
  [preservedRule],
);
assert.equal(
  managedChanges["+auto switch"].defaultProfileName,
  "force-direct",
);

assert.throws(
  () => parseManagedSettings(json.replace('"port":4080', '"port":70000')),
  /invalid port/,
);

async function main() {
  const digest = await sha256Hex("hello");
  assert.equal(digest, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");

  const stateUpdates = [];
  const state = {
    set(update) {
      stateUpdates.push(update);
      return Promise.resolve();
    },
  };
  assert.equal(await dismissOnboarding(state), false);
  assert.deepEqual(stateUpdates, []);

  managedPolicy = { settingsJson: json, settingsSha256: await sha256Hex(json) };
  assert.equal(await dismissOnboarding(state), true);
  assert.deepEqual(JSON.parse(JSON.stringify(stateUpdates)), [
    { firstRun: "", "web.switchGuide": "" },
  ]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
