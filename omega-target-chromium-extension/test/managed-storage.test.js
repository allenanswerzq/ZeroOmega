const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(
  new URL("../overlay/managed-storage.js", `file://${__filename}`),
  "utf8",
);
let managedPolicy = {};
const messageListeners = [];
const context = {
  console,
  crypto: globalThis.crypto,
  TextEncoder,
  chrome: {
    runtime: {
      id: "zeroomega",
      lastError: null,
      getURL: (path) => `chrome-extension://zeroomega/${path}`,
      onMessage: { addListener: (listener) => messageListeners.push(listener) },
    },
    storage: {
      managed: {
        get(_keys, callback) {
          callback(managedPolicy);
        },
      },
      onChanged: { addListener() {} },
    },
  },
};
context.globalThis = context;
vm.runInNewContext(source, context);

const {
  CHROME_PROFILE_MESSAGE,
  attach,
  buildManagedChanges,
  dismissOnboarding,
  parseManagedSettings,
  sha256Hex,
  startupProfileFor,
} = context.ZeroOmegaManaged;
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
  chromeProfiles: {
    "omarchy-china": { startupProfile: "force-direct" },
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
assert.equal(startupProfileFor(parsed, "omarchy-china"), "force-direct");
assert.equal(startupProfileFor(parsed, ""), "auto switch");
assert.equal(startupProfileFor(parsed, "Zhang"), "auto switch");
assert.throws(
  () => parseManagedSettings(json.replace('"startupProfile":"force-direct"', '"startupProfile":"gone"')),
  /omarchy-china startupProfile does not exist/,
);
assert.throws(
  () => parseManagedSettings(json.replace('"omarchy-china"', '"../china"')),
  /Chrome profile name/,
);
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

const unseeded = parseManagedSettings(json.replace(',"defaultProfile":"proxy"', ""));
assert.equal(unseeded.changes["+auto switch"].defaultProfileName, "direct");

const builtinDefault = buildManagedChanges(
  unseeded,
  { managedProfileKeys: unseeded.profileKeys },
  {
    "+auto switch": {
      ...unseeded.changes["+auto switch"],
      defaultProfileName: "system",
    },
  },
);
assert.equal(
  Object.prototype.hasOwnProperty.call(builtinDefault, "+auto switch"),
  false,
);

assert.throws(
  () => parseManagedSettings(json.replace('"defaultProfile":"proxy"', '"defaultProfile":"gone"')),
  /defaultProfile does not exist/,
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
    { firstRun: "", "web.switchGuide": "shown" },
  ]);

  // A named Chrome profile starts in its own managed profile; others do not.
  const stored = {};
  const applied = [];
  const profileState = {
    get: async (defaults) => ({ ...defaults, ...stored }),
    set: async (update) => Object.assign(stored, update),
  };
  const options = {
    ready: Promise.resolve(),
    getAll: () => ({}),
    _setOptions: async () => {},
    applyProfile: async (name) => applied.push(name),
  };
  attach(options, profileState, { error: (...args) => assert.fail(args.join(" ")) });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(applied, ["auto switch"]);

  const ask = (message, sender) =>
    new Promise((resolve) => {
      const listener = messageListeners.at(-1);
      listener(message, sender, (reply) => resolve(JSON.parse(JSON.stringify(reply))));
    });
  const page = { id: "zeroomega", url: "chrome-extension://zeroomega/chrome-profile.html" };
  const message = { type: CHROME_PROFILE_MESSAGE, chromeProfile: "omarchy-china" };
  assert.deepEqual(await ask(message, page), { ok: true, startupProfile: "force-direct" });
  assert.deepEqual(applied, ["auto switch", "force-direct"]);
  // Naming it again changes nothing, and other senders are refused.
  assert.deepEqual(await ask(message, page), { ok: true, startupProfile: "force-direct" });
  assert.deepEqual(applied, ["auto switch", "force-direct"]);
  const website = { id: "zeroomega", url: "https://example.com/" };
  assert.equal((await ask(message, website)).ok, false);
  assert.equal(stored.managedChromeProfile, "omarchy-china");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
