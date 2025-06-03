// player-ui.js - 專門處理播放器界面的實現

import { qualityMap, audioQualityMap, cdnOptimizer } from './api.js';
import { StreamMonitor, formatBytes, formatBitrate } from './utils.js';

/**
 * 創建控制欄 HTML 結構
 * @param {HTMLElement} container - 放置控制欄的容器元素
 * @returns {HTMLElement} - 創建的控制欄元素
 */
export function createControlBarStructure(container) {
    // 檢查是否已存在控制欄
    let controlBar = document.getElementById('bilibili-lite-controlbar');
    if (controlBar) {
        console.log('[LitePlayer UI] 控制欄已存在，清空內容');
        while (controlBar.firstChild) {
            controlBar.removeChild(controlBar.firstChild);
        }
        return controlBar;
    }

    // 創建控制欄
    controlBar = document.createElement('div');
    controlBar.className = 'lite-controlbar';
    controlBar.id = 'bilibili-lite-controlbar';
    
    // 創建流信息面板
    const streamInfoPanel = document.createElement('div');
    streamInfoPanel.className = 'collapsible-panel';
    streamInfoPanel.id = 'stream-info-panel';
    
    // 面板頭部
    const panelHeader = document.createElement('div');
    panelHeader.className = 'panel-header';
    
    const panelTitle = document.createElement('span');
    panelTitle.className = 'panel-title';
    panelTitle.textContent = '流資訊詳情';
    
    const panelToggle = document.createElement('span');
    panelToggle.className = 'panel-toggle';
    panelToggle.textContent = '▼';
    
    panelHeader.appendChild(panelTitle);
    panelHeader.appendChild(panelToggle);
    
    // 面板內容
    const panelContent = document.createElement('div');
    panelContent.className = 'panel-content';
    
    // 信息網格
    const infoGrid = document.createElement('div');
    infoGrid.className = 'info-grid';
    
    // 視頻資訊列
    const videoColumn = document.createElement('div');
    videoColumn.className = 'info-column';
    
    const videoTitle = document.createElement('h4');
    videoTitle.className = 'info-title video-title';
    videoTitle.textContent = '視頻流資訊';
    
    const videoDetails = document.createElement('div');
    videoDetails.id = 'video-details';
    videoDetails.className = 'info-details';
    videoDetails.innerHTML = '<div style="color: #999;">無詳細視頻流資訊</div>';
    
    videoColumn.appendChild(videoTitle);
    videoColumn.appendChild(videoDetails);
    
    // 音頻資訊列
    const audioColumn = document.createElement('div');
    audioColumn.className = 'info-column';
    
    const audioTitle = document.createElement('h4');
    audioTitle.className = 'info-title audio-title';
    audioTitle.textContent = '音頻流資訊';
    
    const audioDetails = document.createElement('div');
    audioDetails.id = 'audio-details';
    audioDetails.className = 'info-details';
    audioDetails.innerHTML = '<div style="color: #999;">無詳細音頻流資訊</div>';
    
    audioColumn.appendChild(audioTitle);
    audioColumn.appendChild(audioDetails);
    
    // 添加到網格
    infoGrid.appendChild(videoColumn);
    infoGrid.appendChild(audioColumn);
    
    // 下載統計區域
    const statsColumn = document.createElement('div');
    statsColumn.className = 'info-column';
    statsColumn.style.marginTop = '16px';
    
    const statsTitle = document.createElement('h4');
    statsTitle.className = 'info-title stats-title';
    statsTitle.textContent = '下載統計';
    
    const statsDetails = document.createElement('div');
    statsDetails.id = 'stats-details';
    statsDetails.className = 'info-details';
    statsDetails.style.display = 'grid';
    statsDetails.style.gridTemplateColumns = '1fr 1fr';
    statsDetails.style.gap = '8px';
    statsDetails.innerHTML = '<div style="color: #999;">流監控不可用</div>';
    
    statsColumn.appendChild(statsTitle);
    statsColumn.appendChild(statsDetails);
    
    // 組裝面板內容
    panelContent.appendChild(infoGrid);
    panelContent.appendChild(statsColumn);
    
    // 組裝面板
    streamInfoPanel.appendChild(panelHeader);
    streamInfoPanel.appendChild(panelContent);
    
    // 添加到控制欄
    controlBar.appendChild(streamInfoPanel);
    
    // 添加樣式
    if (!document.getElementById('bilibili-lite-ui-styles')) {
        const style = document.createElement('style');
        style.id = 'bilibili-lite-ui-styles';
        style.innerHTML = `
            .lite-controlbar {
                margin: 16px 0;
                display: flex;
                flex-direction: column;
                gap: 12px;
                background-color: white;
                border-radius: 8px;
                padding: 16px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.05);
            }
            
            .control-row {
                display: flex;
                align-items: center;
                gap: 24px;
                flex-wrap: wrap;
            }
            
            .control-group {
                display: flex;
                align-items: center;
            }
            
            .control-group span {
                color: #888;
                margin-right: 8px;
                font-size: 14px;
            }
            
            .collapsible-panel {
                margin-top: 12px;
                border: 1px solid #e3e5e7;
                border-radius: 6px;
                background-color: #f8f9fa;
                overflow: hidden;
            }
            
            .panel-header {
                padding: 10px 12px;
                background-color: #e8e9ea;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: space-between;
                user-select: none;
            }
            
            .panel-title {
                font-weight: bold;
                color: #333;
            }
            
            .panel-toggle {
                transition: transform 0.2s;
            }
            
            .panel-content {
                padding: 16px;
                display: block;
                transition: all 0.3s ease;
            }
            
            .info-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 16px;
            }
            
            @media (max-width: 768px) {
                .info-grid {
                    grid-template-columns: 1fr;
                }
            }
            
            .info-column {
                padding: 16px;
                background-color: #fff;
                border-radius: 4px;
                border: 1px solid #e1e3e6;
            }
            
            .info-title {
                margin: 0 0 16px 0;
                font-size: 16px;
                font-weight: bold;
            }
            
            .video-title {
                color: #00a1d6;
            }
            
            .audio-title {
                color: #52c41a;
            }
            
            .stats-title {
                color: #722ed1;
            }
        `;
        document.head.appendChild(style);
    }
    
    // 添加到容器
    container.appendChild(controlBar);
    console.log('[LitePlayer UI] 已創建控制欄結構');
    
    // 綁定面板事件處理器
    bindPanelEvents();
    
    return controlBar;
}

/**
 * 創建播放器核心 UI 元素
 * @param {Object} playInfo - 播放信息對象
 * @param {HTMLElement} container - 播放器容器元素
 * @param {Object} options - 附加選項
 * @returns {Object} - 包含創建的視頻、音頻和加載動畫元素
 */
export function createPlayerElements(playInfo, container, options = {}) {
    const elements = {
        video: null,
        audio: null,
        loading: null,
    };

    // 清空容器
    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }

    // 創建視頻元素
    const video = document.createElement('video');
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
        showPlayerError(container, '視頻加載失敗，請嘗試刷新頁面或切換畫質');
    };

    // 設置視頻源
    if (playInfo.dash) {
        const dash = playInfo.rawDash;
        const videoUrl = dash.video[0]?.baseUrl || dash.video[0]?.base_url;
        if (videoUrl) {
            // 添加 CDN 優化
            const optimizedVideoUrl = cdnOptimizer.optimizeVideoUrl(videoUrl);
            video.src = optimizedVideoUrl;
        }
    }

    // 創建音頻元素
    const audio = document.createElement('audio');
    audio.preload = 'auto';
    audio.style.display = 'none';
    audio.crossOrigin = 'anonymous';

    // 添加音頻錯誤處理
    audio.onerror = (e) => {
        console.error('[LitePlayer] 音頻加載失敗:', e);
    };

    // 設置音頻源
    if (playInfo.dash) {
        const dash = playInfo.rawDash;
        const audioUrl = dash.audio[0]?.baseUrl || dash.audio[0]?.base_url;
        if (audioUrl) {
            // 添加 CDN 優化
            const optimizedAudioUrl = cdnOptimizer.optimizeVideoUrl(audioUrl);
            audio.src = optimizedAudioUrl;
        }
    }

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

    // 加入動畫樣式
    if (!document.getElementById('bilibili-lite-styles')) {
        const style = document.createElement('style');
        style.id = 'bilibili-lite-styles';
        style.innerHTML = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }

    // 添加元素到容器
    container.appendChild(video);
    container.appendChild(audio);
    container.appendChild(loading);

    // 保存引用
    elements.video = video;
    elements.audio = audio;
    elements.loading = loading;

    return elements;
}

/**
 * 顯示播放器錯誤信息
 * @param {HTMLElement} container - 播放器容器
 * @param {string} message - 錯誤信息
 */
export function showPlayerError(container, message) {
    const errorDiv = document.createElement('div');
    errorDiv.style.position = 'absolute';
    errorDiv.style.top = '50%';
    errorDiv.style.left = '50%';
    errorDiv.style.transform = 'translate(-50%, -50%)';
    errorDiv.style.color = 'white';
    errorDiv.style.background = 'rgba(0,0,0,0.8)';
    errorDiv.style.padding = '20px';
    errorDiv.style.borderRadius = '8px';
    errorDiv.innerHTML = message;
    container.appendChild(errorDiv);
}

/**
 * 創建控制欄
 * @param {Object} playInfo - 播放信息對象
 * @param {Function} mainReload - 重新加載播放器的回調函數
 * @param {StreamMonitor} monitor - 流監控實例
 */
export function createControlBar(playInfo, mainReload, monitor = null) {
    // 查找控制欄元素
    const controlBar = document.getElementById('bilibili-lite-controlbar');
    
    if (!controlBar) {
        console.warn('[LitePlayer UI] 控制欄元素未找到');
        return;
    }
    
    const newPlayer = document.getElementById('bilibili-lite-player');
    
    // 只清空第一層子元素但保留面板（如流信息面板）
    const children = Array.from(controlBar.children);
    for (const child of children) {
        if (!child.id || child.id !== 'stream-info-panel') {
            controlBar.removeChild(child);
        }
    }

    // 第一行：畫質和音質控制
    const controlRow = document.createElement('div');
    controlRow.className = 'control-row';

    // 畫質切換（下拉選擇器）
    const qnGroup = document.createElement('div');
    qnGroup.className = 'control-group';
    qnGroup.innerHTML = '<span>畫質</span>';
    
    const qnSelect = document.createElement('select');
    qnSelect.id = 'quality-selector';
    
    (playInfo.acceptQn || [playInfo.qn]).forEach(qn => {
        const opt = document.createElement('option');
        opt.value = qn;
        let displayText = qualityMap[qn] || qn;
        if (qn >= 100 && qn <= 127) {
            displayText += ' (大會員)';
        } else if (qn === 74) {
            displayText += ' (限免)';
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
        console.log('[LitePlayer UI] 畫質切換到:', val, 'fnval:', fnval, 'codec:', codec);
        setTimeout(() => {
            mainReload(val, playInfo.audioQuality, fnval, codec);
        }, 300);
    };
    
    // 顯示 fnval/codec 狀態
    const statusDiv = document.createElement('div');
    statusDiv.id = 'format-status';
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
        audioGroup.className = 'control-group';
        audioGroup.style.marginLeft = '24px';
        audioGroup.innerHTML = '<span>音質</span>';
        
        const audioSelect = document.createElement('select');
        audioSelect.id = 'audio-quality-selector';

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
            console.log('[LitePlayer UI] 音質切換到:', val);

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
                console.error('[LitePlayer UI] 音質切換失敗:', error);
                // 恢復選擇器
                audioSelect.disabled = false;
                if (loading) {
                    loading.style.display = 'none';
                }
            }
        };
        
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

    console.log('[LitePlayer UI] 控制欄創建完成');
}

/**
 * 顯示fnval和codec狀態
 * @param {HTMLElement} statusDiv - 狀態顯示元素
 */
function showFnvalCodecStatus(statusDiv) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['bilibili-lite-fnval', 'bilibili-lite-codec'], (result) => {
            const fnval = parseInt(result['bilibili-lite-fnval'] || '16');
            const codec = result['bilibili-lite-codec'] || '';
            updateFnvalDisplay(fnval, codec, statusDiv);
        });
    } else {
        // fallback
        const fnval = parseInt(localStorage.getItem('bilibili-lite-fnval') || '16');
        const codec = localStorage.getItem('bilibili-lite-codec') || '';
        updateFnvalDisplay(fnval, codec, statusDiv);
    }
}

/**
 * 更新fnval顯示
 * @param {number} fnval - fnval值
 * @param {string} codec - 編碼
 * @param {HTMLElement} statusDiv - 狀態顯示元素
 */
function updateFnvalDisplay(fnval, codec, statusDiv) {
    let fnvalText = [];
    if (fnval & 16) fnvalText.push('DASH');
    if (fnval & 64) fnvalText.push('4K');
    if (fnval & 128) fnvalText.push('杜比視界');
    if (fnval & 256) fnvalText.push('HDR');
    if (fnval & 512) fnvalText.push('杜比全景聲');
    if (fnval & 1024) fnvalText.push('8K');
    if (fnval & 2048) fnvalText.push('杜比高偕');
    
    statusDiv.textContent = `格式: ${fnvalText.join('+') || 'DASH'}，編碼: ${codec || '自動'}（請點插件圖標設定）`;
}

/**
 * 創建流信息顯示面板
 * @param {HTMLElement} controlBar - 控制欄元素
 * @param {Object} playInfo - 播放信息對象
 * @param {StreamMonitor} monitor - 流監控實例
 */
export function createStreamInfoPanel(controlBar, playInfo, monitor) {
    const panelDiv = document.getElementById('stream-info-panel');
    
    if (!panelDiv) {
        console.warn('[LitePlayer UI] 流信息面板元素未找到');
        return;
    }
    
    const videoDetails = document.getElementById('video-details');
    const audioDetails = document.getElementById('audio-details');
    const statsDetails = document.getElementById('stats-details');
    
    if (!videoDetails || !audioDetails || !statsDetails) {
        console.warn('[LitePlayer UI] 流信息面板內部元素未找到');
        return;
    }

    // 填充流信息
    function updateStreamInfo() {
        const video = document.querySelector('#bilibili-lite-player video');
        const audio = document.querySelector('#bilibili-lite-player audio');

        if (!video || !audio) {
            console.warn('[LitePlayer UI] 無法更新流信息，因為 video 或 audio 元素未找到');
            return;
        }

        // 計算視頻緩存時間
        let videoBufferedTime = calculateBufferedTime(video);
        // 計算音頻緩存時間
        let audioBufferedTime = calculateBufferedTime(audio);

        // 視頻信息
        if (playInfo.videoInfo) {
            const vInfo = playInfo.videoInfo;

            videoDetails.innerHTML = `
                <div style="margin-bottom: 8px;"><strong>編碼格式:</strong> <span style="color: #1890ff;">${vInfo.codec || 'N/A'}</span></div>
                <div style="margin-bottom: 8px;"><strong>解析度:</strong> <span style="color: #1890ff;">${vInfo.width || 'N/A'}x${vInfo.height || 'N/A'}</span></div>
                <div style="margin-bottom: 8px;"><strong>幀率:</strong> <span style="color: #1890ff;">${vInfo.frameRate || 'N/A'} fps</span></div>
                <div style="margin-bottom: 8px;"><strong>碼率:</strong> <span style="color: #1890ff;">${formatBitrate(vInfo.bandwidth || 0)}</span></div>
                <div style="margin-bottom: 8px;"><strong>文件大小:</strong> <span style="color: #1890ff;">${formatBytes(vInfo.size || 0)}</span></div>
                <div style="margin-bottom: 8px;"><strong>MIME類型:</strong> <span style="color: #666; font-family: monospace; font-size: 11px;">${vInfo.mimeType || 'N/A'}</span></div>
                <div><strong>CDN節點:</strong> <span style="color: #fa8c16; font-weight: bold; word-break: break-all; max-width: 300px; display: inline-block;">${video.src || 'N/A'}</span></div>
                <div style="margin-top: 8px; border-top: 1px solid #e1e3e6; padding-top: 8px;">
                    <strong>緩存信息:</strong>
                    <div style="color: #333; font-size: 12px; margin-top: 4px;">
                        <div>視頻緩存剩餘時間: <span style="color: #1890ff; font-weight: bold;">${videoBufferedTime.toFixed(2)} 秒</span></div>
                        <div style="color: #888; font-size: 11px;">當前播放時間: ${video.currentTime.toFixed(2)}s</div>
                    </div>
                </div>
            `;
        } else {
            videoDetails.innerHTML = '<div style="color: #999;">無詳細視頻流信息</div>';
        }

        // 音頻信息
        if (playInfo.audioInfo) {
            const aInfo = playInfo.audioInfo;
            audioDetails.innerHTML = `
                <div style="margin-bottom: 8px;"><strong>編碼格式:</strong> <span style="color: #52c41a;">${aInfo.codec || 'N/A'}</span></div>
                <div style="margin-bottom: 8px;"><strong>聲道:</strong> <span style="color: #52c41a;">${aInfo.channels || 'N/A'}</span></div>
                <div style="margin-bottom: 8px;"><strong>採樣率:</strong> <span style="color: #52c41a;">${aInfo.sampleRate || 'N/A'} Hz</span></div>
                <div style="margin-bottom: 8px;"><strong>碼率:</strong> <span style="color: #52c41a;">${formatBitrate(aInfo.bandwidth || 0)}</span></div>
                <div style="margin-bottom: 8px;"><strong>文件大小:</strong> <span style="color: #52c41a;">${formatBytes(aInfo.size || 0)}</span></div>
                <div style="margin-bottom: 8px;"><strong>MIME類型:</strong> <span style="color: #666; font-family: monospace; font-size: 11px;">${aInfo.mimeType || 'N/A'}</span></div>
                <div><strong>CDN節點:</strong> <span style="color: #fa8c16; font-weight: bold; word-break: break-all; max-width: 300px; display: inline-block;">${audio.src || 'N/A'}</span></div>
                <div style="margin-top: 8px; border-top: 1px solid #e1e3e6; padding-top: 8px;">
                    <strong>緩存信息:</strong>
                    <div style="color: #333; font-size: 12px; margin-top: 4px;">
                        <div>音頻緩存剩餘時間: <span style="color: #52c41a; font-weight: bold;">${audioBufferedTime.toFixed(2)} 秒</span></div>
                        <div style="color: #888; font-size: 11px;">當前播放時間: ${audio.currentTime.toFixed(2)}s</div>
                    </div>
                </div>
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

    // 初始更新信息
    updateStreamInfo();

    // 定期更新緩存時間信息
    const updateInterval = setInterval(() => {
        const video = document.querySelector('#bilibili-lite-player video');
        const audio = document.querySelector('#bilibili-lite-player audio');

        if (!video || !audio) {
            clearInterval(updateInterval);
            return;
        }

        updateStreamInfo();
    }, 1000); // 每秒更新一次

    console.log('[LitePlayer UI] 流信息面板已創建');
    
    return () => {
        clearInterval(updateInterval);
        console.log('[LitePlayer UI] 流信息面板定時器已清理');
    };
}

/**
 * 計算媒體元素的緩存時間
 * @param {HTMLMediaElement} media - 媒體元素(video或audio)
 * @returns {number} 緩存時間(秒)
 */
function calculateBufferedTime(media) {
    let bufferedTime = 0;
    try {
        const buffered = media.buffered;
        if (buffered.length > 0) {
            // 找到包含當前播放時間的緩衝區間
            for (let i = 0; i < buffered.length; i++) {
                if (media.currentTime >= buffered.start(i) && media.currentTime <= buffered.end(i)) {
                    bufferedTime = buffered.end(i) - media.currentTime;
                    break;
                }
            }
            // 如果沒有找到包含當前時間的區間，使用最後一個區間
            if (bufferedTime === 0 && buffered.length > 0) {
                const lastIndex = buffered.length - 1;
                if (media.currentTime <= buffered.end(lastIndex)) {
                    bufferedTime = buffered.end(lastIndex) - media.currentTime;
                }
            }
        }
    } catch (e) {
        console.warn('[LitePlayer UI] 計算緩存時間失敗:', e);
    }
    return bufferedTime;
}

/**
 * 創建預加載控制面板
 * @param {HTMLElement} controlBar - 控制欄元素
 * @param {Object} preloader - 預加載器實例
 */
export function createPreloadControlPanel(controlBar, preloader) {
    // 這部分代碼尚未完成，可以在後續實現
    console.log('[LitePlayer UI] 預加載控制面板創建（功能尚未實現）');
}

/**
 * 顯示CDN切換的加載提示
 * @param {HTMLElement} playerElement - 播放器元素
 * @param {string} newCDN - 新的CDN名稱
 * @returns {HTMLElement} 創建的提示元素
 */
export function showCDNSwitchingIndicator(playerElement, newCDN) {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading-indicator';
    loadingDiv.innerHTML = `
        <div class="loading-spinner"></div>
        <div style="margin-top: 10px;">正在切換到 ${newCDN.toUpperCase()} CDN...</div>
    `;
    
    playerElement.appendChild(loadingDiv);
    return loadingDiv;
}

/**
 * 初始化播放器界面
 * 可以在主頁面載入時調用此函數
 */
export function initializePlayerInterface() {
    // 檢查是否已經存在界面元素
    if (!document.getElementById('bilibili-lite-player')) {
        console.warn('[LitePlayer UI] 播放器元素未找到，無法初始化界面');
        return;
    }
    
    // 綁定事件處理器
    bindPanelEvents();
    
    console.log('[LitePlayer UI] 播放器界面初始化完成');
}

/**
 * 綁定面板事件
 */
function bindPanelEvents() {
    const panels = document.querySelectorAll('.collapsible-panel');
    
    panels.forEach(panel => {
        const header = panel.querySelector('.panel-header');
        const content = panel.querySelector('.panel-content');
        const toggle = panel.querySelector('.panel-toggle');
        const title = panel.querySelector('.panel-title');
        
        let isCollapsed = false;
        
        header.addEventListener('click', () => {
            isCollapsed = !isCollapsed;
            if (isCollapsed) {
                content.style.display = 'none';
                toggle.style.transform = 'rotate(-90deg)';
                
                // 更新標題文字
                if (panel.id === 'stream-info-panel') {
                    title.textContent = '流資訊詳情 (已摺疊)';
                }
            } else {
                content.style.display = 'block';
                toggle.style.transform = 'rotate(0deg)';
                
                // 恢復標題文字
                if (panel.id === 'stream-info-panel') {
                    title.textContent = '流資訊詳情';
                }
            }
        });
    });
}
