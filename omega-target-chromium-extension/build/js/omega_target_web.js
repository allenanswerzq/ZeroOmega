(function() {
  var getActiveTab, queryTab,
    __slice = [].slice,
    __hasProp = {}.hasOwnProperty;

  queryTab = function(cb) {
    return chrome.tabs.query({
      active: true,
      lastFocusedWindow: true
    }, function(tabs) {
      if (tabs.length === 0 || !(tabs[0].pendingUrl || tabs[0].url)) {
        return cb();
      } else {
        return cb(tabs[0]);
      }
    });
  };

  getActiveTab = function(activeTabId, cb) {
    var sp;
    if (!activeTabId) {
      sp = new URLSearchParams(document.location.search);
      activeTabId = sp.get('activeTabId');
    }
    activeTabId = parseInt(activeTabId);
    if (activeTabId) {
      return chrome.tabs.get(activeTabId).then(cb)["catch"](function() {
        return cb();
      });
    } else {
      return queryTab(cb);
    }
  };

  angular.module('omegaTarget', []).factory('omegaTarget', function($q) {
    var callBackground, callBackgroundNoReply, connectBackground, decodeError, isChromeUrl, omegaTarget, optionsChangeCallback, prefix, requestInfoCallback, urlParser;
    decodeError = function(obj) {
      var err;
      if (obj._error === 'error') {
        err = new Error(obj.message);
        err.name = obj.name;
        err.stack = obj.stack;
        err.original = obj.original;
        return err;
      } else {
        return obj;
      }
    };
    callBackgroundNoReply = function() {
      var args, method;
      method = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
      return chrome.runtime.sendMessage({
        method: method,
        args: args,
        noReply: true
      });
    };
    callBackground = function() {
      var args, d, maxAttempts, maxWorkerDownAttempts, method, send;
      method = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
      d = $q['defer']();
      maxAttempts = 5;
      maxWorkerDownAttempts = 9;
      send = function(attempt) {
        chrome.runtime.sendMessage({
          method: method,
          args: args
        }, function(response) {
          var delay, err, max, workerDown, _ref;
          if (chrome.runtime.lastError != null) {
            err = chrome.runtime.lastError;
            workerDown = ((_ref = err.message) != null ? _ref.indexOf('Receiving end does not exist') : void 0) >= 0;
            max = workerDown ? maxWorkerDownAttempts : maxAttempts;
            if (attempt < max) {
              delay = workerDown && attempt > maxAttempts ? 2000 * Math.pow(2, attempt - maxAttempts - 1) : 100 * attempt;
              setTimeout((function() {
                return send(attempt + 1);
              }), delay);
            } else {
              d.reject(err);
            }
            return;
          }
          if (response != null ? response.error : void 0) {
            return d.reject(decodeError(response.error));
          } else {
            return d.resolve(response != null ? response.result : void 0);
          }
        });
      };
      send(1);
      return d.promise;
    };
    connectBackground = function(name, message, callback) {
      var onDisconnect, port;
      port = chrome.runtime.connect({
        name: name
      });
      onDisconnect = function() {
        port.onDisconnect.removeListener(onDisconnect);
        return port.onMessage.removeListener(callback);
      };
      port.onDisconnect.addListener(onDisconnect);
      port.postMessage(message);
      port.onMessage.addListener(callback);
    };
    isChromeUrl = function(url) {
      return url.substr(0, 6) === 'chrome' || url.substr(0, 4) === 'moz-' || url.substr(0, 6) === 'about:';
    };
    optionsChangeCallback = [];
    requestInfoCallback = null;
    prefix = 'omega.local.';
    urlParser = document.createElement('a');
    omegaTarget = {
      options: null,
      state: function(name, value) {
        var d, newItem;
        d = $q.defer();
        if (arguments.length === 1) {
          if (Array.isArray(name)) {
            callBackground('getState', name).then(function(values) {
              return d.resolve(name.map(function(key) {
                return values[key];
              }));
            }, d.reject);
          } else {
            callBackground('getState', [name]).then(function(values) {
              return d.resolve(values[name]);
            }, d.reject);
          }
        } else {
          newItem = {};
          newItem[name] = value;
          callBackground('setState', newItem).then(function() {
            return d.resolve(value);
          }, d.reject);
        }
        return d.promise;
      },
      lastUrl: function(url) {
        var name;
        name = 'web.last_url';
        if (url) {
          localStorage[prefix + name] = url;
          return url;
        } else {
          try {
            return JSON.parse(localStorage[prefix + name]);
          } catch (_error) {}
        }
      },
      addOptionsChangeCallback: function(callback) {
        return optionsChangeCallback.push(callback);
      },
      refresh: function(args) {
        return callBackground('getAll').then(function(opt) {
          var callback, _i, _len;
          omegaTarget.options = opt;
          for (_i = 0, _len = optionsChangeCallback.length; _i < _len; _i++) {
            callback = optionsChangeCallback[_i];
            callback(omegaTarget.options);
          }
          return args;
        });
      },
      renameProfile: function(fromName, toName) {
        return callBackground('renameProfile', fromName, toName).then(omegaTarget.refresh);
      },
      replaceRef: function(fromName, toName) {
        return callBackground('replaceRef', fromName, toName).then(omegaTarget.refresh);
      },
      optionsPatch: function(patch) {
        return callBackground('patch', patch).then(omegaTarget.refresh);
      },
      resetOptions: function(opt) {
        return callBackground('reset', opt).then(omegaTarget.refresh);
      },
      updateProfile: function(name, opt_bypass_cache) {
        return callBackground('updateProfile', name, opt_bypass_cache).then(function(results) {
          var key, value;
          for (key in results) {
            if (!__hasProp.call(results, key)) continue;
            value = results[key];
            results[key] = decodeError(value);
          }
          return results;
        }).then(omegaTarget.refresh);
      },
      getMessage: chrome.i18n.getMessage.bind(chrome.i18n),
      openOptions: function(hash) {
        var d, options_url;
        d = $q['defer']();
        options_url = chrome.runtime.getURL('options.html');
        chrome.tabs.query({
          url: options_url
        }, function(tabs) {
          var props, url, _ref;
          url = hash ? (urlParser.href = ((_ref = tabs[0]) != null ? _ref.url : void 0) || options_url, urlParser.hash = hash, urlParser.href) : options_url;
          if (tabs.length > 0) {
            props = {
              active: true
            };
            if (hash) {
              props.url = url;
            }
            chrome.tabs.update(tabs[0].id, props);
          } else {
            chrome.tabs.create({
              url: url
            });
          }
          return d.resolve();
        });
        return d.promise;
      },
      applyProfile: function(name) {
        return callBackground('applyProfile', name);
      },
      applyProfileNoReply: function(name) {
        return callBackgroundNoReply('applyProfile', name);
      },
      addTempRule: function(domain, profileName, toggle) {
        return callBackground('addTempRule', domain, profileName, toggle);
      },
      addCondition: function(condition, profileName) {
        return callBackground('addCondition', condition, profileName);
      },
      addProfile: function(profile) {
        return callBackground('addProfile', profile).then(omegaTarget.refresh);
      },
      setDefaultProfile: function(profileName, defaultProfileName) {
        return callBackground('setDefaultProfile', profileName, defaultProfileName);
      },
      getActivePageInfo: function(activeTabId) {
        var clearBadge, d;
        clearBadge = true;
        d = $q['defer']();
        getActiveTab(activeTabId, function(tab) {
          var args;
          if (!tab) {
            d.resolve(null);
            return;
          }
          args = {
            tabId: tab.id,
            url: tab.pendingUrl || tab.url
          };
          if (tab.id && requestInfoCallback) {
            connectBackground('tabRequestInfo', args, requestInfoCallback);
          }
          return d.resolve(callBackground('getPageInfo', args));
        });
        return d.promise.then(function(info) {
          if (info != null ? info.url : void 0) {
            return info;
          } else {
            return null;
          }
        });
      },
      refreshActivePage: function(activeTabId) {
        var d;
        d = $q['defer']();
        getActiveTab(activeTabId, function(tab) {
          var url;
          if (!tab) {
            return d.resolve();
          }
          url = tab.pendingUrl || tab.url;
          if (url && !isChromeUrl(url)) {
            if (tab.pendingUrl) {
              chrome.tabs.update(tab.id, {
                url: url
              });
            } else {
              chrome.tabs.reload(tab.id, {
                bypassCache: true
              });
            }
          }
          return d.resolve();
        });
        return d.promise;
      },
      openManage: function() {
        return chrome.tabs.create({
          url: 'chrome://extensions/?id=' + chrome.runtime.id
        });
      },
      openShortcutConfig: function() {
        return chrome.tabs.create({
          url: 'chrome://extensions/configureCommands'
        });
      },
      setOptionsSync: function(enabled, args) {
        return callBackground('setOptionsSync', enabled, args);
      },
      resetOptionsSync: function(args) {
        return callBackground('resetOptionsSync', args);
      },
      checkOptionsSyncChange: function() {
        return callBackground('checkOptionsSyncChange');
      },
      setRequestInfoCallback: function(callback) {
        return requestInfoCallback = callback;
      }
    };
    return omegaTarget;
  });

}).call(this);
