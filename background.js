// background.js - 배지 업데이트 처리

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'UPDATE_BADGE') {
    const count = msg.count;
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#03C75A' });
  }
});

// 초기 배지 설정
chrome.storage.local.get({ vocabList: [] }, ({ vocabList }) => {
  const count = vocabList.length;
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#03C75A' });
});
