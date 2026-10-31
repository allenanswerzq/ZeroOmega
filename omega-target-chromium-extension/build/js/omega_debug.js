(function() {
  var logStore, syncStore, waitTimeFn;

  logStore = idbKeyval.createStore('log-store', 'log-store');

  syncStore = idbKeyval.createStore('sync-store', 'sync');

  waitTimeFn = function(timeout) {
    if (timeout == null) {
      timeout = 1000;
    }
    return new Promise(function(resolve, reject) {
      return setTimeout(function() {
        return resolve();
      }, timeout);
    });
  };

  window.OmegaDebug = {
    getProjectVersion: function() {
      return chrome.runtime.getManifest().version;
    },
    getExtensionVersion: function() {
      return chrome.runtime.getManifest().version;
    },
    downloadLog: function() {
      return idbKeyval.entries(logStore).then(function(entries) {
        var zip, zipFolder;
        zip = new JSZip();
        zipFolder = zip.folder('ZeroOmega');
        entries.forEach(function(entry) {
          if (entry[0] !== 'lastError') {
            return zipFolder.file(entry[1].date + '.log', entry[1].val);
          }
        });
        return zip.generateAsync({
          compression: "DEFLATE",
          compressionOptions: {
            level: 9
          },
          type: 'blob'
        });
      }).then(function(blob) {
        var filename;
        filename = "ZeroOmegaLog_" + (Date.now()) + ".zip";
        return saveAs(blob, filename);
      });
    },
    resetOptions: function() {
      return chrome.runtime.sendMessage({
        method: 'resetAllOptions'
      }, function(response) {
        localStorage.clear();
        return Promise.all([idbKeyval.clear(logStore), idbKeyval.clear(syncStore), waitTimeFn(2000)]).then(function() {
          return idbKeyval.clear();
        }).then(function() {
          return chrome.runtime.reload();
        });
      });
    },
    reportIssue: function() {
      return idbKeyval.get('lastError', logStore).then(function(lastError) {
        var body, env, err, extensionVersion, finalUrl, projectVersion, url;
        url = 'https://github.com/suziwen/ZeroOmega/issues/new?title=&body=';
        finalUrl = url;
        try {
          projectVersion = OmegaDebug.getProjectVersion();
          extensionVersion = OmegaDebug.getExtensionVersion();
          env = {
            extensionVersion: extensionVersion,
            projectVersion: extensionVersion,
            userAgent: navigator.userAgent
          };
          body = chrome.i18n.getMessage('popup_issueTemplate', [env.projectVersion, env.userAgent]);
          body || (body = "\n\n\n<!-- Please write your comment ABOVE this line. -->\nZeroOmega " + env.projectVersion + "\n" + env.userAgent);
          finalUrl = url + encodeURIComponent(body);
          err = lastError || '';
          if (err) {
            body += "\n```\n" + err + "\n```";
            finalUrl = (url + encodeURIComponent(body)).substr(0, 2000);
          }
        } catch (_error) {}
        return chrome.tabs.create({
          url: finalUrl
        });
      });
    }
  };

}).call(this);
