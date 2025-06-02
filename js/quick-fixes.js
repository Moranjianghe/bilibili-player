// quick-fixes.js - 快速修復播放問題的解決方案
/**
 * 快速修復播放器常見問題
 */
class QuickFixes {
    constructor() {
        this.fixes = {
            // DNS 優化
            dns: {
                enabled: true,
                servers: [
                    '8.8.8.8',
                    '1.1.1.1',
                    '114.114.114.114',
                    '223.5.5.5'
                ]
            },
            
            // 瀏覽器優化
            browser: {
                enableHardwareAcceleration: true,
                disableAutoplay: false,
                forceSoftwareDecoding: false
            },
            
            // 網絡優化
            network: {
                enableHTTP2: true,
                enableCompression: true,
                maxConnections: 6
            }        };
        
        this.isApplied = false;
        
        // 存儲事件監聽器引用以便清理
        this.globalEventHandlers = [];
        this.mediaElementHandlers = new WeakMap();
        this.networkChangeHandler = null;
    }
    
    /**
     * 應用所有快速修復
     */
    applyAllFixes() {
        if (this.isApplied) return;
        
        console.log('[快速修復] 開始應用播放優化修復...');
        
        // 1. 優化 Fetch API 請求
        this.optimizeFetchRequests();
        
        // 2. 設置更好的緩存策略
        this.setupCacheStrategy();
        
        // 3. 優化媒體元素設置
        this.optimizeMediaSettings();
        
        // 4. 添加性能監控
        this.setupPerformanceMonitoring();
        
        // 5. 處理網絡錯誤重試
        this.setupErrorRetry();
        
        this.isApplied = true;
        console.log('[快速修復] 所有修復已應用');
    }
    
    /**
     * 優化 Fetch 請求
     */
    optimizeFetchRequests() {
        // 保存原始 fetch
        const originalFetch = window.fetch;
        
        window.fetch = async function(resource, options = {}) {
            // 為媒體請求添加優化選項
            if (typeof resource === 'string' && 
                (resource.includes('.m4s') || resource.includes('.mp4') || 
                 resource.includes('video') || resource.includes('audio'))) {
                
                options = {
                    ...options,
                    priority: 'high',
                    cache: 'force-cache',
                    headers: {
                        ...options.headers,
                        'Cache-Control': 'max-age=3600',
                        'Accept-Encoding': 'gzip, deflate, br'
                    }
                };
            }
            
            try {
                const response = await originalFetch(resource, options);
                
                // 如果請求失敗，嘗試重試
                if (!response.ok && response.status >= 500) {
                    console.warn('[快速修復] 請求失敗，嘗試重試:', resource);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    return originalFetch(resource, options);
                }
                
                return response;
            } catch (error) {
                console.error('[快速修復] 請求錯誤:', error);
                throw error;
            }
        };
        
        console.log('[快速修復] Fetch 請求優化已應用');
    }
    
    /**
     * 設置緩存策略
     */
    setupCacheStrategy() {
        // 如果支持 Service Worker，設置媒體緩存
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register(this.createServiceWorker())
                .then(() => console.log('[快速修復] Service Worker 緩存已啟用'))
                .catch(err => console.warn('[快速修復] Service Worker 註冊失敗:', err));
        }
        
        // 設置 localStorage 緩存配置
        localStorage.setItem('bilibili-player-cache-strategy', JSON.stringify({
            enableAggressive: true,
            maxAge: 3600,
            enablePrefetch: true
        }));
    }
    
    /**
     * 創建 Service Worker 用於緩存
     */
    createServiceWorker() {
        const swCode = `
            const CACHE_NAME = 'bilibili-player-cache-v1';
            
            self.addEventListener('fetch', event => {
                const url = event.request.url;
                
                // 緩存媒體文件
                if (url.includes('.m4s') || url.includes('.mp4') || 
                    url.includes('video') || url.includes('audio')) {
                    
                    event.respondWith(
                        caches.open(CACHE_NAME).then(cache => {
                            return cache.match(event.request).then(response => {
                                if (response) {
                                    return response;
                                }
                                
                                return fetch(event.request).then(fetchResponse => {
                                    if (fetchResponse.ok) {
                                        cache.put(event.request, fetchResponse.clone());
                                    }
                                    return fetchResponse;
                                });
                            });
                        })
                    );
                }
            });
        `;
        
        const blob = new Blob([swCode], { type: 'application/javascript' });
        return URL.createObjectURL(blob);
    }
    
    /**
     * 優化媒體元素設置
     */
    optimizeMediaSettings() {
        // 為所有媒體元素設置優化屬性
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) { // Element node
                        if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') {
                            this.optimizeMediaElement(node);
                        }
                        
                        // 檢查子元素
                        const mediaElements = node.querySelectorAll?.('video, audio');
                        mediaElements?.forEach(element => this.optimizeMediaElement(element));
                    }
                });
            });
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        // 優化已存在的媒體元素
        document.querySelectorAll('video, audio').forEach(element => {
            this.optimizeMediaElement(element);
        });
    }
      /**
     * 優化單個媒體元素
     * @param {HTMLMediaElement} element 
     */
    optimizeMediaElement(element) {
        // 檢查是否已經優化過，避免重複添加監聽器
        if (element.dataset.quickFixesOptimized) {
            return;
        }
        
        // 設置優化屬性
        element.preload = 'auto';
        element.crossOrigin = 'anonymous';
        
        if (element.tagName === 'VIDEO') {
            element.playsInline = true;
            element.setAttribute('webkit-playsinline', '');
            element.setAttribute('x5-video-player-type', 'h5');
            element.setAttribute('x5-video-player-fullscreen', 'true');
            
            // 啟用硬件加速（如果支持）
            if (this.fixes.browser.enableHardwareAcceleration) {
                element.style.willChange = 'transform';
                element.style.transform = 'translateZ(0)';
            }
        }
        
        // 創建事件處理器並保存引用
        const errorHandler = () => this.handleMediaError(element);
        const stalledHandler = () => this.handleMediaStall(element);
        
        // 添加錯誤恢復
        element.addEventListener('error', errorHandler);
        element.addEventListener('stalled', stalledHandler);
        
        // 使用 WeakMap 保存監聽器引用以便清理
        this.mediaElementHandlers.set(element, {
            errorHandler,
            stalledHandler
        });
        
        // 標記為已優化
        element.dataset.quickFixesOptimized = 'true';
    }
    
    /**
     * 處理媒體錯誤
     * @param {HTMLMediaElement} element 
     */
    handleMediaError(element) {
        console.warn('[快速修復] 媒體錯誤，嘗試恢復:', element.src);
        
        setTimeout(() => {
            const currentTime = element.currentTime;
            element.load();
            element.currentTime = currentTime;
            element.play().catch(e => console.warn('[快速修復] 恢復播放失敗:', e));
        }, 1000);
    }
    
    /**
     * 處理媒體停滯
     * @param {HTMLMediaElement} element 
     */
    handleMediaStall(element) {
        console.warn('[快速修復] 媒體停滯，嘗試跳過:', element.currentTime);
        
        // 嘗試小幅跳轉來解決停滯
        const currentTime = element.currentTime;
        element.currentTime = currentTime + 0.1;
    }
    
    /**
     * 設置性能監控
     */
    setupPerformanceMonitoring() {
        // 監控內存使用
        if ('memory' in performance) {
            setInterval(() => {
                const memory = performance.memory;
                const usedMB = Math.round(memory.usedJSHeapSize / 1048576);
                const totalMB = Math.round(memory.totalJSHeapSize / 1048576);
                
                if (usedMB > totalMB * 0.8) {
                    console.warn('[快速修復] 內存使用過高:', usedMB + 'MB/' + totalMB + 'MB');
                    this.cleanupMemory();
                }
            }, 30000);
        }
          // 監控網絡狀態
        if ('connection' in navigator && !this.networkChangeHandler) {
            this.networkChangeHandler = () => {
                const connection = navigator.connection;
                console.log('[快速修復] 網絡狀態變化:', {
                    effectiveType: connection.effectiveType,
                    downlink: connection.downlink
                });
                
                if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
                    this.enableLowBandwidthMode();
                }
            };
            
            navigator.connection.addEventListener('change', this.networkChangeHandler);
        }
    }
    
    /**
     * 清理內存
     */
    cleanupMemory() {
        // 清理不必要的緩存
        if ('caches' in window) {
            caches.keys().then(names => {
                names.forEach(name => {
                    if (name.includes('old') || name.includes('temp')) {
                        caches.delete(name);
                    }
                });
            });
        }
        
        // 建議垃圾回收
        if (window.gc) {
            window.gc();
        }
    }
    
    /**
     * 啟用低帶寬模式
     */
    enableLowBandwidthMode() {
        console.log('[快速修復] 啟用低帶寬模式');
        
        // 降低視頻質量
        const event = new CustomEvent('qualityChangeRequest', {
            detail: { direction: 'lower', reason: 'low_bandwidth' }
        });
        document.dispatchEvent(event);
        
        // 減少預加載
        document.querySelectorAll('video, audio').forEach(element => {
            element.preload = 'metadata';
        });
    }
      /**
     * 設置錯誤重試機制
     */
    setupErrorRetry() {
        // 避免重複添加監聽器
        if (this.globalEventHandlers.some(h => h.target === window && h.event === 'error')) {
            return;
        }
        
        // 全局錯誤處理
        const errorHandler = (event) => {
            if (event.target && (event.target.tagName === 'VIDEO' || event.target.tagName === 'AUDIO')) {
                this.retryMediaLoad(event.target);
            }
        };
        
        // 未捕獲的 Promise 錯誤
        const rejectionHandler = (event) => {
            if (event.reason && event.reason.message && 
                event.reason.message.includes('media')) {
                console.warn('[快速修復] 媒體相關的 Promise 錯誤:', event.reason);
                event.preventDefault();
            }
        };
        
        window.addEventListener('error', errorHandler);
        window.addEventListener('unhandledrejection', rejectionHandler);
        
        // 保存監聽器引用以便清理
        this.globalEventHandlers.push(
            { target: window, event: 'error', handler: errorHandler },
            { target: window, event: 'unhandledrejection', handler: rejectionHandler }
        );
    }
    
    /**
     * 重試媒體加載
     * @param {HTMLMediaElement} element 
     */
    retryMediaLoad(element) {
        let retryCount = element.dataset.retryCount ? parseInt(element.dataset.retryCount) : 0;
        
        if (retryCount < 3) {
            retryCount++;
            element.dataset.retryCount = retryCount;
            
            console.log(`[快速修復] 重試媒體加載 (${retryCount}/3):`, element.src);
            
            setTimeout(() => {
                const currentTime = element.currentTime;
                element.load();
                
                element.addEventListener('loadedmetadata', () => {
                    element.currentTime = currentTime;
                    element.play().catch(e => console.warn('[快速修復] 重試播放失敗:', e));
                }, { once: true });
            }, retryCount * 1000);
        } else {
            console.error('[快速修復] 媒體加載重試次數已達上限:', element.src);
        }
    }
    
    /**
     * 獲取修復狀態
     */
    getStatus() {
        return {
            isApplied: this.isApplied,
            fixes: this.fixes,
            performance: {
                memory: performance.memory ? {
                    used: Math.round(performance.memory.usedJSHeapSize / 1048576) + 'MB',
                    total: Math.round(performance.memory.totalJSHeapSize / 1048576) + 'MB'
                } : 'N/A',
                connection: navigator.connection ? {
                    effectiveType: navigator.connection.effectiveType,
                    downlink: navigator.connection.downlink + 'Mbps'
                } : 'N/A'
            }
        };
    }
      /**
     * 清理所有事件監聽器和資源
     */
    destroy() {
        // 移除全局事件監聽器
        this.globalEventHandlers.forEach(({ target, event, handler }) => {
            target.removeEventListener(event, handler);
        });
        this.globalEventHandlers = [];
        
        // 移除網絡狀態監聽器
        if (this.networkChangeHandler && 'connection' in navigator) {
            navigator.connection.removeEventListener('change', this.networkChangeHandler);
            this.networkChangeHandler = null;
        }
        
        // 移除媒體元素監聽器
        this.cleanupMediaElementListeners();
        
        // WeakMap 會自動清理，但我們重置它
        this.mediaElementHandlers = new WeakMap();
        
        this.isApplied = false;
        console.log('[快速修復] 所有監聽器已清理');
    }
    
    /**
     * 清理媒體元素監聽器
     */
    cleanupMediaElementListeners() {
        // 查找所有已優化的媒體元素並移除監聽器
        document.querySelectorAll('video[data-quick-fixes-optimized], audio[data-quick-fixes-optimized]').forEach(element => {
            const handlers = this.mediaElementHandlers.get(element);
            if (handlers) {
                element.removeEventListener('error', handlers.errorHandler);
                element.removeEventListener('stalled', handlers.stalledHandler);
                
                // 移除優化標記
                delete element.dataset.quickFixesOptimized;
            }
        });
        
        console.log('[快速修復] 已清理所有媒體元素監聽器');
    }
}

export { QuickFixes };
