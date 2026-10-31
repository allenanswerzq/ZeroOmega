(function() {
  var BUILTINSYNCKEY, Log, OmegaTargetCurrent, Promise, dispName, options, startupCheck, upgradeMigrateFn, zeroBackground, _ref,
    __hasProp = {}.hasOwnProperty;

  OmegaTargetCurrent = Object.create(OmegaTargetChromium);

  Promise = OmegaTargetCurrent.Promise;

  Promise.longStackTraces();

  OmegaTargetCurrent.Log = Object.create(OmegaTargetCurrent.Log);

  Log = OmegaTargetCurrent.Log;

  BUILTINSYNCKEY = 'zeroOmegaSync';

  globalThis.isBrowserRestart = false;

  startupCheck = function() {
    setTimeout(function() {
      return globalThis.isBrowserRestart = false;
    }, 2000);
    return globalThis.isBrowserRestart;
  };

  options = null;

  chrome.runtime.onStartup.addListener(function() {
    return globalThis.isBrowserRestart = true;
  });

  if ((_ref = chrome.contextMenus) != null) {
    _ref.onClicked.addListener(function(info, tab) {
      return options != null ? options.ready.then(function() {
        switch (info.menuItemId) {
          case 'inspectPage':
          case 'inspectLink':
          case 'inspectElement':
          case 'inspectFrame':
            return options._inspect.inspect(info, tab);
        }
      }) : void 0;
    });
  }

  upgradeMigrateFn = function(details) {
    var currentVersion, manifest, previousVersion;
    if (details.reason === 'install') {
      options.ready.then(function() {
        return console.log('fresh install:', details);
      });
    }
    if (details.reason === 'update') {
      manifest = chrome.runtime.getManifest();
      currentVersion = manifest.version;
      previousVersion = details.previousVersion;
      if (compareVersions.compare(currentVersion, previousVersion, '>')) {
        if (compareVersions.compare('3.3.0', currentVersion, '>')) {
          return options.ready.then(function() {
            chrome.storage.sync.clear();
            chrome.storage.local.clear();
            return idbKeyval.clear();
          });
        } else {
          switch (currentVersion) {
            case '3.3.10':
              return options.ready.then(function() {
                return true;
              });
            case '3.3.11':
              return options.ready.then(function() {
                return true;
              });
          }
        }
      }
    }
  };

  chrome.runtime.onInstalled.addListener(function(details) {
    return setTimeout(function() {
      return upgradeMigrateFn(details);
    }, 2);
  });

  dispName = function(name) {
    return chrome.i18n.getMessage('profile_' + name) || name;
  };

  zeroBackground = function(zeroStorage, opts) {
    var actionForUrl, builtInSyncStorage, charCodeUnderscore, drawContext, drawError, drawIcon, encodeError, external, iconCache, isHidden, proxyImpl, refreshActivePageIfEnabled, resetAllOptions, state, storage, sync, syncStorage, tabs, timeout, unhandledPromises, unhandledPromisesId, unhandledPromisesNextId, _ref1, _ref2;
    unhandledPromises = [];
    unhandledPromisesId = [];
    unhandledPromisesNextId = 1;
    Promise.onPossiblyUnhandledRejection(function(reason, promise) {
      Log.error("[" + unhandledPromisesNextId + "] Unhandled rejection:\n", reason);
      unhandledPromises.push(promise);
      unhandledPromisesId.push(unhandledPromisesNextId);
      return unhandledPromisesNextId++;
    });
    Promise.onUnhandledRejectionHandled(function(promise) {
      var index;
      index = unhandledPromises.indexOf(promise);
      Log.log("[" + unhandledPromisesId[index] + "] Rejection handled!", promise);
      unhandledPromises.splice(index, 1);
      return unhandledPromisesId.splice(index, 1);
    });
    iconCache = {};
    drawContext = null;
    drawError = null;
    drawIcon = function(resultColor, profileColor) {
      var cacheKey, canvas, e, icon, size, _i, _len, _ref1;
      cacheKey = "omega+" + (resultColor != null ? resultColor : '') + "+" + profileColor;
      icon = iconCache[cacheKey];
      if (icon) {
        return icon;
      }
      try {
        if (drawContext == null) {
          canvas = new OffscreenCanvas(300, 300);
          drawContext = canvas.getContext('2d', {
            willReadFrequently: true
          });
        }
        icon = {};
        _ref1 = [16, 19, 24, 32, 38];
        for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
          size = _ref1[_i];
          drawContext.scale(size, size);
          drawContext.clearRect(0, 0, 1, 1);
          if (resultColor != null) {
            drawOmega(drawContext, resultColor, profileColor);
          } else {
            drawOmega(drawContext, profileColor);
          }
          drawContext.setTransform(1, 0, 0, 1, 0, 0);
          icon[size] = drawContext.getImageData(0, 0, size, size);
          if (icon[size].data[3] === 255) {
            throw new Error('Icon drawing blocked by privacy.resistFingerprinting.');
          }
        }
      } catch (_error) {
        e = _error;
        if (drawError == null) {
          drawError = e;
          Log.error(e);
          Log.error('Profile-colored icon disabled. Falling back to static icon.');
        }
        icon = null;
      }
      return iconCache[cacheKey] = icon;
    };
    charCodeUnderscore = '_'.charCodeAt(0);
    isHidden = function(name) {
      return name.charCodeAt(0) === charCodeUnderscore && name.charCodeAt(1) === charCodeUnderscore;
    };
    actionForUrl = function(url, opts) {
      if (opts == null) {
        opts = {};
      }
      return options.ready.then(function() {
        var request;
        request = OmegaPac.Conditions.requestFromUrl(url);
        return options.matchProfile(request);
      }).then(function(_arg) {
        var attached, badgeText, condition, condition2Str, current, currentName, details, direct, icon, name, prefix, profile, profileColor, realCurrentName, result, resultColor, results, shortTitle, _i, _len, _ref1, _ref2;
        profile = _arg.profile, results = _arg.results;
        current = options.currentProfile();
        currentName = dispName(current.name);
        if (current.profileType === 'VirtualProfile') {
          realCurrentName = current.defaultProfileName;
          currentName += " [" + (dispName(realCurrentName)) + "]";
          current = options.profile(realCurrentName);
        }
        details = '';
        direct = false;
        attached = false;
        prefix = '';
        condition2Str = function(condition) {
          return condition.pattern || OmegaPac.Conditions.str(condition);
        };
        for (_i = 0, _len = results.length; _i < _len; _i++) {
          result = results[_i];
          if (Array.isArray(result)) {
            if (result[1] == null) {
              attached = false;
              name = result[0];
              if (name[0] === '+') {
                name = name.substr(1);
              }
              if (isHidden(name)) {
                attached = true;
              } else if (name !== realCurrentName) {
                details += chrome.i18n.getMessage('browserAction_defaultRuleDetails');
                details += " => " + (dispName(name)) + "\n";
              }
            } else if (result[1].length === 0) {
              if (result[0] === 'DIRECT') {
                details += chrome.i18n.getMessage('browserAction_directResult');
                details += '\n';
                direct = true;
              } else {
                details += "" + result[0] + "\n";
              }
            } else if (typeof result[1] === 'string') {
              details += "" + result[1] + " => " + result[0] + "\n";
            } else {
              condition = condition2Str((_ref1 = result[1].condition) != null ? _ref1 : result[1]);
              details += "" + condition + " => ";
              if (result[0] === 'DIRECT') {
                details += chrome.i18n.getMessage('browserAction_directResult');
                details += '\n';
                direct = true;
              } else {
                details += "" + result[0] + "\n";
              }
            }
          } else if (result.profileName) {
            if (result.isTempRule) {
              details += chrome.i18n.getMessage('browserAction_tempRulePrefix');
              prefix = chrome.i18n.getMessage('browserAction_tempRulePrefix');
            } else if (attached) {
              details += chrome.i18n.getMessage('browserAction_attachedPrefix');
              prefix = chrome.i18n.getMessage('browserAction_attachedPrefix');
              attached = false;
            }
            condition = (_ref2 = result.source) != null ? _ref2 : condition2Str(result.condition);
            details += "" + condition + " => " + (dispName(result.profileName)) + "\n";
          }
        }
        if (!details) {
          details = options.printProfile(current);
        }
        resultColor = profile.color;
        profileColor = current.color;
        icon = null;
        if (direct) {
          resultColor = options.profile('direct').color;
          profileColor = profile.color;
        } else if (profile.name === current.name && options.isCurrentProfileStatic()) {
          resultColor = profileColor = profile.color;
          if (!opts.skipIcon) {
            icon = drawIcon(profile.color);
          }
        } else {
          resultColor = profile.color;
          profileColor = current.color;
        }
        if (!opts.skipIcon) {
          if (icon == null) {
            icon = drawIcon(resultColor, profileColor);
          }
        }
        shortTitle = 'Omega: ' + currentName;
        if (profile.name !== currentName) {
          shortTitle += ' => ' + profile.name;
        }
        if (options._options['-showResultProfileOnActionBadgeText']) {
          badgeText = profile.name || '';
          if (profile.builtin) {
            badgeText = dispName(profile.name + '_badge_text');
          }
          badgeText = badgeText.substring(0, 4);
        }
        return {
          title: chrome.i18n.getMessage('browserAction_titleWithResult', [currentName, dispName(profile.name), details]),
          currentName: currentName,
          name: dispName(profile.name),
          profile: profile,
          badgeText: badgeText,
          shortTitle: shortTitle,
          prefix: prefix,
          icon: icon,
          resultColor: resultColor,
          profileColor: profileColor
        };
      })["catch"](function() {
        return null;
      });
    };
    storage = new OmegaTargetCurrent.Storage('local');
    state = new OmegaTargetCurrent.BrowserStorage(zeroStorage, 'omega.local.');
    if ((typeof chrome !== "undefined" && chrome !== null ? (_ref1 = chrome.storage) != null ? _ref1.sync : void 0 : void 0) || (typeof browser !== "undefined" && browser !== null ? (_ref2 = browser.storage) != null ? _ref2.sync : void 0 : void 0)) {
      syncStorage = new OmegaTargetCurrent.SyncStorage('sync', state);
      builtInSyncStorage = new OmegaTargetCurrent.Storage('sync');
      sync = new OmegaTargetCurrent.OptionsSync(syncStorage, builtInSyncStorage, state);
      sync.transformValue = OmegaTargetCurrent.Options.transformValueForSync;
    }
    proxyImpl = OmegaTargetCurrent.proxy.getProxyImpl(Log);
    state.set({
      proxyImplFeatures: proxyImpl.features
    });
    options = new OmegaTargetCurrent.Options(storage, state, Log, sync, proxyImpl);
    options._actionForUrl = actionForUrl;
    options.initWithOptions(null, startupCheck);
    if (globalThis.ZeroOmegaManaged != null) {
      globalThis.ZeroOmegaManaged.attach(options, state, Log);
    }
    options.externalApi = new OmegaTargetCurrent.ExternalApi(options);
    options.externalApi.listen();
    if (chrome.runtime.id !== OmegaTargetCurrent.SwitchySharp.extId && false) {
      options.switchySharp = new OmegaTargetCurrent.SwitchySharp();
      options.switchySharp.monitor();
    }
    if (sync && options && builtInSyncStorage) {
      builtInSyncStorage.watch([BUILTINSYNCKEY], function(changes, opts) {
        var builtInSyncConfig, gistId, gistToken, lastGistCommit, stateUpdate, syncBackendType, syncUsername;
        if (opts == null) {
          opts = {};
        }
        builtInSyncConfig = changes[BUILTINSYNCKEY];
        if (builtInSyncConfig) {
          gistId = builtInSyncConfig.gistId, gistToken = builtInSyncConfig.gistToken, lastGistCommit = builtInSyncConfig.lastGistCommit, syncUsername = builtInSyncConfig.syncUsername, syncBackendType = builtInSyncConfig.syncBackendType;
          stateUpdate = {
            gistId: gistId,
            gistToken: gistToken
          };
          if (syncUsername != null) {
            stateUpdate.syncUsername = syncUsername;
          }
          if (syncBackendType != null) {
            stateUpdate.syncBackendType = syncBackendType;
          }
          state.set(stateUpdate);
          if (sync.enabled) {
            console.log('check gist change', lastGistCommit);
            sync.init({
              gistId: gistId,
              gistToken: gistToken,
              username: syncUsername,
              syncBackendType: syncBackendType
            });
            return state.get({
              'lastGistCommit': ''
            }).then(function(syncConfig) {
              if (syncConfig.lastGistCommit !== lastGistCommit) {
                console.log('no match last gist commit, will check change', syncConfig.lastGistCommit);
                return sync.checkChange();
              }
            });
          } else {
            return state.get({
              'syncOptions': '',
              'lastGistCommit': ''
            }).then(function(syncConfig) {
              var _ref3;
              if (syncConfig.lastGistCommit === lastGistCommit) {
                return;
              }
              if ((_ref3 = syncConfig.syncOptions) === 'pristine' || _ref3 === 'conflict') {
                return state.set({
                  syncOptions: 'conflict'
                }).then(function() {
                  return options.setOptionsSync(true, {
                    gistId: gistId,
                    gistToken: gistToken,
                    username: syncUsername,
                    syncBackendType: syncBackendType,
                    useBuiltInSync: true,
                    force: true
                  });
                });
              }
            });
          }
        }
      });
    }
    tabs = new OmegaTargetCurrent.ChromeTabs(actionForUrl);
    tabs.watch();
    options._inspect = new OmegaTargetCurrent.Inspect(function(url, tab) {
      if (url === tab.url) {
        options.clearBadge();
        tabs.processTab(tab);
        state.remove('inspectUrl');
        return;
      }
      state.set({
        inspectUrl: url
      });
      return actionForUrl(url).then(function(action) {
        var parsedUrl, title, urlDisp;
        if (!action) {
          return;
        }
        parsedUrl = OmegaTargetCurrent.Url.parse(url);
        if (parsedUrl.hostname === OmegaTargetCurrent.Url.parse(tab.url).hostname) {
          urlDisp = parsedUrl.path;
        } else {
          urlDisp = parsedUrl.hostname;
        }
        title = chrome.i18n.getMessage('browserAction_titleInspect', urlDisp) + '\n';
        title += action.title;
        chrome.action.setTitle({
          title: title,
          tabId: tab.id
        });
        return tabs.setTabBadge(tab, {
          text: '#',
          color: action.resultColor
        });
      });
    });
    options.setProxyNotControllable(null);
    timeout = null;
    proxyImpl.watchProxyChange(function(details) {
      var internal, noRevert, notControllableBefore, parsed, reason;
      if (options.externalApi.disabled) {
        return;
      }
      if (!details) {
        return;
      }
      notControllableBefore = options.proxyNotControllable();
      internal = false;
      noRevert = false;
      switch (details['levelOfControl']) {
        case "controlled_by_other_extensions":
        case "not_controllable":
          reason = details['levelOfControl'] === 'not_controllable' ? 'policy' : 'app';
          options.setProxyNotControllable(reason);
          noRevert = true;
          break;
        default:
          options.setProxyNotControllable(null);
      }
      if (details['levelOfControl'] === 'controlled_by_this_extension') {
        internal = true;
        if (!notControllableBefore) {
          return;
        }
      }
      Log.log('external proxy: ', details);
      if (timeout != null) {
        clearTimeout(timeout);
      }
      parsed = null;
      timeout = setTimeout((function() {
        if (parsed) {
          return options.setExternalProfile(parsed, {
            noRevert: noRevert,
            internal: internal
          });
        }
      }), 500);
      parsed = proxyImpl.parseExternalProfile(details, options._options);
    });
    external = false;
    options.currentProfileChanged = function(reason) {
      var current, currentName, details, icon, message, realCurrentName, shortTitle, title;
      iconCache = {};
      if (reason === 'external') {
        external = true;
      } else if (reason !== 'clearBadge') {
        external = false;
      }
      current = options.currentProfile();
      currentName = '';
      if (current) {
        currentName = dispName(current.name);
        if (current.profileType === 'VirtualProfile') {
          realCurrentName = current.defaultProfileName;
          currentName += " [" + (dispName(realCurrentName)) + "]";
          current = options.profile(realCurrentName);
        }
      }
      details = options.printProfile(current);
      if (currentName) {
        title = chrome.i18n.getMessage('browserAction_titleWithResult', [currentName, '', details]);
        shortTitle = 'Omega: ' + currentName;
      } else {
        title = details;
        shortTitle = 'Omega: ' + details;
      }
      if (external && current.profileType !== 'SystemProfile') {
        message = chrome.i18n.getMessage('browserAction_titleExternalProxy');
        title = message + '\n' + title;
        shortTitle = 'Omega-Extern: ' + details;
        options.setBadge();
      }
      if (!current.name || !OmegaPac.Profiles.isInclusive(current)) {
        icon = drawIcon(current.color);
      } else {
        icon = drawIcon(options.profile('direct').color, current.color);
      }
      return tabs.resetAll({
        icon: icon,
        title: title,
        shortTitle: shortTitle
      });
    };
    encodeError = function(obj) {
      if (obj instanceof Error) {
        return {
          _error: 'error',
          name: obj.name,
          message: obj.message,
          stack: obj.stack,
          original: obj
        };
      } else {
        return obj;
      }
    };
    refreshActivePageIfEnabled = function() {
      if (zeroStorage['omega.local.refreshOnProfileChange'] === 'false') {
        return;
      }
      return chrome.tabs.query({
        active: true,
        lastFocusedWindow: true
      }, function(tabs) {
        var url;
        url = tabs[0].pendingUrl || tabs[0].url;
        if (!url) {
          return;
        }
        if (url.substr(0, 6) === 'chrome') {
          return;
        }
        if (url.substr(0, 6) === 'about:') {
          return;
        }
        if (url.substr(0, 4) === 'moz-') {
          return;
        }
        if (tabs[0].pendingUrl) {
          return chrome.tabs.update(tabs[0].id, {
            url: url
          });
        } else {
          return chrome.tabs.reload(tabs[0].id, {
            bypassCache: true
          });
        }
      });
    };
    resetAllOptions = function() {
      return options.ready.then(function() {
        if (typeof options._watchStop === "function") {
          options._watchStop();
        }
        if (typeof options._syncWatchStop === "function") {
          options._syncWatchStop();
        }
        return Promise.all([chrome.storage.sync.clear(), chrome.storage.local.clear()]);
      });
    };
    return chrome.runtime.onMessage.addListener(function(request, sender, respond) {
      if (!(request && request.method)) {
        return;
      }
      options.ready.then(function() {
        var method, promise, target;
        if (request.method === 'resetAllOptions') {
          target = globalThis;
          method = resetAllOptions;
        } else if (request.method === 'getState') {
          target = state;
          method = state.get;
        } else if (request.method === 'setState') {
          target = state;
          method = state.set;
        } else {
          target = options;
          method = target[request.method];
        }
        if (typeof method !== 'function') {
          Log.error("No such method " + request.method + "!");
          respond({
            error: {
              reason: 'noSuchMethod'
            }
          });
          return;
        }
        promise = Promise.resolve().then(function() {
          return method.apply(target, request.args);
        });
        if (request.refreshActivePage) {
          promise.then(refreshActivePageIfEnabled);
        }
        if (request.noReply) {
          return;
        }
        promise.then(function(result) {
          var key, value;
          if (request.method === 'updateProfile') {
            for (key in result) {
              if (!__hasProp.call(result, key)) continue;
              value = result[key];
              result[key] = encodeError(value);
            }
          }
          return respond({
            result: result
          });
        });
        return promise["catch"](function(error) {
          Log.error(request.method + ' ==>', error);
          return respond({
            error: encodeError(error)
          });
        });
      });
      if (!request.noReply) {
        return true;
      }
    });
  };

  globalThis.zeroBackground = zeroBackground;

}).call(this);
