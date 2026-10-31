(function() {
  var initContextMenu, _ref;

  if (!globalThis.window) {
    globalThis.window = globalThis;
    globalThis.global = globalThis;
  }

  window.UglifyJS_NoUnsafeEval = true;

  globalThis.startupCheck = void 0;

  initContextMenu = function() {
    if (!chrome.contextMenus) {
      return;
    }
    chrome.contextMenus.removeAll();
    chrome.contextMenus.create({
      id: 'enableQuickSwitch',
      title: chrome.i18n.getMessage('contextMenu_enableQuickSwitch'),
      type: 'checkbox',
      checked: false,
      contexts: ["action"]
    });
    chrome.contextMenus.create({
      id: 'network',
      title: chrome.i18n.getMessage('contextMenu_networkMonitor'),
      contexts: ["action"]
    });
    chrome.contextMenus.create({
      id: 'tempRulesManager',
      title: chrome.i18n.getMessage('contextMenu_tempRulesManager'),
      contexts: ["action"]
    });
    chrome.contextMenus.create({
      id: 'reportIssue',
      title: chrome.i18n.getMessage('popup_reportIssues'),
      contexts: ["action"]
    });
    chrome.contextMenus.create({
      id: 'reload',
      title: chrome.i18n.getMessage('popup_Reload'),
      contexts: ["action"]
    });
    if (!!globalThis.localStorage) {
      return chrome.contextMenus.create({
        id: 'options',
        title: chrome.i18n.getMessage('popup_showOptions'),
        contexts: ["action"]
      });
    }
  };

  initContextMenu();

  if ((_ref = chrome.contextMenus) != null) {
    _ref.onClicked.addListener(function(info, tab) {
      var url;
      switch (info.menuItemId) {
        case 'network':
          url = chrome.runtime.getURL('popup/network/index.html?tabId=') + tab.id;
          return chrome.tabs.create({
            url: url
          });
        case 'tempRulesManager':
          url = chrome.runtime.getURL('popup/temp_rules/index.html');
          return tab = chrome.tabs.query({
            url: url
          }, function(tabs) {
            var props;
            if (tabs.length > 0) {
              props = {
                active: true
              };
              return chrome.tabs.update(tabs[0].id, props);
            } else {
              return chrome.tabs.create({
                url: url
              });
            }
          });
        case 'options':
          return browser.runtime.openOptionsPage();
        case 'reload':
          return chrome.runtime.reload();
        case 'reportIssue':
          return OmegaDebug.reportIssue();
      }
    });
  }

}).call(this);
