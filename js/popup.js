// popup.js - for popup.html
const fnvalOptions = [
  { value: 16, text: 'DASH' },
  { value: 64, text: 'HDR' },
  { value: 128, text: '4K' },
  { value: 256, text: '杜比音頻' },
  { value: 512, text: '杜比視界' },
  { value: 1024, text: '8K' },
  { value: 2048, text: 'AV1' }
];
const qnOptions = [
  { value: 127, text: '8K' },
  { value: 126, text: '杜比視界' },
  { value: 125, text: 'HDR' },
  { value: 120, text: '4K' },
  { value: 116, text: '1080P60' },
  { value: 112, text: '1080P高碼率' },
  { value: 80, text: '1080P' },
  { value: 64, text: '720P' },
  { value: 32, text: '480P' },
  { value: 16, text: '360P' }
];

const fnvalGroup = document.getElementById('fnval-group');
const codecSelect = document.getElementById('codec-select');
const statusDiv = document.getElementById('status');

const qnRow = document.createElement('div');
qnRow.style.marginBottom = '12px';
qnRow.innerHTML = '<div>默認畫質：</div>';
const qnSelect = document.createElement('select');
qnSelect.id = 'qn-select';
qnOptions.forEach(opt => {
  const option = document.createElement('option');
  option.value = opt.value;
  option.textContent = opt.text;
  qnSelect.appendChild(option);
});
qnRow.appendChild(qnSelect);

// 插入到 fnvalGroup 前面
const section = document.querySelector('.section');
if (section) section.insertBefore(qnRow, section.firstChild);

if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
  // 讀取設定
  chrome.storage.local.get(['bilibili-lite-fnval', 'bilibili-lite-codec', 'bilibili-lite-default-qn'], (result) => {
    let savedFnval = parseInt(result['bilibili-lite-fnval'] || '16');
    fnvalOptions.forEach(opt => {
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = opt.value;
      if ((savedFnval & opt.value) === opt.value) cb.checked = true;
      label.appendChild(cb);
      label.appendChild(document.createTextNode(opt.text));
      fnvalGroup.appendChild(label);
    });
    codecSelect.value = result['bilibili-lite-codec'] || '';
    qnSelect.value = result['bilibili-lite-default-qn'] || '80';
  });

  // 保存
  const saveBtn = document.getElementById('save-btn');
  saveBtn.onclick = function() {
    let fnval = 0;
    fnvalGroup.querySelectorAll('input[type=checkbox]').forEach(cb => {
      if (cb.checked) fnval |= parseInt(cb.value);
    });
    chrome.storage.local.set({
      'bilibili-lite-fnval': fnval,
      'bilibili-lite-codec': codecSelect.value,
      'bilibili-lite-default-qn': qnSelect.value
    }, () => {
      statusDiv.textContent = '已保存，刷新播放器頁面生效';
      setTimeout(()=>{statusDiv.textContent='';}, 2000);
    });
  };
} else {
  // 非擴充環境，顯示提示
  if (statusDiv) statusDiv.textContent = '請從 Chrome 擴充彈窗開啟本頁';
  if (fnvalGroup) fnvalGroup.innerHTML = '';
  if (codecSelect) codecSelect.disabled = true;
  const saveBtn = document.getElementById('save-btn');
  if (saveBtn) saveBtn.disabled = true;
}
