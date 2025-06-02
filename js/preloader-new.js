// preloader.js - 視頻和音頻預加載管理器
import { MultiThreadLoader } from './multi-thread-loader.js';

/**
 * 視頻和音頻預加載管理器
 * 支持視頻和音頻流的獨立預加載，可配置預加載時長
 * 新增多線程並行下載支持
 */
class MediaPreloader {
    constructor() {
        // 預加載配置
        this.config = {
            video: {
                enabled: true,
                preloadDuration: 5, // 視頻預加載 5 秒
                maxCacheSize: 50 * 1024 * 1024, // 50MB 視頻緩存上限
                segments: new Map(), // 已緩存的段落
                useMultiThread: true, // 是否使用多線程下載
                maxConcurrentDownloads: 8, // 最大並發下載數 (提高到8個)
                segmentSize: 2 * 1024 * 1024 // 段落大小 (2MB)
            },
            audio: {
                enabled: true,
                preloadDuration: 60, // 音頻預加載 1 分鐘
                maxCacheSize: 10 * 1024 * 1024, // 10MB 音頻緩存上限
                segments: new Map(), // 已緩存的段落
                useMultiThread: true, // 是否使用多線程下載
                maxConcurrentDownloads: 6, // 音頻並發下載數 (提高到6個)
                segmentSize: 1 * 1024 * 1024 // 段落大小 (1MB)
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
        
        // 多線程下載器
        this.videoLoader = null;
        this.audioLoader = null;
        
        // 預加載統計
        this.stats = {
            video: {
                totalRequests: 0,
                totalBytes: 0,
                cacheHits: 0,
                preloadedSegments: 0,
                multiThreadDownloads: 0,
                avgDownloadSpeed: 0
            },
            audio: {
                totalRequests: 0,
                totalBytes: 0,
                cacheHits: 0,
                preloadedSegments: 0,
                multiThreadDownloads: 0,
                avgDownloadSpeed: 0
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
     * @param {boolean} config.videoUseMultiThread - 是否對視頻使用多線程下載
     * @param {boolean} config.audioUseMultiThread - 是否對音頻使用多線程下載
     * @param {number} config.videoMaxConcurrentDownloads - 視頻最大並發下載數
     * @param {number} config.audioMaxConcurrentDownloads - 音頻最大並發下載數
     */
    setConfig(config) {
        if (config.videoDuration !== undefined) {
            this.config.video.preloadDuration = Math.max(1, Math.min(300, config.videoDuration)); // 1-300秒
        }
        if (config.audioDuration !== undefined) {
            this.config.audio.preloadDuration = Math.max(10, Math.min(600, config.audioDuration)); // 10-600秒
        }
        if (config.videoEnabled !== undefined) {
            this.config.video.enabled = config.videoEnabled;
        }
        if (config.audioEnabled !== undefined) {
            this.config.audio.enabled = config.audioEnabled;
        }
        if (config.videoUseMultiThread !== undefined) {
            this.config.video.useMultiThread = config.videoUseMultiThread;
        }
        if (config.audioUseMultiThread !== undefined) {
            this.config.audio.useMultiThread = config.audioUseMultiThread;
        }
        if (config.videoMaxConcurrentDownloads !== undefined) {
            this.config.video.maxConcurrentDownloads = Math.max(1, Math.min(8, config.videoMaxConcurrentDownloads));
        }
        if (config.audioMaxConcurrentDownloads !== undefined) {
            this.config.audio.maxConcurrentDownloads = Math.max(1, Math.min(8, config.audioMaxConcurrentDownloads)); // 提高到8
        }
        
        console.log('[預加載器] 配置更新:', this.config);
        
        // 更新多線程下載器配置
        this.updateLoaderConfigs();
        
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
                audioEnabled: this.config.audio.enabled,
                videoUseMultiThread: this.config.video.useMultiThread,
                audioUseMultiThread: this.config.audio.useMultiThread,
                videoMaxConcurrentDownloads: this.config.video.maxConcurrentDownloads,
                audioMaxConcurrentDownloads: this.config.audio.maxConcurrentDownloads
            };
            localStorage.setItem('bilibili-preloader-config', JSON.stringify(config));
        } catch (e) {
            console.warn('[預加載器] 配置保存失敗:', e);
        }
    }
    
    /**
     * 更新多線程下載器配置
     */
    updateLoaderConfigs() {
        if (this.videoLoader) {
            this.videoLoader.setConfig({
                maxConcurrentDownloads: this.config.video.maxConcurrentDownloads,
                segmentSize: this.config.video.segmentSize
            });
        }
        
        if (this.audioLoader) {
            this.audioLoader.setConfig({
                maxConcurrentDownloads: this.config.audio.maxConcurrentDownloads,
                segmentSize: this.config.audio.segmentSize
            });
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
        
        // 初始化多線程下載器
        this.initializeLoaders();
        
        // 設置事件監聽器
        this.setupEventListeners();
        
        console.log('[預加載器] 初始化媒體元素完成');
    }
    
    /**
     * 初始化多線程下載器
     */
    initializeLoaders() {
        // 清理舊的下載器
        if (this.videoLoader) {
            this.videoLoader.destroy();
        }
        if (this.audioLoader) {
            this.audioLoader.destroy();
        }

        // 創建新的下載器
        if (this.config.video.useMultiThread) {
            this.videoLoader = new MultiThreadLoader();
            this.videoLoader.setConfig({
                maxConcurrentDownloads: this.config.video.maxConcurrentDownloads,
                segmentSize: this.config.video.segmentSize
            });
            console.log('[預加載器] 視頻多線程下載器已初始化');
        }

        if (this.config.audio.useMultiThread) {
            this.audioLoader = new MultiThreadLoader();
            this.audioLoader.setConfig({
                maxConcurrentDownloads: this.config.audio.maxConcurrentDownloads,
                segmentSize: this.config.audio.segmentSize
            });
            console.log('[預加載器] 音頻多線程下載器已初始化');
        }
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
        const preloadTime = currentTime + this.config[type].preloadDuration;
        
        // 檢查是否已經緩存了這個時間段
        if (!this.isSegmentCached(type, preloadTime)) {
            this.preloadSegment(type, preloadTime);
        }
        
        // 清理過期緩存
        this.cleanupCache(type);
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

            const useMultiThread = this.config[type].useMultiThread;
            const loader = type === 'video' ? this.videoLoader : this.audioLoader;

            if (useMultiThread && loader) {
                // 使用多線程下載
                await this.preloadWithMultiThread(type, targetTime, url, loader);
            } else {
                // 使用單線程下載
                await this.preloadWithSingleThread(type, targetTime, url);
            }
        } catch (error) {
            console.warn(`[預加載器] ${type} 預加載失敗:`, error);
        } finally {
            this.state.isPreloading = false;
        }
    }

    /**
     * 使用多線程預加載
     */
    async preloadWithMultiThread(type, targetTime, url, loader) {
        console.log(`[預加載器] 開始多線程預加載 ${type} 時間點: ${targetTime.toFixed(2)}秒`);
        
        const preloadDuration = this.config[type].preloadDuration;
        const estimatedBitrate = type === 'video' ? 2000000 : 128000; // 估算碼率
        const estimatedSize = (preloadDuration * estimatedBitrate) / 8; // 估算需要下載的大小

        await loader.startDownload(
            url,
            estimatedSize,
            (progress, speed) => {
                // 進度回調
                this.stats[type].avgDownloadSpeed = speed;
                console.log(`[預加載器] ${type} 多線程下載進度: ${progress.toFixed(1)}%, 速度: ${this.formatBytes(speed)}/s`);
            },
            (data, stats) => {
                // 完成回調
                if (data) {
                    this.cacheSegment(type, targetTime, data);
                    this.stats[type].multiThreadDownloads++;
                    this.stats[type].totalBytes += data.byteLength;
                    
                    console.log(`[預加載器] ${type} 多線程預加載完成:`, {
                        targetTime: targetTime.toFixed(2),
                        bytes: data.byteLength,
                        downloadSpeed: this.formatBytes(stats.currentSpeed) + '/s',
                        segments: stats.downloadedSegments
                    });
                }
            }
        );

        this.stats[type].totalRequests++;
        this.stats[type].preloadedSegments++;
    }

    /**
     * 使用單線程預加載
     */
    async preloadWithSingleThread(type, targetTime, url) {
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
            
            console.log(`[預加載器] ${type} 單線程預加載完成:`, {
                targetTime: targetTime.toFixed(2),
                bytes: data.byteLength,
                range: `${range.start}-${range.end}`
            });
        }
    }
    
    /**
     * 計算指定時間的字節範圍（簡化實現）
     * @param {string} type - 媒體類型
     * @param {number} targetTime - 目標時間
     * @returns {Object|null} 字節範圍對象
     */
    calculateByteRange(type, targetTime) {
        // 這是一個簡化的實現，實際應該根據媒體文件的具體格式來計算
        const estimatedBitrate = type === 'video' ? 2000000 : 128000; // 2Mbps for video, 128kbps for audio
        const segmentDuration = this.config[type].preloadDuration;
        const estimatedBytes = (estimatedBitrate * segmentDuration) / 8;
        const startByte = Math.floor(targetTime * estimatedBitrate / 8);
        
        return {
            start: startByte,
            end: startByte + estimatedBytes - 1
        };
    }
    
    /**
     * 緩存段落數據
     * @param {string} type - 媒體類型
     * @param {number} time - 時間點
     * @param {ArrayBuffer} data - 數據
     */
    cacheSegment(type, time, data) {
        const segments = this.config[type].segments;
        const segmentKey = Math.floor(time / 2) * 2; // 每2秒為一個段落
        
        segments.set(segmentKey, {
            data: data,
            size: data.byteLength,
            timestamp: Date.now()
        });
        
        // 檢查緩存大小限制
        let totalSize = 0;
        for (const segment of segments.values()) {
            totalSize += segment.size;
        }
        
        if (totalSize > this.config[type].maxCacheSize) {
            this.cleanupCache(type);
        }
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
        const currentTime = type === 'video' ? this.state.currentVideoTime : this.state.currentAudioTime;
        
        // 移除過期的段落（超過當前時間5分鐘以前的）
        for (const [segmentKey, segment] of segments.entries()) {
            if (segmentKey < currentTime - 300) {
                segments.delete(segmentKey);
            }
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
        
        // 停止多線程下載器
        if (this.videoLoader) {
            this.videoLoader.stopDownload();
        }
        if (this.audioLoader) {
            this.audioLoader.stopDownload();
        }
        
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

    /**
     * 格式化字節大小
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

export { MediaPreloader };
