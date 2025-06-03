// filepath: d:\code\bilibili-player\js\player.js
// player.js - 處理播放器的實現和相關功能
import {cdnOptimizer } from './api.js';
import { StreamMonitor, formatBytes, formatBitrate } from './utils.js';
// 只導入需要的基本 UI 函數，其他函數將透過動態導入使用
import { createPlayerElements, showCDNSwitchingIndicator, showPlayerError } from './player-ui.js';

let streamMonitor = null;
let playbackOptimizer = null;

// 全局變量存儲播放器事件監聽器引用，用於內存洩漏防護
let playerEventHandlers = {
    video: new Map(),
    audio: new Map(),
    syncHandlers: []
};

/**
 * 清理播放器事件監聽器，防止內存洩漏
 */
function cleanupPlayerEventListeners() {
    const existingPlayer = document.getElementById('bilibili-lite-player');
    if (existingPlayer) {
        const video = existingPlayer.querySelector('video');
        const audio = existingPlayer.querySelector('audio');

        // 清理視頻事件監聽器
        if (video && playerEventHandlers.video.size > 0) {
            playerEventHandlers.video.forEach((handler, event) => {
                video.removeEventListener(event, handler);
            });
            console.log(`[LitePlayer] 已清理 ${playerEventHandlers.video.size} 個視頻事件監聽器`);
        }

        // 清理音頻事件監聽器
        if (audio && playerEventHandlers.audio.size > 0) {
            playerEventHandlers.audio.forEach((handler, event) => {
                audio.removeEventListener(event, handler);
            });
            console.log(`[LitePlayer] 已清理 ${playerEventHandlers.audio.size} 個音頻事件監聽器`);
        }

        // 清理同步處理器
        if (playerEventHandlers.syncHandlers.length > 0) {
            console.log(`[LitePlayer] 清理了 ${playerEventHandlers.syncHandlers.length} 個同步處理器引用`);
        }
    }

    // 重置監聽器引用
    playerEventHandlers = {
        video: new Map(),
        audio: new Map(),
        syncHandlers: []
    };
}

/**
 * 添加事件監聽器並記錄引用
 * @param {HTMLElement} element - 目標元素
 * @param {string} event - 事件名稱
 * @param {Function} handler - 事件處理器
 * @param {string} type - 元素類型 ('video' 或 'audio')
 */
function addTrackedEventListener(element, event, handler, type) {
    element.addEventListener(event, handler);
    if (type === 'video' || type === 'audio') {
        playerEventHandlers[type].set(event, handler);
    }
}

/**
 * CDN 切換後重新加載播放器
 * @param {string} oldCDN - 舊的 CDN 節點
 * @param {string} newCDN - 新的 CDN 節點  
 */
async function reloadPlayerWithNewCDN(oldCDN, newCDN) {
    console.log(`[CDN] 開始重新加載播放器: ${oldCDN} -> ${newCDN}`);

    try {
        // 獲取當前播放器元素
        const currentPlayer = document.getElementById('bilibili-lite-player');
        if (!currentPlayer) {
            console.warn('[CDN] 未找到當前播放器，無法重新加載');
            return;
        }

        // 使用UI模組顯示加載提示
        const loadingDiv = showCDNSwitchingIndicator(currentPlayer, newCDN);
        // 調用 mainReload，讓它處理狀態保存和恢復
        if (typeof window.mainReload === 'function') {
            // 等待短暫延遲以顯示加載提示
            await new Promise(resolve => setTimeout(resolve, 300));

            // 清理現有事件監聽器防止內存洩漏
            cleanupPlayerEventListeners();

            // 重新加載播放器（不傳參數，使用當前畫質設置）
            await window.mainReload();

            console.log(`[CDN] 播放器重新加載完成: ${oldCDN} -> ${newCDN}`);

            // 移除加載提示（延遲移除以確保新播放器已就緒）
            setTimeout(() => {
                const loadingElement = document.querySelector('#bilibili-lite-player div[style*="position: absolute"]');
                if (loadingElement) {
                    loadingElement.remove();
                }
            }, 1000);

        } else {
            console.warn('[CDN] mainReload 函數不可用，無法重新加載播放器');
            loadingDiv.remove();
        }

    } catch (error) {
        console.error('[CDN] 重新加載播放器失敗:', error);

        // 移除加載提示
        const loadingElement = document.querySelector('#bilibili-lite-player div[style*="position: absolute"]');
        if (loadingElement) {
            loadingElement.remove();
        }

        // 回滾 CDN 設置
        cdnOptimizer.preferredCDN = oldCDN;
        alert(`CDN 切換失敗，已回滾到 ${oldCDN.toUpperCase()}`);
    }
}

// 替換播放器，支持 dash（簡單合併，僅現代瀏覽器支持）
function replacePlayer(playInfo, mainReload) {
    console.log('[LitePlayer] replacePlayer 開始執行');

    // 清理現有事件監聽器防止內存洩漏
    cleanupPlayerEventListeners();

    // 檢查是否已存在我們的播放器
    let newPlayer = document.getElementById('bilibili-lite-player');
    let isReplace = false;

    if (!newPlayer) {
        // 首次創建 - 查找原始播放器容器
        const oldPlayer = document.querySelector('#playerWrap');

        console.log('[LitePlayer] 找到的舊播放器元素:', oldPlayer);

        if (!oldPlayer) {
            console.warn('[LitePlayer] 未找到播放器容器');
            return;
        }

        const parent = oldPlayer.parentNode;
        if (!parent) {
            console.warn('[LitePlayer] 播放器容器沒有父元素');
            return;
        }

        console.log('[LitePlayer] 移除舊播放器');
        parent.removeChild(oldPlayer);

        // 新建播放器容器 - 使用 createElement 創建基本容器但不處理內部 UI 元素
        newPlayer = document.createElement('div');
        newPlayer.id = 'bilibili-lite-player';
        newPlayer.style.width = '100%';
        newPlayer.style.height = '100%';
        newPlayer.style.position = 'relative';
        newPlayer.style.backgroundColor = '#000';
        parent.appendChild(newPlayer);

        const viewboxReport = document.getElementById('viewbox_report');
        if (viewboxReport && viewboxReport.parentNode) {
            viewboxReport.parentNode.insertBefore(newPlayer, viewboxReport.nextSibling);
        }
        else {
            console.warn('[LitePlayer] 未找到 viewbox_report，無法插入播放器');
            return;
        }

        console.log('[LitePlayer] 創建新播放器容器完成');
    } else {
        // 畫質切換 - 記錄這是替換操作
        console.log('[LitePlayer] 畫質切換 - 準備更新播放器內容');
        isReplace = true;
    }

    if (playInfo.dash) {
        // 雙流同步播放方案 - 使用 player-ui.js 提供的 createPlayerElements 函數
        const playerElements = createPlayerElements(playInfo, newPlayer);
        const video = playerElements.video;
        const audio = playerElements.audio;
        const loading = playerElements.loading;




        //當視頻播放時，觸發音頻的播放，確保音頻和視頻同步開始。
        const playHandler = () => { audio.play(); };
        // 當視頻暫停時，觸發音頻的暫停
        const pauseHandler = () => { audio.pause(); };
        // 當視頻進度條拖動時，同步音頻的當前時間
        const seekingHandler = () => { audio.currentTime = video.currentTime; };
        // 當視頻倍速改變時，同步音頻的播放速率
        const rateChangeHandler = () => { audio.playbackRate = video.playbackRate; };
        
        // 同步音頻和視頻的播放狀態
        function syncAudio() {
            const diff = video.currentTime - audio.currentTime;
            if (Math.abs(diff) > 0.2) {
                if (!video.paused && !audio.seeking && !video.seeking) {
                    audio.currentTime = video.currentTime;
                    if (audio.paused) audio.play();
                }
            }
            if (audio.playbackRate !== video.playbackRate) audio.playbackRate = video.playbackRate;
            if (audio.volume !== video.volume) audio.volume = video.volume;
            if (audio.muted !== video.muted) audio.muted = video.muted;
        }
        
        // 添加事件監聽器
        video.addEventListener('play', playHandler);
        video.addEventListener('pause', pauseHandler);
        video.addEventListener('seeking', seekingHandler);
        video.addEventListener('ratechange', rateChangeHandler);
        video.addEventListener('timeupdate', syncAudio);
        // loading 檢查
        function setLoading(show) {
            loading.style.display = show ? 'flex' : 'none';
        }

        function checkBuffering() {
            const videoBufferedTime = video.buffered.length > 0
                ? video.buffered.end(video.buffered.length - 1) - video.currentTime
                : 0;
            const audioBufferedTime = audio.buffered.length > 0
                ? audio.buffered.end(audio.buffered.length - 1) - audio.currentTime
                : 0;
            //else {
            //    setLoading(false);
            // 移除自動恢復播放邏輯，讓用戶自行點擊播放按鈕
            //    console.log('[LitePlayer] Buffer is ready. User can resume playback manually.', {
            //        videoBufferedTime,
            //        audioBufferedTime,
            //        videoReadyState: video.readyState,
            //        audioReadyState: audio.readyState
            //    });
            //}
        }

        // 使用跟蹤式事件監聽器，防止內存洩漏
        addTrackedEventListener(video, 'waiting', checkBuffering, 'video');
        addTrackedEventListener(audio, 'waiting', checkBuffering, 'audio');
        addTrackedEventListener(video, 'seeking', checkBuffering, 'video');
        addTrackedEventListener(audio, 'seeking', checkBuffering, 'audio');
        addTrackedEventListener(video, 'playing', checkBuffering, 'video');
        addTrackedEventListener(audio, 'playing', checkBuffering, 'audio');
        addTrackedEventListener(video, 'canplay', checkBuffering, 'video');
        addTrackedEventListener(audio, 'canplay', checkBuffering, 'audio');
        addTrackedEventListener(video, 'canplaythrough', checkBuffering, 'video');
        addTrackedEventListener(audio, 'canplaythrough', checkBuffering, 'audio');

        // 保存緩衝處理器引用
        playerEventHandlers.syncHandlers.push(setLoading, checkBuffering);

        // 初始檢查
        setTimeout(checkBuffering, 100);

        // 插入
        newPlayer.appendChild(video);
        newPlayer.appendChild(audio);

        // 啟動流監控
        if (streamMonitor) {
            streamMonitor.stopMonitoring();
        }
        streamMonitor = new StreamMonitor();
        streamMonitor.startMonitoring(video, audio);

        // 啟動播放優化器

        // 首先創建控制欄結構
        const arcToolbar = document.getElementById('arc_toolbar_report');
        // 查找控制欄的容器，優先使用 arc_toolbar_report，若不存在則使用播放器的父元素
        const controlContainer = arcToolbar || newPlayer.parentElement;

        if (controlContainer) {
            // 動態創建控制欄結構
            import('./player-ui.js').then(UI => {
                const controlBar = UI.createControlBarStructure(newPlayer); // 將控制欄結構插入到播放器容器中

                // 使用獨立的UI模組創建控制區
                UI.createControlBar(playInfo, mainReload, streamMonitor);

                // 使用獨立的UI模組創建流信息面板
                UI.createStreamInfoPanel(controlBar, playInfo, streamMonitor);
            });
        } else {
            console.warn('[LitePlayer] 無法找到控制欄容器');
        }
        // 如果有预加载器，则创建控制面板
        if (window.preloader) {
            import('./player-ui.js').then(UI => {
                const controlBar = document.getElementById('bilibili-lite-controlbar');
                if (controlBar) {
                    UI.createPreloadControlPanel(controlBar, window.preloader);
                }
            });
        }

        console.log('[LitePlayer] 已插入雙流同步播放器', {
            videoSrc: video.src,
            audioSrc: audio.src
        });
    }

    // 播放器創建完成後的清理工作
    setTimeout(() => {
        // 隱藏載入動畫
        const loading = document.getElementById('bilibili-lite-loading');
        if (loading) {
            loading.style.display = 'none';
        }

        // 重新啟用所有控制器
        const selects = document.querySelectorAll('#bilibili-lite-controlbar select');
        selects.forEach(select => {
            select.disabled = false;
        });
        console.log('[LitePlayer] 播放器初始化完成，控制器已啟用');
    }, 1000);
}

// 界面相關函數已移至 player-ui.js 模組
// 包括 createControlBar, createStreamInfoPanel, createPreloadControlPanel 和 createPlayerElements

export { replacePlayer, reloadPlayerWithNewCDN };
