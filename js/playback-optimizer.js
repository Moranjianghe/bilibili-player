// playback-optimizer.js - 播放體驗優化器
/**
 * 播放體驗優化器
 * 提供多種策略來減少卡頓，提升播放流暢度
 */
class PlaybackOptimizer {
    constructor() {
        this.config = {
            // 緩衝設置
            buffer: {
                targetDuration: 30, // 目標緩衝時長（秒）
                maxDuration: 60,    // 最大緩衝時長（秒）  
                minDuration: 3,     // 最小緩衝時長（秒）
                rebufferGoal: 5     // 重新緩衝目標（秒）
            },
            
            // 網絡適應
            adaptive: {
                enabled: true,
                speedTest: true,
                qualityAdjust: true,
                lowLatency: false
            },
            
            // 播放器優化
            player: {
                preload: 'auto',
                crossOrigin: 'anonymous',
                playsInline: true,
                disablePictureInPicture: false
            }
        };
        
        this.state = {
            videoElement: null,
            audioElement: null,
            networkSpeed: 0,
            currentQuality: null,
            bufferHealth: 0,
            stallCount: 0,
            lastStallTime: 0,
            isOptimizing: false
        };
        
        this.stats = {
            stallEvents: 0,
            totalStallTime: 0,
            avgNetworkSpeed: 0,
            bufferEvents: 0,
            qualityChanges: 0
        };
        
        console.log('[播放優化器] 初始化完成');
    }
    
    /**
     * 初始化優化器
     * @param {HTMLVideoElement} videoElement - 視頻元素
     * @param {HTMLAudioElement} audioElement - 音頻元素（可選）
     * @param {Object} options - 配置選項
     */
    initialize(videoElement, audioElement = null, options = {}) {
        this.state.videoElement = videoElement;
        this.state.audioElement = audioElement;
        
        // 應用配置
        Object.assign(this.config, options);
        
        // 優化播放器設置
        this.optimizePlayerSettings();
        
        // 設置事件監聽器
        this.setupEventListeners();
        
        // 開始網絡監控
        this.startNetworkMonitoring();
        
        // 開始緩衝監控
        this.startBufferMonitoring();
        
        console.log('[播放優化器] 初始化完成，開始優化播放體驗');
    }
    
    /**
     * 優化播放器設置
     */
    optimizePlayerSettings() {
        const video = this.state.videoElement;
        const audio = this.state.audioElement;
        
        if (video) {
            // 設置預加載策略
            video.preload = this.config.player.preload;
            video.crossOrigin = this.config.player.crossOrigin;
            video.playsInline = this.config.player.playsInline;
            
            // 啟用硬件加速（如果支持）
            if ('requestVideoFrameCallback' in video) {
                console.log('[播放優化器] 支持硬件加速渲染');
            }
            
            // 設置緩衝區屬性（如果瀏覽器支持）
            try {
                // 嘗試設置 MSE 緩衝區大小
                if (video.buffered && video.buffered.length > 0) {
                    console.log('[播放優化器] 當前緩衝區:', video.buffered.end(0) - video.currentTime);
                }
            } catch (e) {
                console.warn('[播放優化器] 無法訪問緩衝區信息:', e);
            }
        }
        
        if (audio) {
            audio.preload = this.config.player.preload;
            audio.crossOrigin = this.config.player.crossOrigin;
        }
    }
    
    /**
     * 設置事件監聽器
     */
    setupEventListeners() {
        const video = this.state.videoElement;
        const audio = this.state.audioElement;
        
        if (video) {
            // 卡頓檢測
            video.addEventListener('waiting', () => this.onStallStart());
            video.addEventListener('playing', () => this.onStallEnd());
            video.addEventListener('canplay', () => this.onCanPlay());
            video.addEventListener('canplaythrough', () => this.onCanPlayThrough());
            
            // 緩衝監控
            video.addEventListener('progress', () => this.updateBufferHealth());
            video.addEventListener('timeupdate', () => this.monitorPlayback());
            
            // 錯誤處理
            video.addEventListener('error', (e) => this.handlePlaybackError(e));
            video.addEventListener('stalled', () => this.handleStall());
        }
        
        if (audio) {
            audio.addEventListener('waiting', () => this.onAudioStall());
            audio.addEventListener('error', (e) => this.handleAudioError(e));
        }
    }
    
    /**
     * 開始網絡監控
     */
    startNetworkMonitoring() {
        // 使用 Network Information API（如果支持）
        if ('connection' in navigator) {
            const connection = navigator.connection;
            this.updateNetworkInfo(connection);
            
            connection.addEventListener('change', () => {
                this.updateNetworkInfo(connection);
                this.adaptToNetworkChange();
            });
        }
        
        // 定期測試網絡速度
        if (this.config.adaptive.speedTest) {
            this.startSpeedTest();
        }
    }
    
    /**
     * 更新網絡信息
     * @param {NetworkInformation} connection - 網絡連接信息
     */
    updateNetworkInfo(connection) {
        const effectiveType = connection.effectiveType;
        const downlink = connection.downlink; // Mbps
        
        this.state.networkSpeed = downlink;
        
        console.log('[播放優化器] 網絡狀態更新:', {
            type: effectiveType,
            downlink: downlink + ' Mbps',
            rtt: connection.rtt + ' ms'
        });
        
        // 根據網絡狀況調整緩衝策略
        this.adjustBufferStrategy(effectiveType, downlink);
    }
    
    /**
     * 根據網絡狀況調整緩衝策略
     * @param {string} effectiveType - 網絡類型
     * @param {number} downlink - 下載速度 (Mbps)
     */
    adjustBufferStrategy(effectiveType, downlink) {
        if (effectiveType === 'slow-2g' || effectiveType === '2g') {
            // 慢速網絡：減少緩衝目標，避免過度緩衝
            this.config.buffer.targetDuration = 10;
            this.config.buffer.rebufferGoal = 3;
        } else if (effectiveType === '3g') {
            // 中速網絡：適中緩衝
            this.config.buffer.targetDuration = 20;
            this.config.buffer.rebufferGoal = 5;
        } else if (effectiveType === '4g' || downlink > 10) {
            // 高速網絡：增加緩衝，提升體驗
            this.config.buffer.targetDuration = 30;
            this.config.buffer.rebufferGoal = 8;
        }
        
        console.log('[播放優化器] 緩衝策略已調整:', this.config.buffer);
    }
    
    /**
     * 開始速度測試
     */
    async startSpeedTest() {
        try {
            // 簡單的速度測試
            const testStart = performance.now();
            const testSize = 100 * 1024; // 100KB 測試文件
            
            // 使用一個小的測試請求
            const response = await fetch(this.state.videoElement?.src, {
                headers: { 'Range': 'bytes=0-' + testSize }
            });
            
            if (response.ok) {
                const testEnd = performance.now();
                const duration = (testEnd - testStart) / 1000; // 秒
                const speed = (testSize * 8) / (duration * 1000 * 1000); // Mbps
                
                this.state.networkSpeed = speed;
                this.stats.avgNetworkSpeed = speed;
                
                console.log('[播放優化器] 網速測試結果:', speed.toFixed(2) + ' Mbps');
            }
        } catch (e) {
            console.warn('[播放優化器] 速度測試失敗:', e);
        }
    }
    
    /**
     * 開始緩衝監控
     */
    startBufferMonitoring() {
        setInterval(() => {
            this.updateBufferHealth();
            this.checkBufferStatus();
        }, 1000);
    }
    
    /**
     * 更新緩衝健康度
     */
    updateBufferHealth() {
        const video = this.state.videoElement;
        if (!video || !video.buffered.length) return;
        
        const currentTime = video.currentTime;
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        const bufferAhead = bufferedEnd - currentTime;
        
        this.state.bufferHealth = bufferAhead;
        
        // 記錄緩衝事件
        if (bufferAhead < this.config.buffer.minDuration) {
            this.stats.bufferEvents++;
        }
    }
    
    /**
     * 檢查緩衝狀態並採取行動
     */
    checkBufferStatus() {
        const bufferAhead = this.state.bufferHealth;
        
        if (bufferAhead < this.config.buffer.minDuration) {
            console.warn('[播放優化器] 緩衝不足:', bufferAhead.toFixed(2) + 's');
            this.handleLowBuffer();
        } else if (bufferAhead > this.config.buffer.maxDuration) {
            console.log('[播放優化器] 緩衝充足:', bufferAhead.toFixed(2) + 's');
        }
    }
    
    /**
     * 處理緩衝不足
     */
    handleLowBuffer() {
        if (this.state.isOptimizing) return;
        
        this.state.isOptimizing = true;
        
        // 策略1: 暫停播放以積累緩衝
        const video = this.state.videoElement;
        if (video && !video.paused) {
            console.log('[播放優化器] 暫時暫停以積累緩衝');
            video.pause();
            
            // 等待緩衝恢復
            const checkBuffer = () => {
                if (this.state.bufferHealth >= this.config.buffer.rebufferGoal) {
                    console.log('[播放優化器] 緩衝恢復，繼續播放');
                    video.play();
                    this.state.isOptimizing = false;
                } else {
                    setTimeout(checkBuffer, 500);
                }
            };
            
            setTimeout(checkBuffer, 1000);
        }
    }
    
    /**
     * 卡頓開始
     */
    onStallStart() {
        this.state.lastStallTime = performance.now();
        this.state.stallCount++;
        this.stats.stallEvents++;
        
        console.warn('[播放優化器] 檢測到卡頓事件 #' + this.stats.stallEvents);
    }
    
    /**
     * 卡頓結束
     */
    onStallEnd() {
        if (this.state.lastStallTime > 0) {
            const stallDuration = performance.now() - this.state.lastStallTime;
            this.stats.totalStallTime += stallDuration;
            
            console.log('[播放優化器] 卡頓結束，持續時間:', stallDuration.toFixed(2) + 'ms');
            this.state.lastStallTime = 0;
        }
    }
    
    /**
     * 可以播放事件
     */
    onCanPlay() {
        console.log('[播放優化器] 媒體可以開始播放');
    }
    
    /**
     * 可以流暢播放事件
     */
    onCanPlayThrough() {
        console.log('[播放優化器] 媒體可以流暢播放');
    }
    
    /**
     * 監控播放狀態
     */
    monitorPlayback() {
        // 定期檢查播放健康度
        const video = this.state.videoElement;
        if (!video) return;
        
        // 檢測播放卡頓
        if (video.readyState < 3 && !video.paused) {
            this.handlePlaybackIssue();
        }
    }
    
    /**
     * 處理播放問題
     */
    handlePlaybackIssue() {
        console.warn('[播放優化器] 檢測到播放問題，嘗試恢復');
        
        // 策略1: 強制重新加載當前時間點
        const video = this.state.videoElement;
        if (video) {
            const currentTime = video.currentTime;
            video.currentTime = currentTime + 0.1;
            video.currentTime = currentTime;
        }
    }
    
    /**
     * 處理播放錯誤
     * @param {Event} e - 錯誤事件
     */
    handlePlaybackError(e) {
        console.error('[播放優化器] 播放錯誤:', e);
        
        // 嘗試恢復策略
        setTimeout(() => {
            const video = this.state.videoElement;
            if (video) {
                console.log('[播放優化器] 嘗試重新加載媒體');
                video.load();
            }
        }, 1000);
    }
    
    /**
     * 處理網絡變化
     */
    adaptToNetworkChange() {
        console.log('[播放優化器] 網絡狀況變化，調整播放策略');
        
        // 重新評估緩衝策略
        if (this.state.networkSpeed < 1) {
            // 網速很慢，降低畫質
            this.suggestQualityChange('lower');
        } else if (this.state.networkSpeed > 5) {
            // 網速較好，可以提升畫質
            this.suggestQualityChange('higher');
        }
    }
    
    /**
     * 建議畫質變更
     * @param {string} direction - 'higher' 或 'lower'
     */
    suggestQualityChange(direction) {
        console.log('[播放優化器] 建議', direction === 'higher' ? '提升' : '降低', '畫質');
        
        // 這裡可以觸發畫質變更事件
        const event = new CustomEvent('qualityChangeRequest', {
            detail: { direction: direction, reason: 'network_adaptation' }
        });
        document.dispatchEvent(event);
    }
    
    /**
     * 獲取優化統計
     * @returns {Object} 統計信息
     */
    getStats() {
        const avgStallTime = this.stats.stallEvents > 0 
            ? this.stats.totalStallTime / this.stats.stallEvents 
            : 0;
            
        return {
            stallEvents: this.stats.stallEvents,
            totalStallTime: this.stats.totalStallTime,
            avgStallTime: avgStallTime,
            bufferHealth: this.state.bufferHealth,
            networkSpeed: this.state.networkSpeed,
            bufferEvents: this.stats.bufferEvents,
            qualityChanges: this.stats.qualityChanges,
            currentConfig: { ...this.config }
        };
    }
    
    /**
     * 停止優化器
     */
    stop() {
        // 清理事件監聽器和定時器
        console.log('[播放優化器] 已停止');
    }
}

export { PlaybackOptimizer };
