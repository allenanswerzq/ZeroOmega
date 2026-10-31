const MANAGED_POLICY_KEYS = ["settingsJson", "settingsSha256"];
const MANAGED_STATE_DEFAULTS = {
  managedSettingsSha256: "",
  managedProfileKeys: [],
};
const PROFILE_TYPES = new Set(["direct", "socks5", "switch"]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid managed settings: ${message}`);
}

function parseManagedSettings(settingsJson) {
  assert(typeof settingsJson === "string", "settingsJson must be a string");

  let settings;
  try {
    settings = JSON.parse(settingsJson);
  } catch (error) {
    throw new Error(`Invalid managed settings JSON: ${error.message}`);
  }

  assert(isPlainObject(settings), "root must be an object");
  assert(settings.schemaVersion === 1, "unsupported schemaVersion");
  assert(isPlainObject(settings.profiles), "profiles must be an object");
  assert(
    typeof settings.startupProfile === "string" && settings.startupProfile,
    "startupProfile must be a non-empty string",
  );
  assert(
    Array.isArray(settings.quickSwitchProfiles),
    "quickSwitchProfiles must be an array",
  );
  assert(
    typeof settings.quickSwitchEnabled === "boolean",
    "quickSwitchEnabled must be a boolean",
  );
  assert(
    typeof settings.exclusiveProfiles === "boolean",
    "exclusiveProfiles must be a boolean",
  );
  assert(
    typeof settings.hideBuiltinProfiles === "boolean",
    "hideBuiltinProfiles must be a boolean",
  );

  const profiles = {};
  const mutableProfileKeys = [];
  for (const [name, profile] of Object.entries(settings.profiles)) {
    assert(name && !name.startsWith("+"), "profile names must be plain names");
    assert(isPlainObject(profile), `${name} must be an object`);
    assert(PROFILE_TYPES.has(profile.type), `${name} has an unsupported type`);
    assert(
      typeof profile.color === "string" && /^#[0-9a-f]{6}$/i.test(profile.color),
      `${name} has an invalid color`,
    );
    if (profile.displayName !== undefined) {
      assert(
        typeof profile.displayName === "string" && profile.displayName,
        `${name} has an invalid displayName`,
      );
    }

    if (profile.type === "direct") {
      profiles[`+${name}`] = {
        name,
        displayName: profile.displayName || name,
        profileType: "SwitchProfile",
        color: profile.color,
        rules: [],
        defaultProfileName: "direct",
      };
      continue;
    }

    if (profile.type === "switch") {
      assert(
        typeof profile.defaultProfile === "string" && profile.defaultProfile,
        `${name} needs a defaultProfile`,
      );
      profiles[`+${name}`] = {
        name,
        displayName: profile.displayName || name,
        profileType: "SwitchProfile",
        color: profile.color,
        rules: [],
        defaultProfileName: profile.defaultProfile,
      };
      mutableProfileKeys.push(`+${name}`);
      continue;
    }

    assert(typeof profile.host === "string" && profile.host, `${name} needs a host`);
    assert(
      Number.isInteger(profile.port) && profile.port > 0 && profile.port <= 65535,
      `${name} has an invalid port`,
    );
    profiles[`+${name}`] = {
      name,
      displayName: profile.displayName || name,
      profileType: "FixedProfile",
      color: profile.color,
      fallbackProxy: {
        scheme: "socks5",
        host: profile.host,
        port: profile.port,
      },
      bypassList: [
        { conditionType: "BypassCondition", pattern: "127.0.0.1" },
        { conditionType: "BypassCondition", pattern: "[::1]" },
        { conditionType: "BypassCondition", pattern: "localhost" },
      ],
    };
  }

  assert(
    Object.prototype.hasOwnProperty.call(profiles, `+${settings.startupProfile}`),
    "startupProfile does not exist",
  );
  for (const key of mutableProfileKeys) {
    const defaultProfile = profiles[key].defaultProfileName;
    assert(
      Object.prototype.hasOwnProperty.call(profiles, `+${defaultProfile}`),
      `${profiles[key].name} defaultProfile does not exist`,
    );
  }
  const quickSwitchProfiles = settings.quickSwitchProfiles.map((name) => {
    assert(typeof name === "string" && name, "quick-switch names must be strings");
    assert(
      Object.prototype.hasOwnProperty.call(profiles, `+${name}`),
      `quick-switch profile ${name} does not exist`,
    );
    return name;
  });

  return {
    changes: {
      ...profiles,
      "-enableQuickSwitch": settings.quickSwitchEnabled,
      "-hideBuiltinProfiles": settings.hideBuiltinProfiles,
      "-quickSwitchProfiles": quickSwitchProfiles,
      "-startupProfileName": settings.startupProfile,
    },
    profileKeys: Object.keys(profiles),
    mutableProfileKeys,
    exclusiveProfiles: settings.exclusiveProfiles,
    startupProfile: settings.startupProfile,
  };
}

async function sha256Hex(value) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function managedStorageGet(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.managed.get(keys, (result) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(result);
    });
  });
}

async function dismissOnboarding(state) {
  const policy = await managedStorageGet(MANAGED_POLICY_KEYS);
  if (!policy.settingsJson && !policy.settingsSha256) return false;
  await state.set({
    firstRun: "",
    "web.switchGuide": "",
  });
  return true;
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function buildManagedChanges(managed, previous, current) {
  const changes = {};
  const previousProfileKeys = new Set(previous.managedProfileKeys || []);

  for (const key of previous.managedProfileKeys || []) {
    if (!managed.profileKeys.includes(key) && current[key] !== undefined) {
      changes[key] = undefined;
    }
  }
  if (managed.exclusiveProfiles) {
    for (const key of Object.keys(current)) {
      if (key.startsWith("+") && !managed.profileKeys.includes(key)) {
        changes[key] = undefined;
      }
    }
  }
  for (const [key, value] of Object.entries(managed.changes)) {
    let nextValue = value;
    if (
      managed.mutableProfileKeys.includes(key) &&
      previousProfileKeys.has(key) &&
      current[key]?.profileType === value.profileType
    ) {
      nextValue = {
        ...current[key],
        ...value,
        rules: Array.isArray(current[key].rules) ? current[key].rules : [],
        defaultProfileName: managed.profileKeys.includes(
          `+${current[key].defaultProfileName}`,
        )
          ? current[key].defaultProfileName
          : value.defaultProfileName,
      };
    }
    if (!sameValue(current[key], nextValue)) changes[key] = nextValue;
  }
  return changes;
}

function attach(options, state, log = console) {
  if (!chrome.storage?.managed) return;

  let reconcileRunning = null;
  let reconcileAgain = false;
  let activeProfileKeys = new Set();

  const reconcile = async () => {
    if (reconcileRunning) {
      reconcileAgain = true;
      return reconcileRunning;
    }

    reconcileRunning = (async () => {
      await options.ready;
      do {
        reconcileAgain = false;
        const policy = await managedStorageGet(MANAGED_POLICY_KEYS);
        if (!policy.settingsJson && !policy.settingsSha256) return;
        assert(
          typeof policy.settingsJson === "string" && policy.settingsJson,
          "settingsJson must be a non-empty string",
        );
        assert(
          typeof policy.settingsSha256 === "string" &&
            /^[0-9a-f]{64}$/.test(policy.settingsSha256),
          "settingsSha256 must be a lowercase SHA-256",
        );
        assert(
          (await sha256Hex(policy.settingsJson)) === policy.settingsSha256,
          "settingsJson digest does not match settingsSha256",
        );

        const managed = parseManagedSettings(policy.settingsJson);
        activeProfileKeys = new Set(managed.profileKeys);
        const previous = await state.get(MANAGED_STATE_DEFAULTS);
        const current = options.getAll();
        const changes = buildManagedChanges(managed, previous, current);

        if (Object.keys(changes).length) await options._setOptions(changes);
        const policyChanged =
          previous.managedSettingsSha256 !== policy.settingsSha256;
        await state.set({
          managedSettingsSha256: policy.settingsSha256,
          managedProfileKeys: managed.profileKeys,
        });
        if (policyChanged) await options.applyProfile(managed.startupProfile);
      } while (reconcileAgain);
    })()
      .catch((error) => log.error("Managed ZeroOmega settings:", error))
      .finally(() => {
        reconcileRunning = null;
      });

    return reconcileRunning;
  };

  dismissOnboarding(state).catch((error) =>
    log.error("Managed ZeroOmega onboarding:", error),
  );
  options.ready.then(reconcile);
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "managed") {
      if (MANAGED_POLICY_KEYS.some((key) => changes[key])) reconcile();
      return;
    }
    if (areaName === "local") {
      const managedKeys = new Set([
        ...activeProfileKeys,
        "-enableQuickSwitch",
        "-quickSwitchProfiles",
        "-startupProfileName",
      ]);
      if (Object.keys(changes).some((key) => managedKeys.has(key))) reconcile();
    }
  });
}

globalThis.ZeroOmegaManaged = Object.freeze({
  attach,
  buildManagedChanges,
  dismissOnboarding,
  parseManagedSettings,
  sha256Hex,
});
