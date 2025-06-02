// player.js - 處理播放器的實現和相關功能
import { qualityMap, audioQualityMap, cdnOptimizer } from './api.js';
import { StreamMonitor, extractCDNInfo, formatBytes, formatBitrate } from './utils.js';

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
        
        // 顯示加載提示
        const loadingDiv = document.createElement('div');
        loadingDiv.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 10px 20px;
            border-radius: 4px;
            z-index: 1000;
            font-size: 14px;
        `;
        loadingDiv.textContent = `正在切換到 ${newCDN.toUpperCase()} CDN...`;
        currentPlayer.appendChild(loadingDiv);
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
        const oldPlayer = document.getElementById('bilibili-player') || 
                         document.querySelector('.bpx-player-container') ||
                         document.querySelector('.player-wrap') ||
                         document.querySelector('#playerWrap');
        
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
        
        // 新建播放器容器
        newPlayer = document.createElement('div');
        newPlayer.id = 'bilibili-lite-player';
        newPlayer.style.width = '100%';
        newPlayer.style.height = '100%';
        newPlayer.style.position = 'relative';
        newPlayer.style.backgroundColor = '#000';
        parent.appendChild(newPlayer);
        
        console.log('[LitePlayer] 創建新播放器容器完成');
    } else {
        // 畫質切換 - 清空現有內容但保留容器
        console.log('[LitePlayer] 畫質切換 - 清空現有播放器內容');
        isReplace = true;
        
        // 保存當前播放狀態已在 mainReload 中處理
        
        // 清空內容但保留容器
        while (newPlayer.firstChild) {
            newPlayer.removeChild(newPlayer.firstChild);
        }
    }
    
    console.log('[LitePlayer] 創建新播放器容器完成');
    if (playInfo.dash) {
        // 雙流同步播放方案
        const dash = playInfo.rawDash;
        const videoUrl = dash.video[0]?.baseUrl || dash.video[0]?.base_url;
        const audioUrl = dash.audio[0]?.baseUrl || dash.audio[0]?.base_url;        // video
        const video = document.createElement('video');
        video.src = videoUrl;
        video.controls = true;
        video.style.width = '100%';
        video.style.height = '100%';
        video.autoplay = true;
        video.preload = 'auto';
        // 播放優化設置
        video.crossOrigin = 'anonymous';
        video.playsInline = true;
        // 提高緩衝區設置
        video.setAttribute('webkit-playsinline', '');
        video.setAttribute('x5-video-player-type', 'h5');
        video.setAttribute('x5-video-player-fullscreen', 'true');
        
        // 添加錯誤處理
        video.onerror = (e) => {
            console.error('[LitePlayer] 視頻加載失敗:', e);
            // 顯示錯誤信息
            const errorDiv = document.createElement('div');
            errorDiv.style.position = 'absolute';
            errorDiv.style.top = '50%';
            errorDiv.style.left = '50%';
            errorDiv.style.transform = 'translate(-50%, -50%)';
            errorDiv.style.color = 'white';
            errorDiv.style.background = 'rgba(0,0,0,0.8)';
            errorDiv.style.padding = '20px';
            errorDiv.style.borderRadius = '8px';
            errorDiv.innerHTML = '視頻加載失敗，請嘗試刷新頁面或切換畫質';
            newPlayer.appendChild(errorDiv);
        };
          // audio
        const audio = document.createElement('audio');
        audio.src = audioUrl;
        audio.preload = 'auto';
        audio.style.display = 'none';
        // 播放優化設置
        audio.crossOrigin = 'anonymous';
        
        // 添加音頻錯誤處理
        audio.onerror = (e) => {
            console.error('[LitePlayer] 音頻加載失敗:', e);
        };
        // 加載動畫元素
        const loading = document.createElement('div');
        loading.id = 'bilibili-lite-loading';
        loading.style.position = 'absolute';
        loading.style.left = '0';
        loading.style.top = '0';
        loading.style.width = '100%';
        loading.style.height = '100%';
        loading.style.display = 'none';
        loading.style.justifyContent = 'center';
        loading.style.alignItems = 'center';
        loading.style.background = 'rgba(0,0,0,0.3)';
        loading.innerHTML = `<div style="width:48px;height:48px;border:6px solid #fff;border-top:6px solid #00a1d6;border-radius:50%;animation:spin 1s linear infinite;"></div>`;
        newPlayer.appendChild(loading);
        // 加入動畫樣式
        const style = document.createElement('style');
        style.innerHTML = `@keyframes spin{0%{transform:rotate(0deg);}100%{transform:rotate(360deg);}}`;
        document.head.appendChild(style);        // 控制同步
        function syncAudio() {
            if (Math.abs(video.currentTime - audio.currentTime) > 0.1) {
                audio.currentTime = video.currentTime;
            }
        }
        
        // 使用跟蹤式事件監聽器添加，防止內存洩漏
        const playHandler = () => { audio.play(); };
        const pauseHandler = () => { audio.pause(); };
        const seekingHandler = () => { audio.currentTime = video.currentTime; };
        const rateChangeHandler = () => { audio.playbackRate = video.playbackRate; };
        const volumeChangeHandler = () => { audio.volume = video.volume; audio.muted = video.muted; };
        
        addTrackedEventListener(video, 'play', playHandler, 'video');
        addTrackedEventListener(video, 'pause', pauseHandler, 'video');
        addTrackedEventListener(video, 'seeking', seekingHandler, 'video');
        addTrackedEventListener(video, 'ratechange', rateChangeHandler, 'video');
        addTrackedEventListener(video, 'volumechange', volumeChangeHandler, 'video');
        addTrackedEventListener(video, 'timeupdate', syncAudio, 'video');
        
        // 保存同步處理器引用以便清理
        playerEventHandlers.syncHandlers.push(syncAudio, playHandler, pauseHandler, seekingHandler, rateChangeHandler, volumeChangeHandler);        // loading 檢查
        function setLoading(show) {
            loading.style.display = show ? 'flex' : 'none';
        }
        function checkBuffering() {
            // video/audio 只要有一個在等待就顯示動畫
            if (video.readyState < 3 || audio.readyState < 3 || video.seeking || audio.seeking) {
                setLoading(true);
                video.pause();
                audio.pause();
            } else {
                setLoading(false);
                if (!video.paused) audio.play();
                if (!audio.paused) video.play();
            }
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
        streamMonitor.startMonitoring(video, audio);        // 啟動播放優化器
          // 創建控制區
        createControlBar(playInfo, mainReload, streamMonitor);
        console.log('[LitePlayer] 已插入雙流同步播放器', { videoUrl, audioUrl });} else {        // 普通 durl
        const video = document.createElement('video');
        video.src = playInfo.videoUrl;
        video.controls = true;
        video.style.width = '100%';
        video.style.height = '100%';
        video.autoplay = true;
        // 播放優化設置
        video.preload = 'auto';
        video.crossOrigin = 'anonymous';
        video.playsInline = true;
        video.setAttribute('webkit-playsinline', '');
        video.setAttribute('x5-video-player-type', 'h5');
        video.setAttribute('x5-video-player-fullscreen', 'true');
        newPlayer.appendChild(video);
          // 啟動流監控（單流）
        if (streamMonitor) {
            streamMonitor.stopMonitoring();
        }
        streamMonitor = new StreamMonitor();
        streamMonitor.startMonitoring(video, null);        // 啟動播放優化器（僅視頻）
        if (playbackOptimizer) {
            playbackOptimizer.stop();
        }
        playbackOptimizer = new PlaybackOptimizer();        playbackOptimizer.initialize(video, null);
        
        // 創建控制區
        createControlBar(playInfo, mainReload, streamMonitor);
        console.log('[LitePlayer] 已插入自製播放器, 視頻URL:', playInfo.videoUrl);
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

// 創建控制欄
function createControlBar(playInfo, mainReload, monitor = null) {
    // 查找 arc_toolbar_report
    const arcToolbar = document.getElementById('arc_toolbar_report');
    const newPlayer = document.getElementById('bilibili-lite-player');
    if (arcToolbar && newPlayer && newPlayer.parentNode) {
        // 移除舊的控制欄（如果存在）
        const oldControlBar = document.getElementById('bilibili-lite-controlbar');
        if (oldControlBar) {
            oldControlBar.parentNode.removeChild(oldControlBar);
        }

        // 創建控制區
        const controlBar = document.createElement('div');
        controlBar.id = 'bilibili-lite-controlbar';
        // 複用 arc_toolbar_report 樣式
        controlBar.className = arcToolbar.className;
        controlBar.style.marginTop = '16px';
        controlBar.style.marginBottom = '16px';
        controlBar.style.display = 'flex';
        controlBar.style.flexDirection = 'column';
        controlBar.style.gap = '12px';
        
        // 第一行：畫質和音質控制
        const controlRow = document.createElement('div');
        controlRow.style.display = 'flex';
        controlRow.style.alignItems = 'center';
        controlRow.style.gap = '24px';
        
        // 畫質切換（下拉選擇器）
        const qnGroup = document.createElement('div');
        qnGroup.style.display = 'flex';
        qnGroup.style.alignItems = 'center';
        qnGroup.innerHTML = '<span style="color:#888;margin-right:8px;">畫質</span>';
        const qnSelect = document.createElement('select');
        qnSelect.style.marginRight = '8px';
        qnSelect.style.padding = '4px 8px';
        qnSelect.style.borderRadius = '4px';
        qnSelect.style.border = '1px solid #ccc';
        (playInfo.acceptQn || [playInfo.qn]).forEach(qn => {
            const opt = document.createElement('option');
            opt.value = qn;
            let displayText = qualityMap[qn] || qn;
            if (qn >= 100 && qn <= 127) {
                displayText += ' (大會員)';
            } else if (qn === 74) {
                displayText += ' (登錄)';
            }
            opt.textContent = displayText;
            if (qn === playInfo.qn) opt.selected = true;
            qnSelect.appendChild(opt);
        });
        // 僅聲音模式
        const audioOnlyOpt = document.createElement('option');
        audioOnlyOpt.value = 0;
        audioOnlyOpt.textContent = '僅播放聲音';
        if (playInfo.qn === 0) audioOnlyOpt.selected = true;
        qnSelect.appendChild(audioOnlyOpt);
        // 畫質切換事件處理
        qnSelect.onchange = async (e) => {
            const val = parseInt(e.target.value);
            // 取得當前 fnval/codec
            const fnval = parseInt(localStorage.getItem('bilibili-lite-fnval') || '16');
            const codec = localStorage.getItem('bilibili-lite-codec') || '';
            localStorage.setItem('bilibili-lite-fnval', fnval);
            localStorage.setItem('bilibili-lite-codec', codec);
            console.log('[LitePlayer] 畫質切換到:', val, 'fnval:', fnval, 'codec:', codec);
            setTimeout(() => {
                mainReload(val, playInfo.audioQuality, fnval, codec);
            }, 300);
        };
        // 顯示 fnval/codec 狀態
        function showFnvalCodecStatus(statusDiv) {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get(['bilibili-lite-fnval', 'bilibili-lite-codec'], (result) => {
                    const fnval = result['bilibili-lite-fnval'] !== undefined ? parseInt(result['bilibili-lite-fnval']) : 16;
                    const codec = result['bilibili-lite-codec'] || '';
                    let fnvalText = [];
                    if (fnval & 16) fnvalText.push('DASH');
                    if (fnval & 64) fnvalText.push('HDR');
                    if (fnval & 128) fnvalText.push('4K');
                    if (fnval & 256) fnvalText.push('杜比音頻');
                    if (fnval & 512) fnvalText.push('杜比視界');
                    if (fnval & 1024) fnvalText.push('8K');
                    if (fnval & 2048) fnvalText.push('AV1');
                    statusDiv.textContent = `格式: ${fnvalText.join('+') || 'DASH'}，編碼: ${codec || '自動'}（請點插件圖標設定）`;
                });
            } else {
                // fallback
                const fnval = parseInt(localStorage.getItem('bilibili-lite-fnval') || '16');
                const codec = localStorage.getItem('bilibili-lite-codec') || '';
                let fnvalText = [];
                if (fnval & 16) fnvalText.push('DASH');
                if (fnval & 64) fnvalText.push('HDR');
                if (fnval & 128) fnvalText.push('4K');
                if (fnval & 256) fnvalText.push('杜比音頻');
                if (fnval & 512) fnvalText.push('杜比視界');
                if (fnval & 1024) fnvalText.push('8K');
                if (fnval & 2048) fnvalText.push('AV1');
                statusDiv.textContent = `格式: ${fnvalText.join('+') || 'DASH'}，編碼: ${codec || '自動'}（請點插件圖標設定）`;
            }
        }
        const statusDiv = document.createElement('div');
        statusDiv.style.fontSize = '12px';
        statusDiv.style.color = '#888';
        statusDiv.style.marginLeft = '12px';
        showFnvalCodecStatus(statusDiv);
        qnGroup.appendChild(qnSelect);
        qnGroup.appendChild(statusDiv);
        controlRow.appendChild(qnGroup);
        
        // 音質切換（下拉選擇器）
        if (playInfo.acceptAudio && playInfo.acceptAudio.length > 1) {
            const audioGroup = document.createElement('div');
            audioGroup.style.display = 'flex';
            audioGroup.style.alignItems = 'center';
            audioGroup.style.marginLeft = '24px';
            audioGroup.innerHTML = '<span style="color:#888;margin-right:8px;">音質</span>';            const audioSelect = document.createElement('select');
            audioSelect.style.padding = '4px 8px';
            audioSelect.style.borderRadius = '4px';
            audioSelect.style.border = '1px solid #ccc';
            
            playInfo.acceptAudio.forEach(aq => {
                const opt = document.createElement('option');
                opt.value = aq;
                opt.textContent = audioQualityMap[aq] || aq;
                if (aq === playInfo.audioQuality) opt.selected = true;
                audioSelect.appendChild(opt);
            });
            
            // 音質切換事件處理
            audioSelect.onchange = async (e) => {
                const val = parseInt(e.target.value);
                console.log('[LitePlayer] 音質切換到:', val);
                
                // 顯示載入中狀態
                const loading = document.getElementById('bilibili-lite-loading');
                if (loading) {
                    loading.style.display = 'flex';
                }
                
                // 禁用選擇器防止重複點擊
                audioSelect.disabled = true;
                  try {
                    // 延遲執行以避免同步問題，與 CDN 切換保持一致
                    setTimeout(() => {
                        mainReload(playInfo.qn, val);
                    }, 300);
                } catch (error) {
                    console.error('[LitePlayer] 音質切換失敗:', error);
                    // 恢復選擇器
                    audioSelect.disabled = false;
                    if (loading) {
                        loading.style.display = 'none';
                    }
                }            };
            audioGroup.appendChild(audioSelect);
            controlRow.appendChild(audioGroup);
            
            // 防止選擇器點擊時冒泡導致失焦
            audioSelect.addEventListener('mousedown', e => e.stopPropagation());
            audioSelect.addEventListener('click', e => e.stopPropagation());
        }
        // 防止選擇器點擊時冒泡導致失焦
        qnSelect.addEventListener('mousedown', e => e.stopPropagation());
        qnSelect.addEventListener('click', e => e.stopPropagation());
          // 將控制行添加到控制欄
        controlBar.appendChild(controlRow);
        
        // 創建流信息顯示區域
        createStreamInfoPanel(controlBar, playInfo, monitor);
        
        // 插入到 arc_toolbar_report 之後、播放器之前
        if (arcToolbar.nextSibling) {
            arcToolbar.parentNode.insertBefore(controlBar, arcToolbar.nextSibling);
        } else {
            arcToolbar.parentNode.appendChild(controlBar);
        }
    }
}

// 創建流信息顯示面板
function createStreamInfoPanel(controlBar, playInfo, monitor) {
    // 創建可摺疊的流信息面板
    const infoPanel = document.createElement('div');
    infoPanel.id = 'bilibili-lite-stream-info';
    infoPanel.style.marginTop = '12px';
    infoPanel.style.border = '1px solid #e3e5e7';
    infoPanel.style.borderRadius = '6px';
    infoPanel.style.backgroundColor = '#f8f9fa';
    infoPanel.style.overflow = 'hidden';
    
    // 創建標題欄（可點擊摺疊/展開）
    const headerBar = document.createElement('div');
    headerBar.style.padding = '8px 12px';
    headerBar.style.backgroundColor = '#e8e9ea';
    headerBar.style.cursor = 'pointer';
    headerBar.style.display = 'flex';
    headerBar.style.alignItems = 'center';
    headerBar.style.justifyContent = 'space-between';
    headerBar.style.userSelect = 'none';
    
    const titleText = document.createElement('span');
    titleText.textContent = '流信息詳情';
    titleText.style.fontWeight = 'bold';
    titleText.style.color = '#333';
    
    const toggleIcon = document.createElement('span');
    toggleIcon.textContent = '▼';
    toggleIcon.style.transition = 'transform 0.2s';
    toggleIcon.style.color = '#666';
    
    headerBar.appendChild(titleText);
    headerBar.appendChild(toggleIcon);
    
    // 創建內容區域
    const contentArea = document.createElement('div');
    contentArea.style.padding = '12px';
    contentArea.style.display = 'block';
    contentArea.style.transition = 'all 0.3s ease';
    
    // 創建兩欄布局
    const infoGrid = document.createElement('div');
    infoGrid.style.display = 'grid';
    infoGrid.style.gridTemplateColumns = '1fr 1fr';
    infoGrid.style.gap = '16px';
    
    // 視頻流信息
    const videoInfoColumn = document.createElement('div');
    videoInfoColumn.style.padding = '12px';
    videoInfoColumn.style.backgroundColor = '#fff';
    videoInfoColumn.style.borderRadius = '4px';
    videoInfoColumn.style.border = '1px solid #e1e3e6';
    
    const videoTitle = document.createElement('h4');
    videoTitle.textContent = '視頻流信息';
    videoTitle.style.margin = '0 0 12px 0';
    videoTitle.style.color = '#1890ff';
    videoTitle.style.fontSize = '14px';
    videoTitle.style.fontWeight = 'bold';
    
    const videoDetails = document.createElement('div');
    videoDetails.style.fontSize = '12px';
    videoDetails.style.lineHeight = '1.6';
    
    // 音頻流信息
    const audioInfoColumn = document.createElement('div');
    audioInfoColumn.style.padding = '12px';
    audioInfoColumn.style.backgroundColor = '#fff';
    audioInfoColumn.style.borderRadius = '4px';
    audioInfoColumn.style.border = '1px solid #e1e3e6';
    
    const audioTitle = document.createElement('h4');
    audioTitle.textContent = '音頻流信息';
    audioTitle.style.margin = '0 0 12px 0';
    audioTitle.style.color = '#52c41a';
    audioTitle.style.fontSize = '14px';
    audioTitle.style.fontWeight = 'bold';
    
    const audioDetails = document.createElement('div');
    audioDetails.style.fontSize = '12px';
    audioDetails.style.lineHeight = '1.6';
    
    // 下載統計信息
    const statsArea = document.createElement('div');
    statsArea.style.marginTop = '16px';
    statsArea.style.padding = '12px';
    statsArea.style.backgroundColor = '#fff';
    statsArea.style.borderRadius = '4px';
    statsArea.style.border = '1px solid #e1e3e6';
    
    const statsTitle = document.createElement('h4');
    statsTitle.textContent = '下載統計';
    statsTitle.style.margin = '0 0 12px 0';
    statsTitle.style.color = '#722ed1';
    statsTitle.style.fontSize = '14px';
    statsTitle.style.fontWeight = 'bold';
    
    const statsDetails = document.createElement('div');
    statsDetails.style.fontSize = '12px';
    statsDetails.style.lineHeight = '1.6';
    statsDetails.style.display = 'grid';
    statsDetails.style.gridTemplateColumns = '1fr 1fr';
    statsDetails.style.gap = '8px';
    
    // 填充流信息
    function updateStreamInfo() {
        // 視頻信息
        if (playInfo.videoInfo) {
            const vInfo = playInfo.videoInfo;
            const cdnInfo = extractCDNInfo(playInfo.videoUrl || '');
            
            videoDetails.innerHTML = `
                <div style="margin-bottom: 8px;"><strong>編碼格式:</strong> <span style="color: #1890ff;">${vInfo.codec || 'N/A'}</span></div>
                <div style="margin-bottom: 8px;"><strong>解析度:</strong> <span style="color: #1890ff;">${vInfo.width || 'N/A'}x${vInfo.height || 'N/A'}</span></div>
                <div style="margin-bottom: 8px;"><strong>幀率:</strong> <span style="color: #1890ff;">${vInfo.frameRate || 'N/A'} fps</span></div>
                <div style="margin-bottom: 8px;"><strong>碼率:</strong> <span style="color: #1890ff;">${formatBitrate(vInfo.bandwidth || 0)}</span></div>
                <div style="margin-bottom: 8px;"><strong>文件大小:</strong> <span style="color: #1890ff;">${formatBytes(vInfo.size || 0)}</span></div>
                <div style="margin-bottom: 8px;"><strong>MIME類型:</strong> <span style="color: #666; font-family: monospace; font-size: 11px;">${vInfo.mimeType || 'N/A'}</span></div>
                <div><strong>CDN節點:</strong> <span style="color: #666; font-family: monospace; font-size: 11px;">${cdnInfo || 'N/A'}</span></div>
            `;
        } else {
            videoDetails.innerHTML = '<div style="color: #999;">無詳細視頻流信息</div>';
        }
        
        // 音頻信息
        if (playInfo.audioInfo) {
            const aInfo = playInfo.audioInfo;
            const cdnInfo = extractCDNInfo(playInfo.audioUrl || '');
            
            audioDetails.innerHTML = `
                <div style="margin-bottom: 8px;"><strong>編碼格式:</strong> <span style="color: #52c41a;">${aInfo.codec || 'N/A'}</span></div>
                <div style="margin-bottom: 8px;"><strong>聲道:</strong> <span style="color: #52c41a;">${aInfo.channels || 'N/A'}</span></div>
                <div style="margin-bottom: 8px;"><strong>採樣率:</strong> <span style="color: #52c41a;">${aInfo.sampleRate || 'N/A'} Hz</span></div>
                <div style="margin-bottom: 8px;"><strong>碼率:</strong> <span style="color: #52c41a;">${formatBitrate(aInfo.bandwidth || 0)}</span></div>
                <div style="margin-bottom: 8px;"><strong>文件大小:</strong> <span style="color: #52c41a;">${formatBytes(aInfo.size || 0)}</span></div>
                <div style="margin-bottom: 8px;"><strong>MIME類型:</strong> <span style="color: #666; font-family: monospace; font-size: 11px;">${aInfo.mimeType || 'N/A'}</span></div>
                <div><strong>CDN節點:</strong> <span style="color: #666; font-family: monospace; font-size: 11px;">${cdnInfo || 'N/A'}</span></div>
            `;
        } else {
            audioDetails.innerHTML = '<div style="color: #999;">無詳細音頻流信息</div>';
        }
        
        // 下載統計（如果有監控器）
        if (monitor) {
            const updateStats = (videoStats, audioStats) => {
                statsDetails.innerHTML = `
                    <div>
                        <div style="margin-bottom: 4px;"><strong>視頻下載:</strong></div>
                        <div style="margin-bottom: 4px; color: #1890ff;">速度: ${formatBytes(videoStats.speed)}/s</div>
                        <div style="color: #1890ff;">已下載: ${formatBytes(videoStats.downloaded)}</div>
                    </div>
                    <div>
                        <div style="margin-bottom: 4px;"><strong>音頻下載:</strong></div>
                        <div style="margin-bottom: 4px; color: #52c41a;">速度: ${formatBytes(audioStats.speed)}/s</div>
                        <div style="color: #52c41a;">已下載: ${formatBytes(audioStats.downloaded)}</div>
                    </div>
                `;
            };
            
            // 設置監控器回調
            monitor.onStatsUpdate = updateStats;
            
            // 初始化顯示
            updateStats(monitor.videoStats, monitor.audioStats);
        } else {
            statsDetails.innerHTML = '<div style="color: #999;">流監控不可用</div>';
        }
    }
    
    // 摺疊/展開功能
    let isCollapsed = false;
    headerBar.addEventListener('click', () => {
        isCollapsed = !isCollapsed;
        if (isCollapsed) {
            contentArea.style.display = 'none';
            toggleIcon.style.transform = 'rotate(-90deg)';
            titleText.textContent = '流信息詳情 (已摺疊)';
        } else {
            contentArea.style.display = 'block';
            toggleIcon.style.transform = 'rotate(0deg)';
            titleText.textContent = '流信息詳情';
        }
    });
    
    // 組裝結構
    videoInfoColumn.appendChild(videoTitle);
    videoInfoColumn.appendChild(videoDetails);
    
    audioInfoColumn.appendChild(audioTitle);
    audioInfoColumn.appendChild(audioDetails);
    
    infoGrid.appendChild(videoInfoColumn);
    infoGrid.appendChild(audioInfoColumn);
      statsArea.appendChild(statsTitle);
    statsArea.appendChild(statsDetails);
    
    // CDN 控制區域
    const cdnArea = document.createElement('div');
    cdnArea.style.marginTop = '16px';
    cdnArea.style.padding = '12px';
    cdnArea.style.backgroundColor = '#fff';
    cdnArea.style.borderRadius = '4px';
    cdnArea.style.border = '1px solid #e1e3e6';
    
    const cdnTitle = document.createElement('h4');
    cdnTitle.textContent = 'CDN 優選控制';
    cdnTitle.style.margin = '0 0 12px 0';
    cdnTitle.style.color = '#fa8c16';
    cdnTitle.style.fontSize = '14px';
    cdnTitle.style.fontWeight = 'bold';
    
    const cdnControls = document.createElement('div');
    cdnControls.style.fontSize = '12px';
    
    // 當前 CDN 顯示
    const currentCdnInfo = document.createElement('div');
    currentCdnInfo.style.marginBottom = '12px';
    currentCdnInfo.style.padding = '8px';
    currentCdnInfo.style.backgroundColor = '#f6f8fa';
    currentCdnInfo.style.borderRadius = '4px';
    currentCdnInfo.innerHTML = `
        <div style="margin-bottom: 4px;"><strong>當前 CDN:</strong> <span id="current-cdn-name" style="color: #fa8c16;">${cdnOptimizer.preferredCDN}</span></div>
        <div><strong>CDN 節點:</strong> <span id="current-cdn-host" style="color: #666; font-family: monospace; font-size: 11px;">${cdnOptimizer.cdnList[cdnOptimizer.preferredCDN] || 'N/A'}</span></div>
    `;
    
    // CDN 選擇按鈕
    const cdnButtonContainer = document.createElement('div');
    cdnButtonContainer.style.display = 'flex';
    cdnButtonContainer.style.flexWrap = 'wrap';
    cdnButtonContainer.style.gap = '8px';
    cdnButtonContainer.style.marginBottom = '12px';
    
    // 為每個 CDN 創建選擇按鈕
    Object.entries(cdnOptimizer.cdnList).forEach(([cdnKey, cdnHost]) => {
        const button = document.createElement('button');
        button.textContent = cdnKey.toUpperCase();
        button.style.padding = '4px 8px';
        button.style.fontSize = '11px';
        button.style.border = '1px solid #d9d9d9';
        button.style.borderRadius = '4px';
        button.style.backgroundColor = cdnKey === cdnOptimizer.preferredCDN ? '#fa8c16' : '#fff';
        button.style.color = cdnKey === cdnOptimizer.preferredCDN ? '#fff' : '#333';
        button.style.cursor = 'pointer';
        button.style.transition = 'all 0.2s';
        
        button.addEventListener('mouseenter', () => {
            if (cdnKey !== cdnOptimizer.preferredCDN) {
                button.style.backgroundColor = '#f0f0f0';
            }
        });
        
        button.addEventListener('mouseleave', () => {
            if (cdnKey !== cdnOptimizer.preferredCDN) {
                button.style.backgroundColor = '#fff';
            }
        });
          button.addEventListener('click', async () => {
            // 切換 CDN
            const oldCDN = cdnOptimizer.preferredCDN;
            cdnOptimizer.preferredCDN = cdnKey;
            
            // 更新按鈕樣式
            cdnButtonContainer.querySelectorAll('button').forEach(btn => {
                btn.style.backgroundColor = '#fff';
                btn.style.color = '#333';
            });
            button.style.backgroundColor = '#fa8c16';
            button.style.color = '#fff';
            
            // 更新當前 CDN 信息顯示
            document.getElementById('current-cdn-name').textContent = cdnKey;
            document.getElementById('current-cdn-host').textContent = cdnHost;
            
            console.log(`[CDN] 手動切換到 ${cdnKey} CDN: ${cdnHost}`);
            
            // 重新加載播放器以應用新的 CDN
            await reloadPlayerWithNewCDN(oldCDN, cdnKey);
        });
        
        cdnButtonContainer.appendChild(button);
    });
    
    // CDN 速度測試按鈕
    const speedTestButton = document.createElement('button');
    speedTestButton.textContent = '測試 CDN 速度';
    speedTestButton.style.padding = '6px 12px';
    speedTestButton.style.fontSize = '12px';
    speedTestButton.style.border = '1px solid #1890ff';
    speedTestButton.style.borderRadius = '4px';
    speedTestButton.style.backgroundColor = '#fff';
    speedTestButton.style.color = '#1890ff';
    speedTestButton.style.cursor = 'pointer';
    speedTestButton.style.transition = 'all 0.2s';
    
    speedTestButton.addEventListener('mouseenter', () => {
        speedTestButton.style.backgroundColor = '#1890ff';
        speedTestButton.style.color = '#fff';
    });
    
    speedTestButton.addEventListener('mouseleave', () => {
        speedTestButton.style.backgroundColor = '#fff';
        speedTestButton.style.color = '#1890ff';
    });
    
    speedTestButton.addEventListener('click', async () => {
        speedTestButton.disabled = true;
        speedTestButton.textContent = '測試中...';
        speedTestButton.style.opacity = '0.6';
        
        try {
            // 使用當前視頻 URL 進行測速
            const testUrl = playInfo.originalVideoUrl || playInfo.videoUrl;
            if (testUrl && testUrl.includes('/upgcxcode/')) {
                const results = await cdnOptimizer.testCDNSpeed(testUrl);
                console.log('[CDN] 速度測試結果:', results);
                
                // 找到最快的 CDN
                let fastestCDN = null;
                let fastestTime = Infinity;
                
                Object.entries(results).forEach(([cdnKey, result]) => {
                    if (result.success && result.latency < fastestTime) {
                        fastestTime = result.latency;
                        fastestCDN = cdnKey;
                    }
                });
                  if (fastestCDN) {
                    // 保存舊的 CDN
                    const oldCDN = cdnOptimizer.preferredCDN;
                    
                    // 自動切換到最快的 CDN
                    cdnOptimizer.preferredCDN = fastestCDN;
                    
                    // 更新 UI
                    cdnButtonContainer.querySelectorAll('button').forEach((btn, index) => {
                        const cdnKeys = Object.keys(cdnOptimizer.cdnList);
                        const btnCdnKey = cdnKeys[index];
                        if (btnCdnKey === fastestCDN) {
                            btn.style.backgroundColor = '#fa8c16';
                            btn.style.color = '#fff';
                        } else {
                            btn.style.backgroundColor = '#fff';
                            btn.style.color = '#333';
                        }
                    });
                    
                    document.getElementById('current-cdn-name').textContent = fastestCDN;
                    document.getElementById('current-cdn-host').textContent = cdnOptimizer.cdnList[fastestCDN];
                    
                    // 重新加載播放器以應用新的 CDN
                    if (oldCDN !== fastestCDN) {
                        await reloadPlayerWithNewCDN(oldCDN, fastestCDN);
                        alert(`測速完成！已自動切換到最快的 CDN: ${fastestCDN.toUpperCase()} (${fastestTime}ms)，播放器已重新加載`);
                    } else {
                        alert(`測速完成！當前 CDN 已是最快的: ${fastestCDN.toUpperCase()} (${fastestTime}ms)`);
                    }
                } else {
                    alert('測速失敗，請檢查網絡連接');
                }
            } else {
                alert('當前視頻不支持 CDN 測速');
            }
        } catch (error) {
            console.error('[CDN] 速度測試失敗:', error);
            alert('CDN 速度測試出現錯誤');
        } finally {
            speedTestButton.disabled = false;
            speedTestButton.textContent = '測試 CDN 速度';
            speedTestButton.style.opacity = '1';
        }
    });
    
    cdnControls.appendChild(currentCdnInfo);
    cdnControls.appendChild(cdnButtonContainer);
    cdnControls.appendChild(speedTestButton);
    
    cdnArea.appendChild(cdnTitle);
    cdnArea.appendChild(cdnControls);
    
    contentArea.appendChild(infoGrid);
    contentArea.appendChild(statsArea);
    contentArea.appendChild(cdnArea);
    
    infoPanel.appendChild(headerBar);
    infoPanel.appendChild(contentArea);
    
    // 添加到控制欄
    controlBar.appendChild(infoPanel);
    
    // 初始更新信息
    updateStreamInfo();
    
    console.log('[LitePlayer] 流信息面板已創建');
}

// 創建預加載控制面板
function createPreloadControlPanel(controlBar, preloader) {
    // 創建預加載控制面板
    const preloadPanel = document.createElement('div');
    preloadPanel.id = 'bilibili-lite-preload-panel';
    preloadPanel.style.marginTop = '12px';
    preloadPanel.style.border = '1px solid #d9d9d9';
    preloadPanel.style.borderRadius = '6px';
    preloadPanel.style.backgroundColor = '#fafafa';
    preloadPanel.style.overflow = 'hidden';
    
    // 創建標題欄
    const headerBar = document.createElement('div');
    headerBar.style.padding = '8px 12px';
    headerBar.style.backgroundColor = '#f0f0f0';
    headerBar.style.cursor = 'pointer';
    headerBar.style.display = 'flex';
    headerBar.style.alignItems = 'center';
    headerBar.style.justifyContent = 'space-between';
    headerBar.style.userSelect = 'none';
    
    const titleText = document.createElement('span');
    titleText.textContent = '預加載設置';
    titleText.style.fontWeight = 'bold';
    titleText.style.color = '#333';
    
    const toggleIcon = document.createElement('span');
    toggleIcon.textContent = '▼';
    toggleIcon.style.transition = 'transform 0.2s';
    toggleIcon.style.color = '#666';
    
    headerBar.appendChild(titleText);
    headerBar.appendChild(toggleIcon);
    
    // 創建內容區域
    const contentArea = document.createElement('div');
    contentArea.style.padding = '12px';
    contentArea.style.display = 'block';
    contentArea.style.transition = 'all 0.3s ease';
    
    // 創建預加載控制選項
    const controlGrid = document.createElement('div');
    controlGrid.style.display = 'grid';
    controlGrid.style.gridTemplateColumns = '1fr 1fr';
    controlGrid.style.gap = '16px';
    
    // 視頻預加載控制
    const videoControlCol = document.createElement('div');
    videoControlCol.style.padding = '12px';
    videoControlCol.style.backgroundColor = '#fff';
    videoControlCol.style.borderRadius = '4px';
    videoControlCol.style.border = '1px solid #e1e3e6';
    
    const videoTitle = document.createElement('h4');
    videoTitle.textContent = '視頻預加載';
    videoTitle.style.margin = '0 0 12px 0';
    videoTitle.style.color = '#1890ff';
    videoTitle.style.fontSize = '14px';
    videoTitle.style.fontWeight = 'bold';
    
    const videoControls = document.createElement('div');
    videoControls.style.display = 'flex';
    videoControls.style.flexDirection = 'column';
    videoControls.style.gap = '8px';
    
    // 視頻預加載開關
    const videoEnabledRow = document.createElement('div');
    videoEnabledRow.style.display = 'flex';
    videoEnabledRow.style.alignItems = 'center';
    videoEnabledRow.style.gap = '8px';
    
    const videoEnabledLabel = document.createElement('label');
    videoEnabledLabel.style.display = 'flex';
    videoEnabledLabel.style.alignItems = 'center';
    videoEnabledLabel.style.cursor = 'pointer';
    videoEnabledLabel.style.fontSize = '12px';
    
    const videoEnabledCheckbox = document.createElement('input');
    videoEnabledCheckbox.type = 'checkbox';
    videoEnabledCheckbox.checked = preloader.config.video.enabled;
    videoEnabledCheckbox.style.marginRight = '6px';
    
    videoEnabledLabel.appendChild(videoEnabledCheckbox);
    videoEnabledLabel.appendChild(document.createTextNode('啟用視頻預加載'));
    videoEnabledRow.appendChild(videoEnabledLabel);
    
    // 視頻預加載時長控制
    const videoDurationRow = document.createElement('div');
    videoDurationRow.style.display = 'flex';
    videoDurationRow.style.alignItems = 'center';
    videoDurationRow.style.gap = '8px';
    videoDurationRow.style.fontSize = '12px';
    
    const videoDurationLabel = document.createElement('span');
    videoDurationLabel.textContent = '預加載時長:';
    videoDurationLabel.style.minWidth = '70px';
    
    const videoDurationSlider = document.createElement('input');
    videoDurationSlider.type = 'range';
    videoDurationSlider.min = '1';
    videoDurationSlider.max = '60';
    videoDurationSlider.value = preloader.config.video.preloadDuration;
    videoDurationSlider.style.flex = '1';
    
    const videoDurationValue = document.createElement('span');
    videoDurationValue.textContent = `${preloader.config.video.preloadDuration}秒`;
    videoDurationValue.style.minWidth = '35px';
    videoDurationValue.style.color = '#1890ff';
    videoDurationValue.style.fontWeight = 'bold';
    
    videoDurationRow.appendChild(videoDurationLabel);
    videoDurationRow.appendChild(videoDurationSlider);
    videoDurationRow.appendChild(videoDurationValue);
    
    // 視頻緩衝區最大值設置
    const videoCacheRow = document.createElement('div');
    videoCacheRow.style.display = 'flex';
    videoCacheRow.style.alignItems = 'center';
    videoCacheRow.style.gap = '8px';
    videoCacheRow.style.fontSize = '12px';
    const videoCacheLabel = document.createElement('span');
    videoCacheLabel.textContent = '緩衝區上限:';
    videoCacheLabel.style.minWidth = '70px';
    const videoCacheInput = document.createElement('input');
    videoCacheInput.type = 'number';
    videoCacheInput.min = 10;
    videoCacheInput.max = 1024;
    videoCacheInput.value = Math.round(preloader.config.video.maxCacheSize / 1024 / 1024);
    videoCacheInput.style.width = '60px';
    const videoCacheUnit = document.createElement('span');
    videoCacheUnit.textContent = 'MB';
    videoCacheRow.appendChild(videoCacheLabel);
    videoCacheRow.appendChild(videoCacheInput);
    videoCacheRow.appendChild(videoCacheUnit);
    videoControls.appendChild(videoCacheRow);
    videoCacheInput.addEventListener('change', (e) => {
        let val = parseInt(e.target.value);
        if (isNaN(val) || val < 10) val = 10;
        if (val > 1024) val = 1024;
        videoCacheInput.value = val;
        preloader.setConfig({ videoMaxCacheSize: val * 1024 * 1024 });
        console.log('[預加載設置] 視頻緩衝區上限:', val + 'MB');
    });
    
    videoControls.appendChild(videoEnabledRow);
    videoControls.appendChild(videoDurationRow);
    videoControlCol.appendChild(videoTitle);
    videoControlCol.appendChild(videoControls);
    
    // 音頻預加載控制
    const audioControlCol = document.createElement('div');
    audioControlCol.style.padding = '12px';
    audioControlCol.style.backgroundColor = '#fff';
    audioControlCol.style.borderRadius = '4px';
    audioControlCol.style.border = '1px solid #e1e3e6';
    
    const audioTitle = document.createElement('h4');
    audioTitle.textContent = '音頻預加載';
    audioTitle.style.margin = '0 0 12px 0';
    audioTitle.style.color = '#52c41a';
    audioTitle.style.fontSize = '14px';
    audioTitle.style.fontWeight = 'bold';
    
    const audioControls = document.createElement('div');
    audioControls.style.display = 'flex';
    audioControls.style.flexDirection = 'column';
    audioControls.style.gap = '8px';
    
    // 音頻預加載開關
    const audioEnabledRow = document.createElement('div');
    audioEnabledRow.style.display = 'flex';
    audioEnabledRow.style.alignItems = 'center';
    audioEnabledRow.style.gap = '8px';
    
    const audioEnabledLabel = document.createElement('label');
    audioEnabledLabel.style.display = 'flex';
    audioEnabledLabel.style.alignItems = 'center';
    audioEnabledLabel.style.cursor = 'pointer';
    audioEnabledLabel.style.fontSize = '12px';
    
    const audioEnabledCheckbox = document.createElement('input');
    audioEnabledCheckbox.type = 'checkbox';
    audioEnabledCheckbox.checked = preloader.config.audio.enabled;
    audioEnabledCheckbox.style.marginRight = '6px';
    
    audioEnabledLabel.appendChild(audioEnabledCheckbox);
    audioEnabledLabel.appendChild(document.createTextNode('啟用音頻預加載'));
    audioEnabledRow.appendChild(audioEnabledLabel);
    
    // 音頻預加載時長控制
    const audioDurationRow = document.createElement('div');
    audioDurationRow.style.display = 'flex';
    audioDurationRow.style.alignItems = 'center';
    audioDurationRow.style.gap = '8px';
    audioDurationRow.style.fontSize = '12px';
    
    const audioDurationLabel = document.createElement('span');
    audioDurationLabel.textContent = '預加載時長:';
    audioDurationLabel.style.minWidth = '70px';
    
    const audioDurationSlider = document.createElement('input');
    audioDurationSlider.type = 'range';
    audioDurationSlider.min = '10';
    audioDurationSlider.max = '300';
    audioDurationSlider.value = preloader.config.audio.preloadDuration;
    audioDurationSlider.style.flex = '1';
    
    const audioDurationValue = document.createElement('span');
    audioDurationValue.textContent = `${preloader.config.audio.preloadDuration}秒`;
    audioDurationValue.style.minWidth = '40px';
    audioDurationValue.style.color = '#52c41a';
    audioDurationValue.style.fontWeight = 'bold';
    
    audioDurationRow.appendChild(audioDurationLabel);
    audioDurationRow.appendChild(audioDurationSlider);
    audioDurationRow.appendChild(audioDurationValue);
    
    // 音頻緩衝區最大值設置
    const audioCacheRow = document.createElement('div');
    audioCacheRow.style.display = 'flex';
    audioCacheRow.style.alignItems = 'center';
    audioCacheRow.style.gap = '8px';
    audioCacheRow.style.fontSize = '12px';
    const audioCacheLabel = document.createElement('span');
    audioCacheLabel.textContent = '緩衝區上限:';
    audioCacheLabel.style.minWidth = '70px';
    const audioCacheInput = document.createElement('input');
    audioCacheInput.type = 'number';
    audioCacheInput.min = 1;
    audioCacheInput.max = 100;
    audioCacheInput.value = Math.round(preloader.config.audio.maxCacheSize / 1024 / 1024);
    audioCacheInput.style.width = '60px';
    const audioCacheUnit = document.createElement('span');
    audioCacheUnit.textContent = 'MB';
    audioCacheRow.appendChild(audioCacheLabel);
    audioCacheRow.appendChild(audioCacheInput);
    audioCacheRow.appendChild(audioCacheUnit);
    audioControls.appendChild(audioCacheRow);
    audioCacheInput.addEventListener('change', (e) => {
        let val = parseInt(e.target.value);
        if (isNaN(val) || val < 1) val = 1;
        if (val > 100) val = 100;
        audioCacheInput.value = val;
        preloader.setConfig({ audioMaxCacheSize: val * 1024 * 1024 });
        console.log('[預加載設置] 音頻緩衝區上限:', val + 'MB');
    });
    
    audioControls.appendChild(audioEnabledRow);
    audioControls.appendChild(audioDurationRow);
    audioControlCol.appendChild(audioTitle);
    audioControlCol.appendChild(audioControls);
    
    controlGrid.appendChild(videoControlCol);
    controlGrid.appendChild(audioControlCol);
    
    // 添加統計信息區域
    const statsArea = document.createElement('div');
    statsArea.style.marginTop = '16px';
    statsArea.style.padding = '12px';
    statsArea.style.backgroundColor = '#fff';
    statsArea.style.borderRadius = '4px';
    statsArea.style.border = '1px solid #e1e3e6';
    
    const statsTitle = document.createElement('h4');
    statsTitle.textContent = '預加載統計';
    statsTitle.style.margin = '0 0 12px 0';
    statsTitle.style.color = '#722ed1';
    statsTitle.style.fontSize = '14px';
    statsTitle.style.fontWeight = 'bold';
    
    const statsContent = document.createElement('div');
    statsContent.id = 'preload-stats';
    statsContent.style.fontSize = '12px';
    statsContent.style.lineHeight = '1.6';
    statsContent.style.display = 'grid';
    statsContent.style.gridTemplateColumns = '1fr 1fr';
    statsContent.style.gap = '12px';
      statsArea.appendChild(statsTitle);
    statsArea.appendChild(statsContent);
    contentArea.appendChild(controlGrid);
    
    // 組裝面板
    preloadPanel.appendChild(headerBar);
    preloadPanel.appendChild(contentArea);
    
    // 事件處理
    let isCollapsed = false;
    headerBar.addEventListener('click', () => {
        isCollapsed = !isCollapsed;
        if (isCollapsed) {
            contentArea.style.display = 'none';
            toggleIcon.style.transform = 'rotate(-90deg)';
        } else {
            contentArea.style.display = 'block';
            toggleIcon.style.transform = 'rotate(0deg)';
        }
    });
    
    // 視頻預加載設置事件
    videoEnabledCheckbox.addEventListener('change', (e) => {
        preloader.setConfig({ videoEnabled: e.target.checked });
        console.log('[預加載設置] 視頻預加載:', e.target.checked ? '啟用' : '停用');
    });
    
    videoDurationSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        videoDurationValue.textContent = `${value}秒`;
        console.log('[UI] videoDurationSlider input, value =', value, 'preloader=', preloader);
        preloader.setConfig({ videoDuration: value });
        console.log('[預加載設置] 視頻預加載時長:', value + '秒');
    });
    
    // 音頻預加載設置事件
    audioEnabledCheckbox.addEventListener('change', (e) => {
        preloader.setConfig({ audioEnabled: e.target.checked });
        console.log('[預加載設置] 音頻預加載:', e.target.checked ? '啟用' : '停用');
    });
    
    audioDurationSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        audioDurationValue.textContent = `${value}秒`;
        console.log('[UI] audioDurationSlider input, value =', value, 'preloader=', preloader);
        preloader.setConfig({ audioDuration: value });
        console.log('[預加載設置] 音頻預加載時長:', value + '秒');
    });

    // 多線程下載控制
    const multiThreadRow = document.createElement('div');
    multiThreadRow.style.cssText = `
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        margin-top: 16px;
        padding: 12px;
        background: #f8f9fa;
        border-radius: 4px;
        border: 1px dashed #d9d9d9;
    `;

    // 視頻多線程控制
    const videoMultiThreadCol = document.createElement('div');
    const videoMultiThreadTitle = document.createElement('h5');
    videoMultiThreadTitle.textContent = '視頻多線程下載';
    videoMultiThreadTitle.style.cssText = `
        margin: 0 0 8px 0;
        color: #1890ff;
        font-size: 13px;
        font-weight: bold;
    `;

    const videoMultiThreadEnabled = document.createElement('label');
    videoMultiThreadEnabled.style.cssText = `
        display: flex;
        align-items: center;
        cursor: pointer;
        font-size: 12px;
        margin-bottom: 6px;
    `;
    
    const videoMultiThreadCheckbox = document.createElement('input');
    videoMultiThreadCheckbox.type = 'checkbox';
    videoMultiThreadCheckbox.checked = preloader.config.video.useMultiThread;
    videoMultiThreadCheckbox.style.marginRight = '6px';
    
    videoMultiThreadEnabled.appendChild(videoMultiThreadCheckbox);
    videoMultiThreadEnabled.appendChild(document.createTextNode('啟用多線程'));

    const videoConcurrentRow = document.createElement('div');
    videoConcurrentRow.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
    `;
    
    const videoConcurrentLabel = document.createElement('span');
    videoConcurrentLabel.textContent = '並發數:';
    videoConcurrentLabel.style.minWidth = '45px';
    
    const videoConcurrentSlider = document.createElement('input');
    videoConcurrentSlider.type = 'range';
    videoConcurrentSlider.min = '1';
    videoConcurrentSlider.max = '8';
    videoConcurrentSlider.value = preloader.config.video.maxConcurrentDownloads;
    videoConcurrentSlider.style.flex = '1';
    
    const videoConcurrentValue = document.createElement('span');
    videoConcurrentValue.textContent = preloader.config.video.maxConcurrentDownloads;
    videoConcurrentValue.style.cssText = `
        min-width: 20px;
        color: #1890ff;
        font-weight: bold;
    `;

    videoConcurrentRow.appendChild(videoConcurrentLabel);
    videoConcurrentRow.appendChild(videoConcurrentSlider);
    videoConcurrentRow.appendChild(videoConcurrentValue);

    videoMultiThreadCol.appendChild(videoMultiThreadTitle);
    videoMultiThreadCol.appendChild(videoMultiThreadEnabled);
    videoMultiThreadCol.appendChild(videoConcurrentRow);

    // 音頻多線程控制
    const audioMultiThreadCol = document.createElement('div');
    const audioMultiThreadTitle = document.createElement('h5');
    audioMultiThreadTitle.textContent = '音頻多線程下載';
    audioMultiThreadTitle.style.cssText = `
        margin: 0 0 8px 0;
        color: #52c41a;
        font-size: 13px;
        font-weight: bold;
    `;

    const audioMultiThreadEnabled = document.createElement('label');
    audioMultiThreadEnabled.style.cssText = `
        display: flex;
        align-items: center;
        cursor: pointer;
        font-size: 12px;
        margin-bottom: 6px;
    `;
    
    const audioMultiThreadCheckbox = document.createElement('input');
    audioMultiThreadCheckbox.type = 'checkbox';
    audioMultiThreadCheckbox.checked = preloader.config.audio.useMultiThread;
    audioMultiThreadCheckbox.style.marginRight = '6px';
    
    audioMultiThreadEnabled.appendChild(audioMultiThreadCheckbox);
    audioMultiThreadEnabled.appendChild(document.createTextNode('啟用多線程'));

    const audioConcurrentRow = document.createElement('div');
    audioConcurrentRow.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
    `;
    
    const audioConcurrentLabel = document.createElement('span');
    audioConcurrentLabel.textContent = '並發數:';
    audioConcurrentLabel.style.minWidth = '45px';
      const audioConcurrentSlider = document.createElement('input');
    audioConcurrentSlider.type = 'range';
    audioConcurrentSlider.min = '1';
    audioConcurrentSlider.max = '8'; // 提高音頻並發數上限到8
    audioConcurrentSlider.value = preloader.config.audio.maxConcurrentDownloads;
    audioConcurrentSlider.style.flex = '1';
    
    const audioConcurrentValue = document.createElement('span');
    audioConcurrentValue.textContent = preloader.config.audio.maxConcurrentDownloads;
    audioConcurrentValue.style.cssText = `
        min-width: 20px;
        color: #52c41a;
        font-weight: bold;
    `;

    audioConcurrentRow.appendChild(audioConcurrentLabel);
    audioConcurrentRow.appendChild(audioConcurrentSlider);
    audioConcurrentRow.appendChild(audioConcurrentValue);

    audioMultiThreadCol.appendChild(audioMultiThreadTitle);
    audioMultiThreadCol.appendChild(audioMultiThreadEnabled);
    audioMultiThreadCol.appendChild(audioConcurrentRow);    multiThreadRow.appendChild(videoMultiThreadCol);
    multiThreadRow.appendChild(audioMultiThreadCol);

    // 高級線程設置區域
    const advancedSettingsArea = document.createElement('div');
    advancedSettingsArea.style.cssText = `
        margin-top: 16px;
        padding: 12px;
        background: #fff;
        border-radius: 4px;
        border: 1px solid #e1e3e6;
    `;

    const advancedTitle = document.createElement('h4');
    advancedTitle.textContent = '高級線程設置';
    advancedTitle.style.cssText = `
        margin: 0 0 12px 0;
        color: #722ed1;
        font-size: 14px;
        font-weight: bold;
        display: flex;
        align-items: center;
        gap: 8px;
    `;

    const advancedToggleIcon = document.createElement('span');
    advancedToggleIcon.textContent = '▼';
    advancedToggleIcon.style.cssText = `
        font-size: 12px;
        color: #666;
        transition: transform 0.2s;
        cursor: pointer;
    `;

    advancedTitle.appendChild(advancedToggleIcon);

    const advancedContent = document.createElement('div');
    advancedContent.style.cssText = `
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        transition: all 0.3s ease;
    `;

    // 性能配置區域
    const performanceCol = document.createElement('div');
    performanceCol.style.cssText = `
        padding: 12px;
        background: #f8f9fa;
        border-radius: 4px;
        border: 1px solid #e9ecef;
    `;

    const performanceTitle = document.createElement('h5');
    performanceTitle.textContent = '性能配置';
    performanceTitle.style.cssText = `
        margin: 0 0 12px 0;
        color: #495057;
        font-size: 13px;
        font-weight: bold;
    `;

    // 段落大小設置
    const segmentSizeRow = document.createElement('div');
    segmentSizeRow.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
        font-size: 12px;
    `;

    const segmentSizeLabel = document.createElement('span');
    segmentSizeLabel.textContent = '段落大小:';
    segmentSizeLabel.style.minWidth = '55px';

    const segmentSizeSelect = document.createElement('select');
    segmentSizeSelect.style.cssText = `
        flex: 1;
        padding: 2px 4px;
        border: 1px solid #d9d9d9;
        border-radius: 3px;
        font-size: 12px;
    `;

    // 獲取當前段落大小設置
    const currentSegmentSize = preloader.config.video.segmentSize || 2 * 1024 * 1024;
    const segmentSizeOptions = [
        { value: 512 * 1024, text: '512KB (慢速網絡)' },
        { value: 1024 * 1024, text: '1MB (標準)' },
        { value: 2 * 1024 * 1024, text: '2MB (推薦)' },
        { value: 4 * 1024 * 1024, text: '4MB (高速網絡)' },
        { value: 8 * 1024 * 1024, text: '8MB (極高速)' }
    ];


    segmentSizeOptions.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option.value;
        optionElement.textContent = option.text;
        optionElement.selected = option.value === currentSegmentSize;
        segmentSizeSelect.appendChild(optionElement);
    });

    segmentSizeRow.appendChild(segmentSizeLabel);
    segmentSizeRow.appendChild(segmentSizeSelect);

    // 線程池大小設置
    const threadPoolRow = document.createElement('div');
    threadPoolRow.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
        font-size: 12px;
    `;

    const threadPoolLabel = document.createElement('span');
    threadPoolLabel.textContent = '線程池:';
    threadPoolLabel.style.minWidth = '55px';

    const threadPoolSlider = document.createElement('input');
    threadPoolSlider.type = 'range';
    threadPoolSlider.min = '2';
    threadPoolSlider.max = '16';
    threadPoolSlider.value = Math.max(preloader.config.video.maxConcurrentDownloads, preloader.config.audio.maxConcurrentDownloads);
    threadPoolSlider.style.flex = '1';

    const threadPoolValue = document.createElement('span');
    threadPoolValue.textContent = threadPoolSlider.value;
    threadPoolValue.style.cssText = `
        min-width: 20px;
        color: #722ed1;
        font-weight: bold;
    `;

    threadPoolRow.appendChild(threadPoolLabel);
    threadPoolRow.appendChild(threadPoolSlider);
    threadPoolRow.appendChild(threadPoolValue);

    performanceCol.appendChild(performanceTitle);
    performanceCol.appendChild(segmentSizeRow);
    performanceCol.appendChild(threadPoolRow);

    // 網絡配置區域
    const networkCol = document.createElement('div');
    networkCol.style.cssText = `
        padding: 12px;
        background: #f8f9fa;
        border-radius: 4px;
        border: 1px solid #e9ecef;
    `;

    const networkTitle = document.createElement('h5');
    networkTitle.textContent = '網絡配置';
    networkTitle.style.cssText = `
        margin: 0 0  12px 0;
        color: #495057;
        font-size: 13px;
        font-weight: bold;
    `;

    // 超時時間設置
    const timeoutRow = document.createElement('div');
    timeoutRow.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
        font-size: 12px;
    `;

    const timeoutLabel = document.createElement('span');
    timeoutLabel.textContent = '超時時間:';
    timeoutLabel.style.minWidth = '55px';

    const timeoutSlider = document.createElement('input');
    timeoutSlider.type = 'range';
    timeoutSlider.min = '5';
    timeoutSlider.max = '60';
    timeoutSlider.value = '30'; // 默認30秒
    timeoutSlider.style.flex = '1';

    const timeoutValue = document.createElement('span');
    timeoutValue.textContent = timeoutSlider.value + 's';
    timeoutValue.style.cssText = `
        min-width: 25px;
        color: #fa8c16;
        font-weight: bold;
    `;

    timeoutRow.appendChild(timeoutLabel);
    timeoutRow.appendChild(timeoutSlider);
    timeoutRow.appendChild(timeoutValue);

    // 重試次數設置
    const retryRow = document.createElement('div');
    retryRow.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
        font-size: 12px;
    `;

    const retryLabel = document.createElement('span');
    retryLabel.textContent = '重試次數:';
    retryLabel.style.minWidth = '55px';

   
    const retrySlider = document.createElement('input');
    retrySlider.type = 'range';
    retrySlider.min = '0';
    retrySlider.max = '5';
    retrySlider.value = '3'; // 默認3次
    retrySlider.style.flex = '1';

    const retryValue = document.createElement('span');
    retryValue.textContent = retrySlider.value + '次';
    retryValue.style.cssText = `
        min-width: 25px;
        color: #52c41a;
        font-weight: bold;
    `;

    retryRow.appendChild(retryLabel);
    retryRow.appendChild(retrySlider);
    retryRow.appendChild(retryValue);

    networkCol.appendChild(networkTitle);
    networkCol.appendChild(timeoutRow);
    networkCol.appendChild(retryRow);

    advancedContent.appendChild(performanceCol);
    advancedContent.appendChild(networkCol);

    // 預設配置區域
    const presetsArea = document.createElement('div');
    presetsArea.style.cssText = `
        margin-top: 12px;
        padding: 8px;
        background: #fff7e6;
        border-radius: 4px;
        border: 1px solid #ffd591;
    `;

    const presetsTitle = document.createElement('div');
    presetsTitle.textContent = '快速預設';
    presetsTitle.style.cssText = `
        margin-bottom: 8px;
        color: #fa8c16;
        font-size: 12px;
        font-weight: bold;
    `;

    const presetsButtons = document.createElement('div');
    presetsButtons.style.cssText = `
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
    `;

    const presets = [
        { name: '省電模式', concurrent: 2, segmentSize: 512 * 1024, timeout: 20, retry: 2 },
        { name: '標準模式', concurrent: 4, segmentSize: 2 * 1024 * 1024, timeout: 30, retry: 3 },
        { name: '高速模式', concurrent: 8, segmentSize: 4 * 1024 * 1024, timeout: 15, retry: 1 },
        { name: '極速模式', concurrent: 12, segmentSize: 8 * 1024 * 1024, timeout: 10, retry: 1 }
    ];

    presets.forEach(preset => {
        const button = document.createElement('button');
        button.textContent = preset.name;
        button.style.cssText = `
            padding: 4px 8px;
            font-size: 11px;
            border: 1px solid #ffa940;
            border-radius: 3px;
            background: #fff;
            color: #fa8c16;
            cursor: pointer;
            transition: all 0.2s;
        `;

        button.addEventListener('mouseenter', () => {
            button.style.background = '#ffa940';
            button.style.color = '#fff';
        });

        button.addEventListener('mouseleave', () => {
            button.style.background = '#fff';
            button.style.color = '#fa8c16';
        });

        button.addEventListener('click', () => {
            // 應用預設配置
            videoConcurrentSlider.value = preset.concurrent;
            videoConcurrentValue.textContent = preset.concurrent;
            audioConcurrentSlider.value = preset.concurrent;
            audioConcurrentValue.textContent = preset.concurrent;
            threadPoolSlider.value = preset.concurrent;
            threadPoolValue.textContent = preset.concurrent;
            segmentSizeSelect.value = preset.segmentSize;
            timeoutSlider.value = preset.timeout;
            timeoutValue.textContent = preset.timeout + 's';
            retrySlider.value = preset.retry;
            retryValue.textContent = preset.retry + '次';

            // 更新配置
            preloader.setConfig({
                videoMaxConcurrentDownloads: preset.concurrent,
                audioMaxConcurrentDownloads: preset.concurrent,
                videoSegmentSize: preset.segmentSize,
                audioSegmentSize: preset.segmentSize
            });

            console.log(`[線程配置] 應用預設: ${preset.name}`);
        });

        presetsButtons.appendChild(button);
    });

    presetsArea.appendChild(presetsTitle);
    presetsArea.appendChild(presetsButtons);

    advancedContent.appendChild(presetsArea);

    advancedSettingsArea.appendChild(advancedTitle);
    advancedSettingsArea.appendChild(advancedContent);

    // 高級設置折疊功能
    let advancedCollapsed = true;
    advancedContent.style.display = 'none';
    advancedToggleIcon.style.transform = 'rotate(-90deg)';    advancedTitle.addEventListener('click', () => {
        advancedCollapsed = !advancedCollapsed;
        if (advancedCollapsed) {
            advancedContent.style.display = 'none';
            advancedToggleIcon.style.transform = 'rotate(-90deg)';
        } else {
            advancedContent.style.display = 'grid';
            advancedToggleIcon.style.transform = 'rotate(0deg)';
        }
    });

    // 加載保存的高級配置
    const loadAdvancedConfig = () => {
        try {
            const saved = localStorage.getItem('bilibili-thread-advanced-config');
            if (saved) {
                const config = JSON.parse(saved);
                segmentSizeSelect.value = config.segmentSize || 2 * 1024 * 1024;
                timeoutSlider.value = (config.timeout || 30000) / 1000;
                timeoutValue.textContent = timeoutSlider.value + 's';
                retrySlider.value = config.retryAttempts || 3;
                retryValue.textContent = retrySlider.value + '次';
                threadPoolSlider.value = config.threadPoolSize || 8;
                threadPoolValue.textContent = threadPoolSlider.value;
                console.log('[線程配置] 高级配置已加載');
            }
        } catch (e) {
            console.warn('[線程配置] 高級配置加載失敗:', e);
        }
    };

    // 保存高級配置到本地存儲
    function saveAdvancedConfig() {
        try {
            const config = {
                segmentSize: parseInt(segmentSizeSelect.value),
                timeout: parseInt(timeoutSlider.value) * 1000,
                retryAttempts: parseInt(retrySlider.value),
                threadPoolSize: parseInt(threadPoolSlider.value)
            };
            localStorage.setItem('bilibili-thread-advanced-config', JSON.stringify(config));
            console.log('[線程配置] 高級配置已保存', config);
        } catch (e) {
            console.warn('[線程配置] 高級配置保存失敗:', e);
        }
    }

    // 加載保存的配置
    loadAdvancedConfig();

    // 添加配置保存到所有高級設置的事件處理器
    const advancedInputs = [segmentSizeSelect, timeoutSlider, retrySlider, threadPoolSlider];
    advancedInputs.forEach(input => {
        input.addEventListener('change', saveAdvancedConfig);
        input.addEventListener('input', saveAdvancedConfig);
    });
    
    // 將面板添加到控制欄
    controlBar.appendChild(preloadPanel);
    
    console.log('[預加載控制面板] 創建完成');
}

export { replacePlayer };