// A launcher opens chrome-profile.html?name=PROFILE in a new window so the
// managed settings can choose this Chrome profile's startup proxy. The page
// then becomes an ordinary new tab.
const MESSAGE = "zeroOmegaManagedChromeProfile";
const ATTEMPTS = 20;
const RETRY_MS = 250;

const status = document.getElementById("status");
const name = new URLSearchParams(location.search).get("name") || "";

function sendName() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: MESSAGE, chromeProfile: name }, (reply) => {
      resolve(chrome.runtime.lastError ? null : reply);
    });
  });
}

async function main() {
  // The background worker may still be starting; retry until it answers.
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const reply = await sendName();
    if (reply?.ok) {
      const tab = await chrome.tabs.getCurrent();
      await chrome.tabs.update(tab.id, { url: "chrome://newtab/" });
      return;
    }
    if (reply) {
      status.textContent = `ZeroOmega could not use Chrome profile "${name}": ${reply.error}`;
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
  }
  status.textContent = "ZeroOmega did not answer; its startup proxy is unchanged.";
}

main();
