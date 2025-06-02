// preloader.js - 視頻和音頻預加載管理器
/**
 * 視頻和音頻預加載管理器
 * 支持視頻和音頻流的獨立預加載，可配置預加載時長
 */
class MediaPreloader {
    constructor() {
        // 預加載配置
        this.config = {
            video: {
                enabled: true,
                preloadDuration: 5, // 視頻預加載 5 秒
                maxCacheSize: 50 * 1024 * 1024, // 50MB 視頻緩存上限
                segments: new Map() // 已緩存的段落
            },
            audio: {
                enabled: true,
                preloadDuration: 60, // 音頻預加載 1 分鐘
                maxCacheSize: 10 * 1024 * 1024, // 10MB 音頻緩存上限
                segments: new Map() // 已緩存的段落
            }
        };
        
        // 預加載狀態
        this.state = {
            isPreloading: false,
            currentVideoTime: 0,
            currentAudioTime: 0,
            videoElement: null,
            audioElement: null,
            videoUrl: null,
            audioUrl: null
        };
        
        // 預加載統計
        this.stats = {
            video: {
                totalRequests: 0,
                totalBytes: 0,
                cacheHits: 0,
                preloadedSegments: 0
            },
            audio: {
                totalRequests: 0,
                totalBytes: 0,
                cacheHits: 0,
                preloadedSegments: 0
            }
        };
        
        console.log('[預加載器] 初始化完成');
    }
    
    /**
     * 設置預加載配置
     * @param {Object} config - 配置對象
     * @param {number} config.videoDuration - 視頻預加載時長（秒）
     * @param {number} config.audioDuration - 音頻預加載時長（秒）
     * @param {boolean} config.videoEnabled - 是否啟用視頻預加載
     * @param {boolean} config.audioEnabled - 是否啟用音頻預加載
     */
    setConfig(config) {
        if (config.videoDuration !== undefined) {
            this.config.video.preloadDuration = Math.max(1, Math.min(300, config.videoDuration)); // 1-300秒
        }
        if (config.audioDuration !== undefined) {
            this.config.audio.preloadDuration = Math.max(1, Math.min(600, config.audioDuration)); // 1-600秒
        }
        if (config.videoEnabled !== undefined) {
            this.config.video.enabled = config.videoEnabled;
        }
        if (config.audioEnabled !== undefined) {
            this.config.audio.enabled = config.audioEnabled;
        }
        
        console.log('[預加載器] 配置更新:', this.config);
        
        // 保存配置到本地存儲
        this.saveConfig();
    }
    
    /**
     * 從本地存儲加載配置
     */
    loadConfig() {
        try {
            const saved = localStorage.getItem('bilibili-preloader-config');
            if (saved) {
                const config = JSON.parse(saved);
                this.setConfig(config);
            }
        } catch (e) {
            console.warn('[預加載器] 配置加載失敗:', e);
        }
    }
    
    /**
     * 保存配置到本地存儲
     */
    saveConfig() {
        try {
            const config = {
                videoDuration: this.config.video.preloadDuration,
                audioDuration: this.config.audio.preloadDuration,
                videoEnabled: this.config.video.enabled,
                audioEnabled: this.config.audio.enabled
            };
            localStorage.setItem('bilibili-preloader-config', JSON.stringify(config));
        } catch (e) {
            console.warn('[預加載器] 配置保存失敗:', e);
        }
    }
    
    /**
     * 初始化預加載器
     * @param {HTMLVideoElement} videoElement - 視頻元素
     * @param {HTMLAudioElement} audioElement - 音頻元素
     * @param {string} videoUrl - 視頻流 URL
     * @param {string} audioUrl - 音頻流 URL
     */
    initialize(videoElement, audioElement, videoUrl, audioUrl) {
        this.state.videoElement = videoElement;
        this.state.audioElement = audioElement;
        this.state.videoUrl = videoUrl;
        this.state.audioUrl = audioUrl;
        
        // 清理舊的緩存
        this.clearCache();
        
        // 加載保存的配置
        this.loadConfig();
        
        // 設置事件監聽器
        this.setupEventListeners();
        
        console.log('[預加載器] 初始化媒體元素完成');
    }
    
    /**
     * 設置事件監聽器
     */
    setupEventListeners() {
        if (this.state.videoElement) {
            this.state.videoElement.addEventListener('timeupdate', () => {
                this.state.currentVideoTime = this.state.videoElement.currentTime;
                this.checkPreload('video');
            });
            
            this.state.videoElement.addEventListener('seeking', () => {
                this.onSeek('video');
            });
        }
        
        if (this.state.audioElement) {
            this.state.audioElement.addEventListener('timeupdate', () => {
                this.state.currentAudioTime = this.state.audioElement.currentTime;
                this.checkPreload('audio');
            });
            
            this.state.audioElement.addEventListener('seeking', () => {
                this.onSeek('audio');
            });
        }
    }
    
    /**
     * 檢查是否需要預加載
     * @param {string} type - 媒體類型 ('video' 或 'audio')
     */
    checkPreload(type) {
        if (!this.config[type].enabled) return;
        
        const currentTime = type === 'video' ? this.state.currentVideoTime : this.state.currentAudioTime;
        const preloadDuration = this.config[type].preloadDuration;
        const targetTime = currentTime + preloadDuration;
        
        // 檢查是否已經預加載了這個時間段
        if (!this.isSegmentCached(type, targetTime)) {
            this.preloadSegment(type, targetTime);
        }
    }
    
    /**
     * 預加載指定時間段的媒體
     * @param {string} type - 媒體類型
     * @param {number} targetTime - 目標時間
     */
    async preloadSegment(type, targetTime) {
        if (this.state.isPreloading) return;
        
        this.state.isPreloading = true;
        
        try {
            const url = type === 'video' ? this.state.videoUrl : this.state.audioUrl;
            if (!url) return;
            
            // 計算需要預加載的字節範圍
            const range = this.calculateByteRange(type, targetTime);
            if (!range) return;
            
            // 發起 Range 請求預加載數據
            const response = await fetch(url, {
                headers: {
                    'Range': `bytes=${range.start}-${range.end}`,
                    'Referer': 'https://www.bilibili.com'
                }
            });
            
            if (response.status === 206) { // Partial Content
                const data = await response.arrayBuffer();
                
                // 緩存數據
                this.cacheSegment(type, targetTime, data);
                
                // 更新統計
                this.stats[type].totalRequests++;
                this.stats[type].totalBytes += data.byteLength;
                this.stats[type].preloadedSegments++;
                
                console.log(`[預加載器] ${type} 預加載完成:`, {
                    targetTime: targetTime.toFixed(2),
                    bytes: data.byteLength,
                    range: `${range.start}-${range.end}`
                });
            }
        } catch (error) {
            console.warn(`[預加載器] ${type} 預加載失敗:`, error);
        } finally {
            this.state.isPreloading = false;
        }
    }
    
    /**
     * 計算指定時間的字節範圍（簡化實現）
     * @param {string} type - 媒體類型
     * @param {number} targetTime - 目標時間
     * @returns {Object|null} 字節範圍 {start, end}
     */
    calculateByteRange(type, targetTime) {
        // 這是一個簡化的實現，實際應該根據媒體文件的具體格式來計算
        // 對於 DASH 流，需要解析 MPD 文件來獲取精確的段落信息
        
        // 估算比特率（這裡使用經驗值）
        const estimatedBitrate = type === 'video' ? 2000000 : 128000; // 2Mbps 視頻, 128kbps 音頻
        const segmentDuration = 2; // 假設每個段落 2 秒
        const segmentBytes = (estimatedBitrate * segmentDuration) / 8;
        
        const segmentIndex = Math.floor(targetTime / segmentDuration);
        const start = segmentIndex * segmentBytes;
        const end = start + segmentBytes - 1;
        
        return { start, end };
    }
    
    /**
     * 緩存媒體段落
     * @param {string} type - 媒體類型
     * @param {number} time - 時間點
     * @param {ArrayBuffer} data - 數據
     */
    cacheSegment(type, time, data) {
        const segments = this.config[type].segments;
        const segmentKey = Math.floor(time / 2) * 2; // 2秒為一個段落
        
        segments.set(segmentKey, {
            data: data,
            timestamp: Date.now(),
            size: data.byteLength
        });
        
        // 檢查緩存大小限制
        this.cleanupCache(type);
    }
    
    /**
     * 檢查段落是否已緩存
     * @param {string} type - 媒體類型
     * @param {number} time - 時間點
     * @returns {boolean}
     */
    isSegmentCached(type, time) {
        const segments = this.config[type].segments;
        const segmentKey = Math.floor(time / 2) * 2;
        return segments.has(segmentKey);
    }
    
    /**
     * 清理緩存（移除過期或過多的段落）
     * @param {string} type - 媒體類型
     */
    cleanupCache(type) {
        const segments = this.config[type].segments;
        const maxSize = this.config[type].maxCacheSize;
        
        // 計算當前緩存大小
        let totalSize = 0;
        const segmentArray = Array.from(segments.entries());
        
        for (const [key, segment] of segmentArray) {
            totalSize += segment.size;
        }
        
        // 如果超過限制，移除最舊的段落
        if (totalSize > maxSize) {
            segmentArray.sort((a, b) => a[1].timestamp - b[1].timestamp);
            
            while (totalSize > maxSize && segmentArray.length > 0) {
                const [key, segment] = segmentArray.shift();
                segments.delete(key);
                totalSize -= segment.size;
            }
            
            console.log(`[預加載器] ${type} 緩存清理完成, 剩餘大小:`, totalSize);
        }
    }
    
    /**
     * 處理播放器跳轉
     * @param {string} type - 媒體類型
     */
    onSeek(type) {
        // 跳轉後立即檢查預加載
        setTimeout(() => {
            this.checkPreload(type);
        }, 100);
    }
    
    /**
     * 清理所有緩存
     */
    clearCache() {
        this.config.video.segments.clear();
        this.config.audio.segments.clear();
        
        // 重置統計
        this.stats.video = { totalRequests: 0, totalBytes: 0, cacheHits: 0, preloadedSegments: 0 };
        this.stats.audio = { totalRequests: 0, totalBytes: 0, cacheHits: 0, preloadedSegments: 0 };
        
        console.log('[預加載器] 緩存已清理');
    }
    
    /**
     * 獲取預加載統計信息
     * @returns {Object} 統計信息
     */
    getStats() {
        const videoCache = this.config.video.segments;
        const audioCache = this.config.audio.segments;
        
        let videoCacheSize = 0;
        let audioCacheSize = 0;
        
        for (const segment of videoCache.values()) {
            videoCacheSize += segment.size;
        }
        
        for (const segment of audioCache.values()) {
            audioCacheSize += segment.size;
        }
        
        return {
            video: {
                ...this.stats.video,
                cacheSize: videoCacheSize,
                cachedSegments: videoCache.size,
                preloadDuration: this.config.video.preloadDuration
            },
            audio: {
                ...this.stats.audio,
                cacheSize: audioCacheSize,
                cachedSegments: audioCache.size,
                preloadDuration: this.config.audio.preloadDuration
            }
        };
    }
    
    /**
     * 停止預加載
     */
    stop() {
        this.state.isPreloading = false;
        this.clearCache();
        
        // 移除事件監聽器
        if (this.state.videoElement) {
            this.state.videoElement.removeEventListener('timeupdate', this.checkPreload);
            this.state.videoElement.removeEventListener('seeking', this.onSeek);
        }
        
        if (this.state.audioElement) {
            this.state.audioElement.removeEventListener('timeupdate', this.checkPreload);
            this.state.audioElement.removeEventListener('seeking', this.onSeek);
        }
        
        console.log('[預加載器] 已停止');
    }
}

export { MediaPreloader };
