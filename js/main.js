// main.js - 整合其他模組，處理主流程和事件監聽
import { getBvId, fetchCid, fetchPlayUrl } from './api.js';
import { replacePlayer } from './player.js';
import { observeBVChange, hijackBVLinks } from './utils.js';
import { CDNOptimizer } from './cdn.js';

// 當前播放配置
let currentQn = 80; // 預設 1080P
let currentAudioQuality = null; // 預設 null，優先最高

// 取得 fnval/codec/默認畫質 設定（async）
function getPlayerConfigFromStorage() {
    return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['bilibili-lite-fnval', 'bilibili-lite-codec', 'bilibili-lite-default-qn'], (result) => {
                resolve({
                    fnval: result['bilibili-lite-fnval'] !== undefined ? parseInt(result['bilibili-lite-fnval']) : 16,
                    codec: result['bilibili-lite-codec'] || '',
                    defaultQn: result['bilibili-lite-default-qn'] !== undefined ? parseInt(result['bilibili-lite-default-qn']) : 80
                });
            });
        } else {
            // fallback for local dev
            resolve({
                fnval: parseInt(localStorage.getItem('bilibili-lite-fnval') || '16'),
                codec: localStorage.getItem('bilibili-lite-codec') || '',
                defaultQn: parseInt(localStorage.getItem('bilibili-lite-default-qn') || '80')
            });
        }
    });
}

// 封裝 main 為可重複調用
async function mainReload(qn = null, audioQuality = currentAudioQuality, userFnval = null, userCodec = null) {
    console.log('[LitePlayer] mainReload 開始執行, 畫質:', qn, '音質:', audioQuality, 'fnval:', userFnval, 'codec:', userCodec);
    try {
        const bvid = getBvId();
        if (!bvid) return;
        const cid = await fetchCid(bvid);
        if (!cid) return;
        // 讀取 fnval/codec/默認畫質
        let fnval = userFnval;
        let codec = userCodec;
        let defaultQn = 80;
        if (fnval === null || codec === null || qn === null) {
            const config = await getPlayerConfigFromStorage();
            if (fnval === null) fnval = config.fnval;
            if (codec === null) codec = config.codec;
            if (qn === null) qn = config.defaultQn;
        }
        const playInfo = await fetchPlayUrl(bvid, cid, qn, audioQuality, fnval, codec);
        if (playInfo) {
            currentQn = playInfo.qn;
            currentAudioQuality = playInfo.audioQuality;
            console.log('[LitePlayer] 準備替換播放器');
            
            // 檢查是否是畫質/音質切換（已存在播放器的情況）
            const existingPlayer = document.getElementById('bilibili-lite-player');
            if (existingPlayer) {
                console.log('[LitePlayer] 檢測到現有播放器，進行無縫切換');
                // 保存播放狀態
                const videoElement = existingPlayer.querySelector('video');
                let currentTime = 0;
                let paused = true;
                let volume = 1;
                
                if (videoElement) {
                    currentTime = videoElement.currentTime;
                    paused = videoElement.paused;
                    volume = videoElement.volume;
                    console.log('[LitePlayer] 保存播放狀態 - 時間:', currentTime, '暫停:', paused, '音量:', volume);
                }
                
                // 替換播放器
                replacePlayer(playInfo, mainReload);
                
                // 恢復播放狀態
                setTimeout(() => {
                    const newVideoElement = document.getElementById('bilibili-lite-player')?.querySelector('video');
                    if (newVideoElement) {
                        newVideoElement.currentTime = currentTime;
                        newVideoElement.volume = volume;
                        if (!paused) {
                            newVideoElement.play().catch(e => console.warn('[LitePlayer] 自動播放失敗:', e));
                        }
                        console.log('[LitePlayer] 恢復播放狀態完成');
                    }
                }, 500);
            } else {
                // 首次創建播放器
                replacePlayer(playInfo, mainReload);
            }
        } else {
            console.warn('[LitePlayer] 未獲取到視頻URL');
        }
    } catch (error) {
        console.error('[LitePlayer] mainReload 執行失敗:', error);
        
        // 隱藏載入動畫
        const loading = document.getElementById('bilibili-lite-loading');
        if (loading) {
            loading.style.display = 'none';
        }
        
        // 重新啟用控制器
        const qnSelect = document.querySelector('#bilibili-lite-controlbar select');
        if (qnSelect) {
            qnSelect.disabled = false;
        }
    }
}

// 初始化函數
function init() {
    console.log('[LitePlayer] 初始化函數開始執行');
    
    // 等待頁面完全加載
    if (document.readyState === 'loading') {
        console.log('[LitePlayer] 等待頁面加載完成');
        document.addEventListener('DOMContentLoaded', () => {
            console.log('[LitePlayer] 頁面加載完成，開始初始化');
            setTimeout(() => mainReload(), 1000); // 延遲 1 秒確保頁面元素完全載入
        });
    } else {
        console.log('[LitePlayer] 頁面已加載，立即執行');
        setTimeout(() => mainReload(), 1000);
    }
      // 設置路徑變更監聽
    observeBVChange(() => {
        console.log('[LitePlayer] 檢測到 BV 變化，重新加載播放器');
        setTimeout(() => mainReload(), 1000);
    });
    
    // 設置 BV 鏈接劫持
    hijackBVLinks();
    
    // 將 mainReload 暴露到全局範圍，供 CDN 切換使用
    window.mainReload = mainReload;
    
    // 監聽 chrome.storage 設定變更，自動 reload 播放器
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && ('bilibili-lite-fnval' in changes || 'bilibili-lite-codec' in changes)) {
                // 自動刷新播放器
                if (typeof window.mainReload === 'function') {
                    window.mainReload();
                } else {
                    location.reload();
                }
            }
        });
    }
    
    console.log('[LitePlayer] 初始化完成');
}

export { init };
