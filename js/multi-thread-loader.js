// multi-thread-loader.js - 多線程視頻加載管理器
/**
 * 多線程視頻加載管理器
 * 支持並行下載多個視頻段落，大幅提升加載速度
 */
class MultiThreadLoader {
    constructor() {        // 多線程配置
        this.config = {
            maxConcurrentDownloads: 8, // 最大並發下載數 (提高到8個)
            segmentSize: 1024 * 1024, // 每個段落大小 (1MB)
            retryAttempts: 3, // 重試次數
            retryDelay: 1000, // 重試延遲 (ms)
            enableWorkers: true, // 是否使用 Web Workers
            timeout: 30000, // 請求超時時間 (ms)
            preloadSegments: 12 // 預加載段落數量 (提高到12個)
        };

        // 下載狀態
        this.state = {
            isLoading: false,
            activeDownloads: new Map(),
            downloadQueue: [],
            downloadedSegments: new Map(),
            totalBytes: 0,
            downloadedBytes: 0,
            downloadSpeed: 0,
            lastSpeedUpdate: Date.now()
        };

        // 工作線程池
        this.workerPool = [];
        this.availableWorkers = [];

        // 統計信息
        this.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            avgDownloadSpeed: 0,
            peakDownloadSpeed: 0,
            totalBytesDownloaded: 0,
            totalTimeSpent: 0
        };

        this.initializeWorkers();
        console.log('[多線程加載器] 初始化完成');
    }

    /**
     * 初始化 Web Workers
     */
    initializeWorkers() {
        if (!this.config.enableWorkers || typeof Worker === 'undefined') {
            console.warn('[多線程加載器] Web Workers 不可用，將使用主線程');
            return;
        }

        try {
            for (let i = 0; i < this.config.maxConcurrentDownloads; i++) {
                const worker = this.createWorker();
                this.workerPool.push(worker);
                this.availableWorkers.push(worker);
            }
            console.log(`[多線程加載器] 創建了 ${this.workerPool.length} 個工作線程`);
        } catch (error) {
            console.warn('[多線程加載器] Worker 創建失敗，將使用主線程:', error);
            this.config.enableWorkers = false;
        }
    }

    /**
     * 創建下載工作線程
     */
    createWorker() {
        const workerCode = `
            self.onmessage = async function(e) {
                const { url, range, timeout, id, headers } = e.data;
                
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), timeout);
                    
                    const response = await fetch(url, {
                        headers: {
                            'Range': 'bytes=' + range.start + '-' + range.end,
                            'Referer': 'https://www.bilibili.com',
                            ...headers
                        },
                        signal: controller.signal
                    });
                    
                    clearTimeout(timeoutId);
                    
                    if (response.status === 206) {
                        const data = await response.arrayBuffer();
                        self.postMessage({
                            id: id,
                            success: true,
                            data: data,
                            size: data.byteLength,
                            range: range
                        });
                    } else {
                        throw new Error('服務器返回狀態: ' + response.status);
                    }
                } catch (error) {
                    self.postMessage({
                        id: id,
                        success: false,
                        error: error.message,
                        range: range
                    });
                }
            };
        `;

        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const worker = new Worker(URL.createObjectURL(blob));

        worker.onmessage = (e) => {
            this.handleWorkerMessage(e.data);
            this.releaseWorker(worker);
        };

        worker.onerror = (error) => {
            console.error('[多線程加載器] Worker 錯誤:', error);
            this.releaseWorker(worker);
        };

        return worker;
    }

    /**
     * 處理工作線程消息
     */
    handleWorkerMessage(data) {
        const { id, success, data: segmentData, size, range, error } = data;
        const download = this.state.activeDownloads.get(id);

        if (!download) return;

        if (success) {
            // 下載成功
            this.state.downloadedSegments.set(id, {
                data: segmentData,
                range: range,
                size: size,
                timestamp: Date.now()
            });

            this.state.downloadedBytes += size;
            this.stats.successfulRequests++;
            this.stats.totalBytesDownloaded += size;

            console.log(`[多線程加載器] 段落 ${id} 下載完成: ${this.formatBytes(size)}`);
            
            // 觸發回調
            if (download.onSuccess) {
                download.onSuccess(segmentData, range);
            }
        } else {
            // 下載失敗，嘗試重試
            console.warn(`[多線程加載器] 段落 ${id} 下載失敗:`, error);
            this.stats.failedRequests++;

            if (download.retries < this.config.retryAttempts) {
                download.retries++;
                console.log(`[多線程加載器] 重試段落 ${id} (第 ${download.retries} 次)`);
                
                setTimeout(() => {
                    this.retryDownload(download);
                }, this.config.retryDelay * download.retries);
            } else {
                console.error(`[多線程加載器] 段落 ${id} 重試次數已達上限`);
                if (download.onError) {
                    download.onError(error);
                }
            }
        }

        // 移除活動下載
        this.state.activeDownloads.delete(id);
        
        // 更新下載速度
        this.updateDownloadSpeed();
        
        // 處理隊列中的下一個下載
        this.processDownloadQueue();
    }

    /**
     * 開始多線程下載
     * @param {string} url - 視頻URL
     * @param {number} totalSize - 總大小（可選）
     * @param {Function} onProgress - 進度回調
     * @param {Function} onComplete - 完成回調
     */
    async startDownload(url, totalSize = null, onProgress = null, onComplete = null) {
        if (this.state.isLoading) {
            console.warn('[多線程加載器] 已在下載中');
            return;
        }

        this.state.isLoading = true;
        this.state.downloadedBytes = 0;
        this.state.downloadedSegments.clear();
        this.state.lastSpeedUpdate = Date.now();

        console.log('[多線程加載器] 開始多線程下載:', url);

        try {
            // 獲取文件大小
            if (!totalSize) {
                totalSize = await this.getFileSize(url);
            }

            this.state.totalBytes = totalSize;

            // 計算段落
            const segments = this.calculateSegments(totalSize);
            console.log(`[多線程加載器] 分割為 ${segments.length} 個段落`);

            // 添加到下載隊列
            segments.forEach(segment => {
                this.state.downloadQueue.push({
                    id: segment.id,
                    url: url,
                    range: { start: segment.start, end: segment.end },
                    retries: 0,
                    onProgress: onProgress,
                    onSuccess: (data, range) => {
                        if (onProgress) {
                            const progress = (this.state.downloadedBytes / this.state.totalBytes) * 100;
                            onProgress(progress, this.state.downloadSpeed);
                        }
                    },
                    onError: (error) => {
                        console.error('[多線程加載器] 段落下載失敗:', error);
                    }
                });
            });

            // 開始處理下載隊列
            this.processDownloadQueue();

            // 監控下載完成
            this.monitorDownloadCompletion(onComplete);

        } catch (error) {
            console.error('[多線程加載器] 下載啟動失敗:', error);
            this.state.isLoading = false;
        }
    }

    /**
     * 獲取文件大小
     */
    async getFileSize(url) {
        try {
            const response = await fetch(url, {
                method: 'HEAD',
                headers: {
                    'Referer': 'https://www.bilibili.com'
                }
            });

            const contentLength = response.headers.get('content-length');
            return contentLength ? parseInt(contentLength) : 0;
        } catch (error) {
            console.warn('[多線程加載器] 無法獲取文件大小，使用預設分割:', error);
            return 50 * 1024 * 1024; // 預設 50MB
        }
    }

    /**
     * 計算下載段落
     */
    calculateSegments(totalSize) {
        const segments = [];
        const segmentSize = this.config.segmentSize;
        const segmentCount = Math.ceil(totalSize / segmentSize);

        for (let i = 0; i < segmentCount; i++) {
            const start = i * segmentSize;
            const end = Math.min(start + segmentSize - 1, totalSize - 1);
            
            segments.push({
                id: `segment_${i}`,
                start: start,
                end: end,
                size: end - start + 1
            });
        }

        return segments;
    }

    /**
     * 處理下載隊列
     */
    processDownloadQueue() {
        while (this.state.downloadQueue.length > 0 && 
               this.state.activeDownloads.size < this.config.maxConcurrentDownloads) {
            
            const download = this.state.downloadQueue.shift();
            this.startSegmentDownload(download);
        }
    }

    /**
     * 開始段落下載
     */
    startSegmentDownload(download) {
        this.state.activeDownloads.set(download.id, download);
        this.stats.totalRequests++;

        if (this.config.enableWorkers && this.availableWorkers.length > 0) {
            // 使用 Worker
            const worker = this.availableWorkers.pop();
            worker.postMessage({
                id: download.id,
                url: download.url,
                range: download.range,
                timeout: this.config.timeout,
                headers: {}
            });
        } else {
            // 使用主線程
            this.downloadSegmentInMainThread(download);
        }
    }

    /**
     * 在主線程中下載段落
     */
    async downloadSegmentInMainThread(download) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

            const response = await fetch(download.url, {
                headers: {
                    'Range': `bytes=${download.range.start}-${download.range.end}`,
                    'Referer': 'https://www.bilibili.com'
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.status === 206) {
                const data = await response.arrayBuffer();
                this.handleWorkerMessage({
                    id: download.id,
                    success: true,
                    data: data,
                    size: data.byteLength,
                    range: download.range
                });
            } else {
                throw new Error(`服務器返回狀態: ${response.status}`);
            }
        } catch (error) {
            this.handleWorkerMessage({
                id: download.id,
                success: false,
                error: error.message,
                range: download.range
            });
        }
    }

    /**
     * 重試下載
     */
    retryDownload(download) {
        this.state.downloadQueue.unshift(download);
        this.processDownloadQueue();
    }

    /**
     * 釋放工作線程
     */
    releaseWorker(worker) {
        if (!this.availableWorkers.includes(worker)) {
            this.availableWorkers.push(worker);
        }
    }

    /**
     * 更新下載速度
     */
    updateDownloadSpeed() {
        const now = Date.now();
        const timeDiff = (now - this.state.lastSpeedUpdate) / 1000;
        
        if (timeDiff > 0) {
            this.state.downloadSpeed = this.state.downloadedBytes / timeDiff;
            this.stats.avgDownloadSpeed = this.stats.totalBytesDownloaded / 
                ((now - (this.stats.totalTimeSpent || now)) / 1000);
            
            if (this.state.downloadSpeed > this.stats.peakDownloadSpeed) {
                this.stats.peakDownloadSpeed = this.state.downloadSpeed;
            }
        }
    }

    /**
     * 監控下載完成
     */
    monitorDownloadCompletion(onComplete) {
        const checkCompletion = () => {
            if (this.state.activeDownloads.size === 0 && 
                this.state.downloadQueue.length === 0) {
                
                console.log('[多線程加載器] 所有段落下載完成');
                this.state.isLoading = false;
                
                // 合併段落數據
                const completeData = this.mergeSegments();
                
                if (onComplete) {
                    onComplete(completeData, this.getStats());
                }
            } else {
                setTimeout(checkCompletion, 100);
            }
        };

        setTimeout(checkCompletion, 100);
    }

    /**
     * 合併下載的段落
     */
    mergeSegments() {
        const segments = Array.from(this.state.downloadedSegments.entries())
            .sort((a, b) => {
                const aStart = a[1].range.start;
                const bStart = b[1].range.start;
                return aStart - bStart;
            });

        const totalSize = segments.reduce((sum, [, segment]) => sum + segment.size, 0);
        const mergedBuffer = new ArrayBuffer(totalSize);
        const mergedView = new Uint8Array(mergedBuffer);

        let offset = 0;
        segments.forEach(([, segment]) => {
            const segmentView = new Uint8Array(segment.data);
            mergedView.set(segmentView, offset);
            offset += segment.size;
        });

        console.log(`[多線程加載器] 合併完成，總大小: ${this.formatBytes(totalSize)}`);
        return mergedBuffer;
    }

    /**
     * 停止下載
     */
    stopDownload() {
        this.state.isLoading = false;
        this.state.downloadQueue = [];
        this.state.activeDownloads.clear();
        
        // 終止所有工作線程
        this.workerPool.forEach(worker => {
            try {
                worker.terminate();
            } catch (e) {
                console.warn('[多線程加載器] Worker 終止失敗:', e);
            }
        });
        
        this.workerPool = [];
        this.availableWorkers = [];
        
        console.log('[多線程加載器] 下載已停止');
    }

    /**
     * 設置配置
     */
    setConfig(config) {
        if (config.maxConcurrentDownloads !== undefined) {
            this.config.maxConcurrentDownloads = Math.max(1, Math.min(8, config.maxConcurrentDownloads));
        }
        if (config.segmentSize !== undefined) {
            this.config.segmentSize = Math.max(256 * 1024, config.segmentSize); // 最小 256KB
        }
        if (config.retryAttempts !== undefined) {
            this.config.retryAttempts = Math.max(0, config.retryAttempts);
        }
        if (config.timeout !== undefined) {
            this.config.timeout = Math.max(5000, config.timeout);
        }

        console.log('[多線程加載器] 配置已更新:', this.config);
    }

    /**
     * 獲取統計信息
     */
    getStats() {
        return {
            ...this.stats,
            currentSpeed: this.state.downloadSpeed,
            progress: this.state.totalBytes > 0 ? 
                (this.state.downloadedBytes / this.state.totalBytes) * 100 : 0,
            activeDownloads: this.state.activeDownloads.size,
            queuedDownloads: this.state.downloadQueue.length,
            downloadedSegments: this.state.downloadedSegments.size
        };
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

    /**
     * 銷毀加載器
     */
    destroy() {
        this.stopDownload();
        this.state.downloadedSegments.clear();
        console.log('[多線程加載器] 已銷毀');
    }
}

export { MultiThreadLoader };
