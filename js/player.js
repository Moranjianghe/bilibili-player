// player.js - 處理播放器的實現和相關功能
import { qualityMap, audioQualityMap, cdnOptimizer } from './api.js';
import { StreamMonitor, extractCDNInfo, formatBytes, formatBitrate } from './utils.js';
import { MediaPreloader } from './preloader.js';
import { PlaybackOptimizer } from './playback-optimizer.js';
import { QuickFixes } from './quick-fixes.js';
import { AdaptiveQuality } from './adaptive-quality.js';

let streamMonitor = null;
let mediaPreloader = null;
let playbackOptimizer = null;
let quickFixes = null;
let adaptiveQuality = null;

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
        document.head.appendChild(style);
        // 控制同步
        function syncAudio() {
            if (Math.abs(video.currentTime - audio.currentTime) > 0.1) {
                audio.currentTime = video.currentTime;
            }
        }
        video.addEventListener('play', () => { audio.play(); });
        video.addEventListener('pause', () => { audio.pause(); });
        video.addEventListener('seeking', () => { audio.currentTime = video.currentTime; });
        video.addEventListener('ratechange', () => { audio.playbackRate = video.playbackRate; });
        video.addEventListener('volumechange', () => { audio.volume = video.volume; audio.muted = video.muted; });
        video.addEventListener('timeupdate', syncAudio);
        // loading 檢查
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
        video.addEventListener('waiting', checkBuffering);
        audio.addEventListener('waiting', checkBuffering);
        video.addEventListener('seeking', checkBuffering);
        audio.addEventListener('seeking', checkBuffering);
        video.addEventListener('playing', checkBuffering);
        audio.addEventListener('playing', checkBuffering);
        video.addEventListener('canplay', checkBuffering);
        audio.addEventListener('canplay', checkBuffering);
        video.addEventListener('canplaythrough', checkBuffering);
        audio.addEventListener('canplaythrough', checkBuffering);
        // 初始檢查
        setTimeout(checkBuffering, 100);        // 插入
        newPlayer.appendChild(video);
        newPlayer.appendChild(audio);
        
        // 啟動流監控
        if (streamMonitor) {
            streamMonitor.stopMonitoring();
        }
        streamMonitor = new StreamMonitor();
        streamMonitor.startMonitoring(video, audio);
          // 啟動預加載器
        if (mediaPreloader) {
            mediaPreloader.stop();
        }
        mediaPreloader = new MediaPreloader();
        mediaPreloader.initialize(video, audio, videoUrl, audioUrl);
          // 啟動播放優化器
        if (playbackOptimizer) {
            playbackOptimizer.stop();
        }
        playbackOptimizer = new PlaybackOptimizer();
        playbackOptimizer.initialize(video, audio, {
            buffer: {
                targetDuration: 30,
                maxDuration: 60,
                minDuration: 5,
                rebufferGoal: 8
            },
            adaptive: {
                enabled: true,
                speedTest: true,
                qualityAdjust: true
            }
        });
          // 應用快速修復
        if (!quickFixes) {
            quickFixes = new QuickFixes();
            quickFixes.applyAllFixes();
        }
        
        // 啟動自適應畫質調整
        if (adaptiveQuality) {
            adaptiveQuality.stop();
        }
        adaptiveQuality = new AdaptiveQuality();
        const currentQuality = playInfo.quality || 80; // 默認 1080P
        adaptiveQuality.start(currentQuality, (newQuality) => {
            console.log('[自適應畫質] 建議切換畫質:', newQuality);
            // 觸發畫質變更事件
            const event = new CustomEvent('qualityChangeRequest', {
                detail: { quality: newQuality, reason: 'adaptive' }
            });
            document.dispatchEvent(event);
        });
        
        // 創建控制區
        createControlBar(playInfo, mainReload, streamMonitor, mediaPreloader, playbackOptimizer, adaptiveQuality);
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
        streamMonitor.startMonitoring(video, null);
          // 啟動預加載器（僅視頻）
        if (mediaPreloader) {
            mediaPreloader.stop();
        }
        mediaPreloader = new MediaPreloader();
        mediaPreloader.initialize(video, null, playInfo.videoUrl, null);
          // 啟動播放優化器（僅視頻）
        if (playbackOptimizer) {
            playbackOptimizer.stop();
        }
        playbackOptimizer = new PlaybackOptimizer();
        playbackOptimizer.initialize(video, null);
          // 應用快速修復
        if (!quickFixes) {
            quickFixes = new QuickFixes();
            quickFixes.applyAllFixes();
        }
        
        // 啟動自適應畫質調整
        if (adaptiveQuality) {
            adaptiveQuality.stop();
        }
        adaptiveQuality = new AdaptiveQuality();
        const currentQuality = playInfo.quality || 80; // 默認 1080P
        adaptiveQuality.start(currentQuality, (newQuality) => {
            console.log('[自適應畫質] 建議切換畫質:', newQuality);
            // 觸發畫質變更事件
            const event = new CustomEvent('qualityChangeRequest', {
                detail: { quality: newQuality, reason: 'adaptive' }
            });
            document.dispatchEvent(event);
        });
        
        // 創建控制區
        createControlBar(playInfo, mainReload, streamMonitor, mediaPreloader, playbackOptimizer, adaptiveQuality);
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
function createControlBar(playInfo, mainReload, monitor = null, preloader = null, optimizer = null) {
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
            
            // 根據畫質添加會員標記
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
            console.log('[LitePlayer] 畫質切換到:', val);
            
            // 顯示載入中狀態
            const loading = document.getElementById('bilibili-lite-loading');
            if (loading) {
                loading.style.display = 'flex';
            }
            
            // 禁用選擇器防止重複點擊
            qnSelect.disabled = true;
              try {
                // 延遲執行以避免同步問題，與 CDN 切換保持一致
                setTimeout(() => {
                    mainReload(val, playInfo.audioQuality);
                }, 300);
            } catch (error) {
                console.error('[LitePlayer] 畫質切換失敗:', error);
                // 恢復選擇器
                qnSelect.disabled = false;
                if (loading) {
                    loading.style.display = 'none';
                }
            }        };
        qnGroup.appendChild(qnSelect);
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
          // 添加預加載控制面板
        if (preloader) {
            createPreloadControlPanel(controlBar, preloader);
        }
          // 添加播放優化控制面板
        if (optimizer) {
            createOptimizerControlPanel(controlBar, optimizer);
        }
        
        // 添加自適應畫質控制面板
        if (arguments[5]) { // adaptiveQuality 參數
            createAdaptiveQualityPanel(controlBar, arguments[5]);
        }
        
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
    contentArea.appendChild(statsArea);
    
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
        preloader.setConfig({ audioDuration: value });
        console.log('[預加載設置] 音頻預加載時長:', value + '秒');
    });
    
    // 定期更新統計信息
    const updateStats = () => {
        const stats = preloader.getStats();
        statsContent.innerHTML = `
            <div>
                <div style="margin-bottom: 6px;"><strong>視頻預加載:</strong></div>
                <div style="margin-bottom: 4px; color: #1890ff;">已緩存段落: ${stats.video.cachedSegments}</div>
                <div style="margin-bottom: 4px; color: #1890ff;">緩存大小: ${formatBytes(stats.video.cacheSize)}</div>
                <div style="margin-bottom: 4px; color: #1890ff;">預加載時長: ${stats.video.preloadDuration}秒</div>
                <div style="color: #666;">總請求: ${stats.video.totalRequests}</div>
            </div>
            <div>
                <div style="margin-bottom: 6px;"><strong>音頻預加載:</strong></div>
                <div style="margin-bottom: 4px; color: #52c41a;">已緩存段落: ${stats.audio.cachedSegments}</div>
                <div style="margin-bottom: 4px; color: #52c41a;">緩存大小: ${formatBytes(stats.audio.cacheSize)}</div>
                <div style="margin-bottom: 4px; color: #52c41a;">預加載時長: ${stats.audio.preloadDuration}秒</div>
                <div style="color: #666;">總請求: ${stats.audio.totalRequests}</div>
            </div>
        `;
    };
    
    // 初始更新統計信息
    updateStats();
    
    // 每2秒更新一次統計信息
    const statsInterval = setInterval(updateStats, 2000);
    
    // 將面板添加到控制欄
    controlBar.appendChild(preloadPanel);
    
    console.log('[預加載控制面板] 創建完成');
}

// 創建播放優化控制面板
function createOptimizerControlPanel(controlBar, optimizer) {
    // 創建優化器控制面板
    const optimizerPanel = document.createElement('div');
    optimizerPanel.id = 'bilibili-lite-optimizer-panel';
    optimizerPanel.style.marginTop = '12px';
    optimizerPanel.style.border = '1px solid #d9d9d9';
    optimizerPanel.style.borderRadius = '6px';
    optimizerPanel.style.backgroundColor = '#f0f8ff';
    optimizerPanel.style.overflow = 'hidden';
    
    // 創建標題欄
    const headerBar = document.createElement('div');
    headerBar.style.padding = '8px 12px';
    headerBar.style.backgroundColor = '#e6f4ff';
    headerBar.style.cursor = 'pointer';
    headerBar.style.display = 'flex';
    headerBar.style.alignItems = 'center';
    headerBar.style.justifyContent = 'space-between';
    headerBar.style.userSelect = 'none';
    
    const titleText = document.createElement('span');
    titleText.textContent = '播放優化';
    titleText.style.fontWeight = 'bold';
    titleText.style.color = '#1890ff';
    
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
    
    // 創建優化狀態顯示
    const statusGrid = document.createElement('div');
    statusGrid.style.display = 'grid';
    statusGrid.style.gridTemplateColumns = '1fr 1fr 1fr';
    statusGrid.style.gap = '12px';
    statusGrid.style.marginBottom = '16px';
    
    // 網絡狀態卡片
    const networkCard = document.createElement('div');
    networkCard.style.padding = '12px';
    networkCard.style.backgroundColor = '#fff';
    networkCard.style.borderRadius = '4px';
    networkCard.style.border = '1px solid #e1e3e6';
    networkCard.style.textAlign = 'center';
    
    const networkTitle = document.createElement('div');
    networkTitle.textContent = '網絡狀態';
    networkTitle.style.fontSize = '12px';
    networkTitle.style.color = '#666';
    networkTitle.style.marginBottom = '6px';
    
    const networkSpeed = document.createElement('div');
    networkSpeed.id = 'network-speed';
    networkSpeed.textContent = '檢測中...';
    networkSpeed.style.fontSize = '14px';
    networkSpeed.style.fontWeight = 'bold';
    networkSpeed.style.color = '#1890ff';
    
    networkCard.appendChild(networkTitle);
    networkCard.appendChild(networkSpeed);
    
    // 緩衝狀態卡片
    const bufferCard = document.createElement('div');
    bufferCard.style.padding = '12px';
    bufferCard.style.backgroundColor = '#fff';
    bufferCard.style.borderRadius = '4px';
    bufferCard.style.border = '1px solid #e1e3e6';
    bufferCard.style.textAlign = 'center';
    
    const bufferTitle = document.createElement('div');
    bufferTitle.textContent = '緩衝狀態';
    bufferTitle.style.fontSize = '12px';
    bufferTitle.style.color = '#666';
    bufferTitle.style.marginBottom = '6px';
    
    const bufferHealth = document.createElement('div');
    bufferHealth.id = 'buffer-health';
    bufferHealth.textContent = '0.0s';
    bufferHealth.style.fontSize = '14px';
    bufferHealth.style.fontWeight = 'bold';
    bufferHealth.style.color = '#52c41a';
    
    bufferCard.appendChild(bufferTitle);
    bufferCard.appendChild(bufferHealth);
    
    // 卡頓統計卡片
    const stallCard = document.createElement('div');
    stallCard.style.padding = '12px';
    stallCard.style.backgroundColor = '#fff';
    stallCard.style.borderRadius = '4px';
    stallCard.style.border = '1px solid #e1e3e6';
    stallCard.style.textAlign = 'center';
    
    const stallTitle = document.createElement('div');
    stallTitle.textContent = '卡頓次數';
    stallTitle.style.fontSize = '12px';
    stallTitle.style.color = '#666';
    stallTitle.style.marginBottom = '6px';
    
    const stallCount = document.createElement('div');
    stallCount.id = 'stall-count';
    stallCount.textContent = '0';
    stallCount.style.fontSize = '14px';
    stallCount.style.fontWeight = 'bold';
    stallCount.style.color = '#ff4d4f';
    
    stallCard.appendChild(stallTitle);
    stallCard.appendChild(stallCount);
    
    statusGrid.appendChild(networkCard);
    statusGrid.appendChild(bufferCard);
    statusGrid.appendChild(stallCard);
    
    // 創建緩衝設置控制
    const bufferControls = document.createElement('div');
    bufferControls.style.marginBottom = '16px';
    bufferControls.style.padding = '12px';
    bufferControls.style.backgroundColor = '#fff';
    bufferControls.style.borderRadius = '4px';
    bufferControls.style.border = '1px solid #e1e3e6';
    
    const bufferControlsTitle = document.createElement('h4');
    bufferControlsTitle.textContent = '緩衝策略';
    bufferControlsTitle.style.margin = '0 0 12px 0';
    bufferControlsTitle.style.color = '#1890ff';
    bufferControlsTitle.style.fontSize = '14px';
    bufferControlsTitle.style.fontWeight = 'bold';
    
    // 目標緩衝時長控制
    const targetBufferRow = document.createElement('div');
    targetBufferRow.style.display = 'flex';
    targetBufferRow.style.alignItems = 'center';
    targetBufferRow.style.gap = '8px';
    targetBufferRow.style.marginBottom = '8px';
    targetBufferRow.style.fontSize = '12px';
    
    const targetBufferLabel = document.createElement('span');
    targetBufferLabel.textContent = '目標緩衝:';
    targetBufferLabel.style.minWidth = '70px';
    
    const targetBufferSlider = document.createElement('input');
    targetBufferSlider.type = 'range';
    targetBufferSlider.min = '5';
    targetBufferSlider.max = '60';
    targetBufferSlider.value = optimizer.config.buffer.targetDuration;
    targetBufferSlider.style.flex = '1';
    
    const targetBufferValue = document.createElement('span');
    targetBufferValue.textContent = `${optimizer.config.buffer.targetDuration}秒`;
    targetBufferValue.style.minWidth = '35px';
    targetBufferValue.style.color = '#1890ff';
    targetBufferValue.style.fontWeight = 'bold';
    
    targetBufferRow.appendChild(targetBufferLabel);
    targetBufferRow.appendChild(targetBufferSlider);
    targetBufferRow.appendChild(targetBufferValue);
    
    // 重緩衝目標控制
    const rebufferRow = document.createElement('div');
    rebufferRow.style.display = 'flex';
    rebufferRow.style.alignItems = 'center';
    rebufferRow.style.gap = '8px';
    rebufferRow.style.fontSize = '12px';
    
    const rebufferLabel = document.createElement('span');
    rebufferLabel.textContent = '重緩衝目標:';
    rebufferLabel.style.minWidth = '70px';
    
    const rebufferSlider = document.createElement('input');
    rebufferSlider.type = 'range';
    rebufferSlider.min = '2';
    rebufferSlider.max = '15';
    rebufferSlider.value = optimizer.config.buffer.rebufferGoal;
    rebufferSlider.style.flex = '1';
    
    const rebufferValue = document.createElement('span');
    rebufferValue.textContent = `${optimizer.config.buffer.rebufferGoal}秒`;
    rebufferValue.style.minWidth = '35px';
    rebufferValue.style.color = '#52c41a';
    rebufferValue.style.fontWeight = 'bold';
    
    rebufferRow.appendChild(rebufferLabel);
    rebufferRow.appendChild(rebufferSlider);
    rebufferRow.appendChild(rebufferValue);
    
    bufferControls.appendChild(bufferControlsTitle);
    bufferControls.appendChild(targetBufferRow);
    bufferControls.appendChild(rebufferRow);
    
    // 自適應設置
    const adaptiveControls = document.createElement('div');
    adaptiveControls.style.padding = '12px';
    adaptiveControls.style.backgroundColor = '#fff';
    adaptiveControls.style.borderRadius = '4px';
    adaptiveControls.style.border = '1px solid #e1e3e6';
    
    const adaptiveTitle = document.createElement('h4');
    adaptiveTitle.textContent = '自適應優化';
    adaptiveTitle.style.margin = '0 0 12px 0';
    adaptiveTitle.style.color = '#52c41a';
    adaptiveTitle.style.fontSize = '14px';
    adaptiveTitle.style.fontWeight = 'bold';
    
    // 自適應開關
    const adaptiveEnabledRow = document.createElement('div');
    adaptiveEnabledRow.style.display = 'flex';
    adaptiveEnabledRow.style.alignItems = 'center';
    adaptiveEnabledRow.style.gap = '16px';
    adaptiveEnabledRow.style.fontSize = '12px';
    
    const adaptiveEnabledLabel = document.createElement('label');
    adaptiveEnabledLabel.style.display = 'flex';
    adaptiveEnabledLabel.style.alignItems = 'center';
    adaptiveEnabledLabel.style.cursor = 'pointer';
    
    const adaptiveEnabledCheckbox = document.createElement('input');
    adaptiveEnabledCheckbox.type = 'checkbox';
    adaptiveEnabledCheckbox.checked = optimizer.config.adaptive.enabled;
    adaptiveEnabledCheckbox.style.marginRight = '6px';
    
    adaptiveEnabledLabel.appendChild(adaptiveEnabledCheckbox);
    adaptiveEnabledLabel.appendChild(document.createTextNode('啟用自適應優化'));
    
    // 速度測試開關
    const speedTestLabel = document.createElement('label');
    speedTestLabel.style.display = 'flex';
    speedTestLabel.style.alignItems = 'center';
    speedTestLabel.style.cursor = 'pointer';
    
    const speedTestCheckbox = document.createElement('input');
    speedTestCheckbox.type = 'checkbox';
    speedTestCheckbox.checked = optimizer.config.adaptive.speedTest;
    speedTestCheckbox.style.marginRight = '6px';
    
    speedTestLabel.appendChild(speedTestCheckbox);
    speedTestLabel.appendChild(document.createTextNode('自動速度測試'));
    
    adaptiveEnabledRow.appendChild(adaptiveEnabledLabel);
    adaptiveEnabledRow.appendChild(speedTestLabel);
    
    adaptiveControls.appendChild(adaptiveTitle);
    adaptiveControls.appendChild(adaptiveEnabledRow);
    
    contentArea.appendChild(statusGrid);
    contentArea.appendChild(bufferControls);
    contentArea.appendChild(adaptiveControls);
    
    // 組裝面板
    optimizerPanel.appendChild(headerBar);
    optimizerPanel.appendChild(contentArea);
    
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
    
    // 緩衝設置事件
    targetBufferSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        targetBufferValue.textContent = `${value}秒`;
        optimizer.config.buffer.targetDuration = value;
        console.log('[播放優化] 目標緩衝時長:', value + '秒');
    });
    
    rebufferSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        rebufferValue.textContent = `${value}秒`;
        optimizer.config.buffer.rebufferGoal = value;
        console.log('[播放優化] 重緩衝目標:', value + '秒');
    });
    
    // 自適應設置事件
    adaptiveEnabledCheckbox.addEventListener('change', (e) => {
        optimizer.config.adaptive.enabled = e.target.checked;
        console.log('[播放優化] 自適應優化:', e.target.checked ? '啟用' : '停用');
    });
    
    speedTestCheckbox.addEventListener('change', (e) => {
        optimizer.config.adaptive.speedTest = e.target.checked;
        console.log('[播放優化] 自動速度測試:', e.target.checked ? '啟用' : '停用');
    });
    
    // 定期更新狀態
    const updateStatus = () => {
        const stats = optimizer.getStats();
        
        // 更新網絡速度
        const speedElement = document.getElementById('network-speed');
        if (speedElement) {
            const speed = stats.networkSpeed;
            if (speed > 0) {
                speedElement.textContent = speed.toFixed(1) + ' Mbps';
                speedElement.style.color = speed > 2 ? '#52c41a' : speed > 1 ? '#fa8c16' : '#ff4d4f';
            } else {
                speedElement.textContent = '檢測中...';
                speedElement.style.color = '#666';
            }
        }
        
        // 更新緩衝健康度
        const bufferElement = document.getElementById('buffer-health');
        if (bufferElement) {
            const buffer = stats.bufferHealth;
            bufferElement.textContent = buffer.toFixed(1) + 's';
            bufferElement.style.color = buffer > 10 ? '#52c41a' : buffer > 5 ? '#fa8c16' : '#ff4d4f';
        }
        
        // 更新卡頓次數
        const stallElement = document.getElementById('stall-count');
        if (stallElement) {
            stallElement.textContent = stats.stallEvents.toString();
            stallElement.style.color = stats.stallEvents === 0 ? '#52c41a' : '#ff4d4f';
        }
    };
    
    // 初始更新狀態
    updateStatus();
    
    // 每秒更新一次狀態
    const statusInterval = setInterval(updateStatus, 1000);
    
    // 將面板添加到控制欄
    controlBar.appendChild(optimizerPanel);
    
    console.log('[播放優化控制面板] 創建完成');
}

// 創建自適應畫質控制面板
function createAdaptiveQualityPanel(controlBar, adaptiveQuality) {
    // 創建自適應畫質控制面板
    const adaptivePanel = document.createElement('div');
    adaptivePanel.id = 'bilibili-lite-adaptive-panel';
    adaptivePanel.style.marginTop = '12px';
    adaptivePanel.style.border = '1px solid #d9d9d9';
    adaptivePanel.style.borderRadius = '6px';
    adaptivePanel.style.backgroundColor = '#fff9e6';
    adaptivePanel.style.overflow = 'hidden';
    
    // 創建標題欄
    const headerBar = document.createElement('div');
    headerBar.style.padding = '8px 12px';
    headerBar.style.backgroundColor = '#fff2cc';
    headerBar.style.cursor = 'pointer';
    headerBar.style.display = 'flex';
    headerBar.style.alignItems = 'center';
    headerBar.style.justifyContent = 'space-between';
    headerBar.style.userSelect = 'none';
      const titleText = document.createElement('span');
    titleText.textContent = '自適應畫質';
    titleText.style.fontWeight = 'bold';
    titleText.style.color = '#fa8c16';
    
    // 創建右側控制區域
    const rightControls = document.createElement('div');
    rightControls.style.display = 'flex';
    rightControls.style.alignItems = 'center';
    rightControls.style.gap = '8px';
    
    // 創建啟用/禁用開關
    const enableSwitch = document.createElement('label');
    enableSwitch.style.display = 'flex';
    enableSwitch.style.alignItems = 'center';
    enableSwitch.style.gap = '4px';
    enableSwitch.style.fontSize = '12px';
    enableSwitch.style.cursor = 'pointer';
    enableSwitch.style.color = '#666';
    
    const enableCheckbox = document.createElement('input');
    enableCheckbox.type = 'checkbox';
    enableCheckbox.checked = adaptiveQuality.config.enabled;
    enableCheckbox.style.margin = '0';
    
    const enableLabel = document.createElement('span');
    enableLabel.textContent = '啟用';
    
    enableSwitch.appendChild(enableCheckbox);
    enableSwitch.appendChild(enableLabel);
    
    const toggleIcon = document.createElement('span');
    toggleIcon.textContent = '▼';
    toggleIcon.style.transition = 'transform 0.2s';
    toggleIcon.style.color = '#666';
    toggleIcon.style.marginLeft = '8px';
    
    rightControls.appendChild(enableSwitch);
    rightControls.appendChild(toggleIcon);
    
    headerBar.appendChild(titleText);
    headerBar.appendChild(rightControls);
    
    // 創建內容區域
    const contentArea = document.createElement('div');
    contentArea.style.padding = '12px';
    contentArea.style.display = 'block';
    contentArea.style.transition = 'all 0.3s ease';
    
    // 創建狀態顯示區域
    const statusGrid = document.createElement('div');
    statusGrid.style.display = 'grid';
    statusGrid.style.gridTemplateColumns = '1fr 1fr 1fr';
    statusGrid.style.gap = '12px';
    statusGrid.style.marginBottom = '16px';
    
    // 當前畫質卡片
    const qualityCard = document.createElement('div');
    qualityCard.style.padding = '12px';
    qualityCard.style.backgroundColor = '#fff';
    qualityCard.style.borderRadius = '4px';
    qualityCard.style.border = '1px solid #e1e3e6';
    qualityCard.style.textAlign = 'center';
    
    const qualityTitle = document.createElement('div');
    qualityTitle.textContent = '當前畫質';
    qualityTitle.style.fontSize = '12px';
    qualityTitle.style.color = '#666';
    qualityTitle.style.marginBottom = '6px';
    
    const currentQuality = document.createElement('div');
    currentQuality.id = 'current-quality';
    currentQuality.textContent = '1080P';
    currentQuality.style.fontSize = '14px';
    currentQuality.style.fontWeight = 'bold';
    currentQuality.style.color = '#fa8c16';
    
    qualityCard.appendChild(qualityTitle);
    qualityCard.appendChild(currentQuality);
    
    // 調整次數卡片
    const adjustCard = document.createElement('div');
    adjustCard.style.padding = '12px';
    adjustCard.style.backgroundColor = '#fff';
    adjustCard.style.borderRadius = '4px';
    adjustCard.style.border = '1px solid #e1e3e6';
    adjustCard.style.textAlign = 'center';
    
    const adjustTitle = document.createElement('div');
    adjustTitle.textContent = '調整次數';
    adjustTitle.style.fontSize = '12px';
    adjustTitle.style.color = '#666';
    adjustTitle.style.marginBottom = '6px';
    
    const adjustCount = document.createElement('div');
    adjustCount.id = 'adjust-count';
    adjustCount.textContent = '0';
    adjustCount.style.fontSize = '14px';
    adjustCount.style.fontWeight = 'bold';
    adjustCount.style.color = '#52c41a';
    
    adjustCard.appendChild(adjustTitle);
    adjustCard.appendChild(adjustCount);
    
    // 自適應狀態卡片
    const statusCard = document.createElement('div');
    statusCard.style.padding = '12px';
    statusCard.style.backgroundColor = '#fff';
    statusCard.style.borderRadius = '4px';
    statusCard.style.border = '1px solid #e1e3e6';
    statusCard.style.textAlign = 'center';
    
    const statusTitle = document.createElement('div');
    statusTitle.textContent = '自適應狀態';
    statusTitle.style.fontSize = '12px';
    statusTitle.style.color = '#666';
    statusTitle.style.marginBottom = '6px';
    
    const adaptiveStatus = document.createElement('div');
    adaptiveStatus.id = 'adaptive-status';
    adaptiveStatus.textContent = '監控中';
    adaptiveStatus.style.fontSize = '14px';
    adaptiveStatus.style.fontWeight = 'bold';
    adaptiveStatus.style.color = '#52c41a';
    
    statusCard.appendChild(statusTitle);
    statusCard.appendChild(adaptiveStatus);
    
    statusGrid.appendChild(qualityCard);
    statusGrid.appendChild(adjustCard);
    statusGrid.appendChild(statusCard);
    
    // 創建設置控制
    const settingsArea = document.createElement('div');
    settingsArea.style.display = 'grid';
    settingsArea.style.gridTemplateColumns = '1fr 1fr';
    settingsArea.style.gap = '16px';
    
    // 卡頓閾值設置
    const stallSettings = document.createElement('div');
    stallSettings.style.padding = '12px';
    stallSettings.style.backgroundColor = '#fff';
    stallSettings.style.borderRadius = '4px';
    stallSettings.style.border = '1px solid #e1e3e6';
    
    const stallTitle = document.createElement('h4');
    stallTitle.textContent = '卡頓閾值';
    stallTitle.style.margin = '0 0 12px 0';
    stallTitle.style.color = '#fa8c16';
    stallTitle.style.fontSize = '14px';
    stallTitle.style.fontWeight = 'bold';
    
    const stallRow = document.createElement('div');
    stallRow.style.display = 'flex';
    stallRow.style.alignItems = 'center';
    stallRow.style.gap = '8px';
    stallRow.style.fontSize = '12px';
    
    const stallLabel = document.createElement('span');
    stallLabel.textContent = '連續卡頓次數:';
    stallLabel.style.minWidth = '80px';
    
    const stallSlider = document.createElement('input');
    stallSlider.type = 'range';
    stallSlider.min = '1';
    stallSlider.max = '10';
    stallSlider.value = adaptiveQuality.config.stallThreshold;
    stallSlider.style.flex = '1';
    
    const stallValue = document.createElement('span');
    stallValue.textContent = `${adaptiveQuality.config.stallThreshold}次`;
    stallValue.style.minWidth = '30px';
    stallValue.style.color = '#fa8c16';
    stallValue.style.fontWeight = 'bold';
    
    stallRow.appendChild(stallLabel);
    stallRow.appendChild(stallSlider);
    stallRow.appendChild(stallValue);
    
    stallSettings.appendChild(stallTitle);
    stallSettings.appendChild(stallRow);
    
    // 緩衝閾值設置
    const bufferSettings = document.createElement('div');
    bufferSettings.style.padding = '12px';
    bufferSettings.style.backgroundColor = '#fff';
    bufferSettings.style.borderRadius = '4px';
    bufferSettings.style.border = '1px solid #e1e3e6';
    
    const bufferTitle = document.createElement('h4');
    bufferTitle.textContent = '緩衝閾值';
    bufferTitle.style.margin = '0 0 12px 0';
    bufferTitle.style.color = '#52c41a';
    bufferTitle.style.fontSize = '14px';
    bufferTitle.style.fontWeight = 'bold';
    
    const bufferRow = document.createElement('div');
    bufferRow.style.display = 'flex';
    bufferRow.style.alignItems = 'center';
    bufferRow.style.gap = '8px';
    bufferRow.style.fontSize = '12px';
    
    const bufferLabel = document.createElement('span');
    bufferLabel.textContent = '提升畫質緩衝:';
    bufferLabel.style.minWidth = '80px';
    
    const bufferSlider = document.createElement('input');
    bufferSlider.type = 'range';
    bufferSlider.min = '5';
    bufferSlider.max = '30';
    bufferSlider.value = adaptiveQuality.config.bufferThreshold;
    bufferSlider.style.flex = '1';
    
    const bufferValue = document.createElement('span');
    bufferValue.textContent = `${adaptiveQuality.config.bufferThreshold}秒`;
    bufferValue.style.minWidth = '30px';
    bufferValue.style.color = '#52c41a';
    bufferValue.style.fontWeight = 'bold';
    
    bufferRow.appendChild(bufferLabel);
    bufferRow.appendChild(bufferSlider);
    bufferRow.appendChild(bufferValue);
    
    bufferSettings.appendChild(bufferTitle);
    bufferSettings.appendChild(bufferRow);
    
    settingsArea.appendChild(stallSettings);
    settingsArea.appendChild(bufferSettings);
    
    // 調整歷史
    const historyArea = document.createElement('div');
    historyArea.style.marginTop = '16px';
    historyArea.style.padding = '12px';
    historyArea.style.backgroundColor = '#fff';
    historyArea.style.borderRadius = '4px';
    historyArea.style.border = '1px solid #e1e3e6';
    
    const historyTitle = document.createElement('h4');
    historyTitle.textContent = '調整歷史';
    historyTitle.style.margin = '0 0 12px 0';
    historyTitle.style.color = '#722ed1';
    historyTitle.style.fontSize = '14px';
    historyTitle.style.fontWeight = 'bold';
    
    const historyContent = document.createElement('div');
    historyContent.id = 'adaptive-history';
    historyContent.style.fontSize = '12px';
    historyContent.style.lineHeight = '1.6';
    historyContent.style.maxHeight = '100px';
    historyContent.style.overflowY = 'auto';
    historyContent.style.color = '#666';
    historyContent.textContent = '暫無調整記錄';
    
    historyArea.appendChild(historyTitle);
    historyArea.appendChild(historyContent);
    
    contentArea.appendChild(statusGrid);
    contentArea.appendChild(settingsArea);
    contentArea.appendChild(historyArea);
      // 組裝面板
    adaptivePanel.appendChild(headerBar);
    adaptivePanel.appendChild(contentArea);
    
    // 事件處理
    let isCollapsed = false;
    
    // 啟用/禁用開關事件（阻止冒泡到標題欄）
    enableSwitch.addEventListener('click', (e) => {
        e.stopPropagation();
    });
      enableCheckbox.addEventListener('change', (e) => {
        const isEnabled = e.target.checked;
        
        if (isEnabled) {
            adaptiveQuality.enable();
            console.log('[自適應畫質] 已啟用');
        } else {
            adaptiveQuality.stop();
            console.log('[自適應畫質] 已禁用');
        }
        
        // 更新面板樣式
        contentArea.style.opacity = isEnabled ? '1' : '0.6';
        titleText.style.color = isEnabled ? '#fa8c16' : '#999';
    });
    
    // 標題欄點擊事件（展開/折疊）
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
    
    // 設置事件
    stallSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        stallValue.textContent = `${value}次`;
        adaptiveQuality.config.stallThreshold = value;
        console.log('[自適應畫質] 卡頓閾值:', value + '次');
    });
    
    bufferSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        bufferValue.textContent = `${value}秒`;
        adaptiveQuality.config.bufferThreshold = value;
        console.log('[自適應畫質] 緩衝閾值:', value + '秒');
    });
    
    // 定期更新狀態
    const updateStatus = () => {
        const stats = adaptiveQuality.getStats();
        
        // 更新當前畫質
        const qualityElement = document.getElementById('current-quality');
        if (qualityElement) {
            const currentQn = stats.currentQuality;
            const qualityLevel = adaptiveQuality.qualityLevels.find(q => q.qn === currentQn);
            qualityElement.textContent = qualityLevel ? qualityLevel.name : currentQn.toString();
        }
        
        // 更新調整次數
        const adjustElement = document.getElementById('adjust-count');
        if (adjustElement) {
            adjustElement.textContent = stats.adjustHistory.length.toString();
        }
        
        // 更新自適應狀態
        const statusElement = document.getElementById('adaptive-status');
        if (statusElement) {
            if (adaptiveQuality.config.enabled) {
                if (stats.isAdjusting) {
                    statusElement.textContent = '調整中';
                    statusElement.style.color = '#fa8c16';
                } else {
                    statusElement.textContent = '監控中';
                    statusElement.style.color = '#52c41a';
                }
            } else {
                statusElement.textContent = '已停用';
                statusElement.style.color = '#666';
            }
        }
        
        // 更新調整歷史
        const historyElement = document.getElementById('adaptive-history');
        if (historyElement) {
            const history = stats.adjustHistory.slice(-5); // 顯示最近5次調整
            if (history.length > 0) {
                historyElement.innerHTML = history.map(record => {
                    const time = new Date(record.timestamp).toLocaleTimeString();
                    const fromQuality = adaptiveQuality.qualityLevels.find(q => q.qn === record.from);
                    const toQuality = adaptiveQuality.qualityLevels.find(q => q.qn === record.to);
                    const fromName = fromQuality ? fromQuality.name : record.from;
                    const toName = toQuality ? toQuality.name : record.to;
                    const direction = record.direction === 'lower' ? '↓' : '↑';
                    return `<div>${time} ${fromName} ${direction} ${toName} (${record.reason})</div>`;
                }).join('');
            } else {
                historyElement.textContent = '暫無調整記錄';
            }
        }
    };
    
    // 初始更新狀態
    updateStatus();
    
    // 每2秒更新一次狀態
    const statusInterval = setInterval(updateStatus, 2000);
    
    // 將面板添加到控制欄
    controlBar.appendChild(adaptivePanel);
    
    console.log('[自適應畫質控制面板] 創建完成');
}

// 導出必要的函數
export { 
    replacePlayer,
    reloadPlayerWithNewCDN,
    createControlBar,
    createPreloadControlPanel,
    createOptimizerControlPanel,
    createAdaptiveQualityPanel
};