console.log('popup.js loaded, chrome:', typeof chrome, chrome && chrome.storage, chrome && chrome.storage && chrome.storage.local);
if (typeof chrome !== 'undefined') {
  console.log('chrome.runtime.id:', chrome.runtime && chrome.runtime.id);
}
