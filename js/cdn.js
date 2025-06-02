// cdn.js - CDN 優選功能
export class CDNOptimizer {
    constructor() {
        // CDN 節點列表，按優先級排序
        this.cdnList = {
            'ali': 'upos-sz-mirrorali.bilivideo.com',        // 阿里雲
            'cos': 'upos-sz-mirrorcos.bilivideo.com',        // 騰訊雲  
            'hw': 'upos-sz-mirrorhw.bilivideo.com',          // 華為雲
            'ws': 'upos-sz-mirrorws.bilivideo.com',          // 網宿
            'bda2': 'upos-sz-mirrorbda2.bilivideo.com',      // 百度雲
        };
        
        // 默認優選 CDN（可通過測速動態調整）
        this.preferredCDN = 'ali';
        
        // CDN 速度測試結果緩存
        this.speedTestResults = {};
        
        // 測速超時時間（毫秒）
        this.speedTestTimeout = 3000;
    }

    /**
     * 優化視頻 URL，選擇最佳 CDN
     * @param {string} originalUrl - 原始視頻 URL
     * @param {string} backupUrl - 備用 URL（可選）
     * @returns {string} 優化後的 URL
     */
    optimizeVideoUrl(originalUrl, backupUrl = '') {
        console.log('[CDN] 原始 URL:', originalUrl);
        console.log('[CDN] 備用 URL:', backupUrl);
        
        // 優先使用 backupUrl，通常是 upgcxcode 地址，播放更穩定
        let targetUrl = '';
        if (backupUrl && backupUrl.includes('http')) {
            targetUrl = backupUrl;
            console.log('[CDN] 使用備用 URL');
        } else {
            targetUrl = originalUrl;
            console.log('[CDN] 使用原始 URL');
        }

        // 處理 mcdn 域名的特殊情況
        if (targetUrl.includes('.mcdn.bilivideo')) {
            console.log('[CDN] 檢測到 mcdn 域名，使用代理');
            return `https://proxy-tf-all-ws.bilivideo.com/?url=${encodeURIComponent(targetUrl)}`;
        }

        // 處理 upgcxcode 路徑，替換為優選 CDN
        if (targetUrl.includes('/upgcxcode/')) {
            console.log('[CDN] 檢測到 upgcxcode 路徑，替換 CDN');
            const optimizedUrl = this.replaceWithPreferredCDN(targetUrl);
            console.log('[CDN] 優化後 URL:', optimizedUrl);
            return optimizedUrl;
        }

        console.log('[CDN] 無需優化，返回原始 URL');
        return targetUrl;
    }

    /**
     * 替換為優選 CDN 節點
     * @param {string} url - 包含 upgcxcode 的 URL
     * @returns {string} 替換後的 URL
     */
    replaceWithPreferredCDN(url) {
        const preferredHost = this.cdnList[this.preferredCDN];
        if (!preferredHost) {
            console.warn('[CDN] 未找到優選 CDN，使用原始 URL');
            return url;
        }

        // 正則替換域名部分
        const reg = /(https?:\/\/)(.*?)(\/upgcxcode\/)/;
        const replacedUrl = url.replace(reg, `https://${preferredHost}/upgcxcode/`);
        
        console.log(`[CDN] 替換 CDN: ${this.preferredCDN} -> ${preferredHost}`);
        return replacedUrl;
    }

    /**
     * 測試 CDN 節點速度
     * @param {string} testVideoUrl - 用於測速的視頻 URL
     * @returns {Promise<Object>} CDN 速度測試結果
     */
    async testCDNSpeed(testVideoUrl) {
        console.log('[CDN] 開始 CDN 速度測試');
        const results = {};
        
        for (const [cdnKey, cdnHost] of Object.entries(this.cdnList)) {
            try {
                const testUrl = testVideoUrl.replace(/(https?:\/\/)(.*?)(\/upgcxcode\/)/, `https://${cdnHost}/upgcxcode/`);
                const startTime = Date.now();
                
                // 使用 HEAD 請求測試連接速度
                const response = await this.testConnection(testUrl);
                const endTime = Date.now();
                const latency = endTime - startTime;
                
                results[cdnKey] = {
                    host: cdnHost,
                    latency: latency,
                    success: response.success,
                    status: response.status
                };
                
                console.log(`[CDN] ${cdnKey} 延遲: ${latency}ms, 狀態: ${response.status}`);
            } catch (error) {
                console.warn(`[CDN] ${cdnKey} 測試失敗:`, error);
                results[cdnKey] = {
                    host: cdnHost,
                    latency: Infinity,
                    success: false,
                    error: error.message
                };
            }
        }
        
        // 緩存結果
        this.speedTestResults = results;
        
        // 自動選擇最快的 CDN
        this.selectBestCDN();
        
        return results;
    }

    /**
     * 測試單個 CDN 連接
     * @param {string} url - 測試 URL
     * @returns {Promise<Object>} 連接測試結果
     */
    testConnection(url) {
        return new Promise((resolve) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                controller.abort();
                resolve({ success: false, status: 'timeout' });
            }, this.speedTestTimeout);

            fetch(url, {
                method: 'HEAD',
                signal: controller.signal,
                cache: 'no-cache'
            })
            .then(response => {
                clearTimeout(timeoutId);
                resolve({
                    success: response.ok,
                    status: response.status
                });
            })
            .catch(error => {
                clearTimeout(timeoutId);
                resolve({
                    success: false,
                    status: error.name === 'AbortError' ? 'timeout' : 'error'
                });
            });
        });
    }

    /**
     * 根據測速結果選擇最佳 CDN
     */
    selectBestCDN() {
        if (!this.speedTestResults || Object.keys(this.speedTestResults).length === 0) {
            return;
        }

        let bestCDN = this.preferredCDN;
        let bestLatency = Infinity;

        for (const [cdnKey, result] of Object.entries(this.speedTestResults)) {
            if (result.success && result.latency < bestLatency) {
                bestLatency = result.latency;
                bestCDN = cdnKey;
            }
        }

        if (bestCDN !== this.preferredCDN) {
            console.log(`[CDN] 切換到更快的 CDN: ${this.preferredCDN} -> ${bestCDN} (${bestLatency}ms)`);
            this.preferredCDN = bestCDN;
        } else {
            console.log(`[CDN] 保持當前 CDN: ${bestCDN} (${bestLatency}ms)`);
        }
    }

    /**
     * 手動設置優選 CDN
     * @param {string} cdnKey - CDN 鍵名
     */
    setPreferredCDN(cdnKey) {
        if (this.cdnList[cdnKey]) {
            this.preferredCDN = cdnKey;
            console.log(`[CDN] 手動設置優選 CDN: ${cdnKey}`);
        } else {
            console.warn(`[CDN] 無效的 CDN 鍵名: ${cdnKey}`);
        }
    }

    /**
     * 獲取當前優選 CDN 信息
     * @returns {Object} CDN 信息
     */
    getCurrentCDNInfo() {
        return {
            key: this.preferredCDN,
            host: this.cdnList[this.preferredCDN],
            testResults: this.speedTestResults
        };
    }

    /**
     * 獲取所有可用 CDN 列表
     * @returns {Object} CDN 列表
     */
    getAvailableCDNs() {
        return { ...this.cdnList };
    }

    /**
     * 重置為默認 CDN
     */
    resetToDefault() {
        this.preferredCDN = 'ali';
        this.speedTestResults = {};
        console.log('[CDN] 重置為默認 CDN: ali');
    }
}

// 創建全局 CDN 優化器實例
const cdnOptimizer = new CDNOptimizer();

export { cdnOptimizer };
