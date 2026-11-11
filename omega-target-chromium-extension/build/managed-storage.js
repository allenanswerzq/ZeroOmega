const MANAGED_POLICY_KEYS = ["settingsJson", "settingsSha256"];
const MANAGED_STATE_DEFAULTS = {
  managedSettingsSha256: "",
  managedProfileKeys: [],
  managedChromeProfile: "",
  managedStartupProfile: "",
  managedLauncherTabsChecked: false,
};
const PROFILE_TYPES = new Set(["socks5", "switch"]);
const BUILTIN_PROFILES = new Set(["direct", "system"]);
// Chrome does not tell extensions which profile they run in, so a launcher
// names it once through chrome-profile.html and the profile's state keeps it.
const CHROME_PROFILE_MESSAGE = "zeroOmegaManagedChromeProfile";
const CHROME_PROFILE_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._ -]*[A-Za-z0-9])?$/;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid managed settings: ${message}`);
}

function isKnownProfile(profileKeys, name) {
  return BUILTIN_PROFILES.has(name) || profileKeys.includes(`+${name}`);
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

    if (profile.type === "switch") {
      assert(
        profile.defaultProfile === undefined ||
          (typeof profile.defaultProfile === "string" && profile.defaultProfile),
        `${name} has an invalid defaultProfile`,
      );
      profiles[`+${name}`] = {
        name,
        displayName: profile.displayName || name,
        profileType: "SwitchProfile",
        color: profile.color,
        rules: [],
        defaultProfileName: profile.defaultProfile || "direct",
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
  const profileKeys = Object.keys(profiles);
  for (const key of mutableProfileKeys) {
    assert(
      isKnownProfile(profileKeys, profiles[key].defaultProfileName),
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

  const chromeProfiles = {};
  if (settings.chromeProfiles !== undefined) {
    assert(
      isPlainObject(settings.chromeProfiles),
      "chromeProfiles must be an object",
    );
    for (const [chromeProfile, value] of Object.entries(settings.chromeProfiles)) {
      assert(
        CHROME_PROFILE_NAME.test(chromeProfile),
        `Chrome profile name ${chromeProfile} is invalid`,
      );
      assert(isPlainObject(value), `Chrome profile ${chromeProfile} must be an object`);
      assert(
        typeof value.startupProfile === "string" &&
          Object.prototype.hasOwnProperty.call(profiles, `+${value.startupProfile}`),
        `Chrome profile ${chromeProfile} startupProfile does not exist`,
      );
      chromeProfiles[chromeProfile] = value.startupProfile;
    }
  }

  return {
    changes: {
      ...profiles,
      "-enableQuickSwitch": settings.quickSwitchEnabled,
      "-hideBuiltinProfiles": settings.hideBuiltinProfiles,
      "-quickSwitchProfiles": quickSwitchProfiles,
      "-startupProfileName": settings.startupProfile,
    },
    profileKeys,
    mutableProfileKeys,
    exclusiveProfiles: settings.exclusiveProfiles,
    startupProfile: settings.startupProfile,
    chromeProfiles,
  };
}

function startupProfileFor(managed, chromeProfile) {
  return Object.prototype.hasOwnProperty.call(managed.chromeProfiles, chromeProfile)
    ? managed.chromeProfiles[chromeProfile]
    : managed.startupProfile;
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
    "web.switchGuide": "shown",
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
        defaultProfileName: isKnownProfile(
          managed.profileKeys,
          current[key].defaultProfileName,
        )
          ? current[key].defaultProfileName
          : value.defaultProfileName,
      };
    }
    if (!sameValue(current[key], nextValue)) changes[key] = nextValue;
  }
  return changes;
}

// A new profile opens its launcher page before Chrome finishes installing this
// extension, so the page fails to load. On its first start the extension
// reloads such tabs once; they then load and name the profile.
async function reloadLauncherTabs(state) {
  const { managedLauncherTabsChecked } = await state.get({
    managedLauncherTabsChecked: false,
  });
  if (managedLauncherTabsChecked || !chrome.tabs?.query) return 0;
  const page = chrome.runtime.getURL("chrome-profile.html");
  const tabs = await chrome.tabs.query({});
  const launchers = tabs.filter((tab) => (tab.url || tab.pendingUrl || "").startsWith(page));
  await Promise.all(launchers.map((tab) => chrome.tabs.reload(tab.id)));
  await state.set({ managedLauncherTabsChecked: true });
  return launchers.length;
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
        const startupProfile = startupProfileFor(
          managed,
          previous.managedChromeProfile,
        );
        managed.changes["-startupProfileName"] = startupProfile;
        const current = options.getAll();
        const changes = buildManagedChanges(managed, previous, current);

        if (Object.keys(changes).length) await options._setOptions(changes);
        const startupChanged =
          previous.managedSettingsSha256 !== policy.settingsSha256 ||
          previous.managedStartupProfile !== startupProfile;
        await state.set({
          managedSettingsSha256: policy.settingsSha256,
          managedProfileKeys: managed.profileKeys,
          managedStartupProfile: startupProfile,
        });
        if (startupChanged) await options.applyProfile(startupProfile);
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
  chrome.runtime?.onMessage?.addListener((message, sender, respond) => {
    if (message?.type !== CHROME_PROFILE_MESSAGE) return false;
    const fromThisExtension =
      sender?.id === chrome.runtime.id &&
      String(sender.url || "").startsWith(chrome.runtime.getURL(""));
    const name = message.chromeProfile;
    if (!fromThisExtension || typeof name !== "string" || !CHROME_PROFILE_NAME.test(name)) {
      respond({ ok: false, error: "invalid Chrome profile request" });
      return false;
    }
    state
      .set({ managedChromeProfile: name })
      .then(reconcile)
      .then(() => state.get({ managedStartupProfile: "" }))
      .then(
        ({ managedStartupProfile }) =>
          respond({ ok: true, startupProfile: managedStartupProfile }),
        (error) => respond({ ok: false, error: String(error?.message || error) }),
      );
    return true;
  });
  options.ready.then(reconcile);
  reloadLauncherTabs(state).catch((error) =>
    log.error("Managed ZeroOmega launcher tabs:", error),
  );
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
  CHROME_PROFILE_MESSAGE,
  attach,
  buildManagedChanges,
  dismissOnboarding,
  parseManagedSettings,
  reloadLauncherTabs,
  sha256Hex,
  startupProfileFor,
});
