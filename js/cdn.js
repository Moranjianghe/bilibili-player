// cdn.js - CDN 優選功能 (基於 Pilipala 的實現，但保留手動選擇功能)
export class CDNOptimizer {    constructor() {
        // CDN 節點列表，按優先級排序
        this.cdnList = {
            'ali': 'upos-sz-mirrorali.bilivideo.com',        // 阿里雲 (推薦，與 Pilipala 默認一致)
            'cos': 'upos-sz-mirrorcos.bilivideo.com',        // 騰訊雲  
            'hw': 'upos-sz-mirrorhw.bilivideo.com',          // 華為雲
            'ws': 'upos-sz-mirrorws.bilivideo.com',          // 網宿
            'bda2': 'upos-sz-mirrorbda2.bilivideo.com',      // 百度雲
        };
        
        // 從 localStorage 讀取 CDN 設置
        const enableCdn = localStorage.getItem('enableCdn') !== 'false'; // 默認啟用
        const preferredCdn = localStorage.getItem('preferredCdn') || 'ali';
        
        // 僅在啟用 CDN 優化時使用用戶設置的 CDN
        this.preferredCDN = enableCdn && this.cdnList[preferredCdn] ? preferredCdn : 'ali';
        
        console.log(`[CDN] 初始化 CDN 優化器: 啟用=${enableCdn}, 首選CDN=${this.preferredCDN}`);
    }    /**
     * 優化視頻 URL，使用 Pilipala 的優選邏輯，但保留手動選擇 CDN 的功能
     * @param {string} originalUrl - 原始視頻 URL
     * @param {string} backupUrl - 備用 URL（可選）
     * @returns {string} 優化後的 URL
     */    optimizeVideoUrl(originalUrl, backupUrl = '') {
        console.log('[CDN] 原始 URL:', originalUrl);
        console.log('[CDN] 備用 URL:', backupUrl);
        
        // 檢查 CDN 優化是否啟用
        const enableCdn = localStorage.getItem('enableCdn') !== 'false';
        if (!enableCdn) {
            console.log('[CDN] CDN 優化已禁用，使用原始 URL');
            return originalUrl;
        }
        
        // 優先使用 backupUrl，通常是 upgcxcode 地址，播放更穩定
        let videoUrl = '';
        if (backupUrl && backupUrl.includes('http')) {
            videoUrl = backupUrl;
            console.log('[CDN] 使用備用 URL');
        } else {
            videoUrl = originalUrl;
            console.log('[CDN] 使用原始 URL');
        }

        // 處理 mcdn 域名的特殊情況
        if (videoUrl.includes('.mcdn.bilivideo') || 
            videoUrl.includes('.mcdn.bilivideo.cn') || 
            videoUrl.includes('.mcdn.bilivideo.com')) {
            console.log('[CDN] 檢測到 mcdn 域名:', videoUrl);
            const proxyUrl = `https://proxy-tf-all-ws.bilivideo.com/?url=${encodeURIComponent(videoUrl)}`;
            console.log('[CDN] 使用代理:', proxyUrl);
            return proxyUrl;
        }

        // 處理 upgcxcode 路徑，替換為優選 CDN (Pilipala 風格)
        if (videoUrl.includes('/upgcxcode/')) {
            console.log('[CDN] 檢測到 upgcxcode 路徑，替換 CDN');
            
            // 從 localStorage 獲取用戶選擇的 CDN（保留手動選擇功能）
            const preferredCdn = localStorage.getItem('preferredCdn') || 'ali';
            // 獲取對應的 CDN 主機名
            const cdn = this.cdnList[preferredCdn] || this.cdnList['ali'];
            
            // 使用正則表達式替換域名部分（Pilipala 風格的簡化實現）
            const reg = /(https?:\/\/)(.*?)(\/upgcxcode\/)/;
            const optimizedUrl = videoUrl.replace(reg, `https://${cdn}/upgcxcode/`);
            
            console.log(`[CDN] 替換 CDN: ${preferredCdn} -> ${cdn}`);
            this.preferredCDN = preferredCdn; // 更新當前優選 CDN
            return optimizedUrl;
        }        console.log('[CDN] 無需優化，返回原始 URL');
        return videoUrl;
    }    /**
     * 替換為優選 CDN 節點 (已棄用，為保持兼容性)
     * @param {string} url - 包含 upgcxcode 的 URL
     * @returns {string} 替換後的 URL
     * @deprecated 使用新的 optimizeVideoUrl 方法替代
     */
    replaceWithPreferredCDN(url) {
        console.log('[CDN] 警告: replaceWithPreferredCDN 方法已棄用，使用 optimizeVideoUrl 代替');
        
        const preferredCdn = localStorage.getItem('preferredCdn') || 'ali';
        const cdn = this.cdnList[preferredCdn] || this.cdnList['ali'];
        
        // 正則替換域名部分
        const reg = /(https?:\/\/)(.*?)(\/upgcxcode\/)/;
        const replacedUrl = url.replace(reg, `https://${cdn}/upgcxcode/`);
        
        console.log(`[CDN] 替換 CDN: ${preferredCdn} -> ${cdn}`);
        return replacedUrl;
    }/**
     * 獲取當前 CDN 信息，簡化版
     * @returns {Object} CDN 信息
     */
    getCDNInfo() {
        return {
            key: this.preferredCDN,
            host: this.cdnList[this.preferredCDN]
        };
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
    }    /**
     * 獲取當前優選 CDN 信息
     * @returns {Object} CDN 信息
     */
    getCurrentCDNInfo() {
        return {
            key: this.preferredCDN,
            host: this.cdnList[this.preferredCDN]
        };
    }

    /**
     * 獲取所有可用 CDN 列表
     * @returns {Object} CDN 列表
     */
    getAvailableCDNs() {
        return { ...this.cdnList };
    }    /**
     * 重置為默認 CDN (與 Pilipala 一致，使用阿里雲)
     */
    resetToDefault() {
        this.preferredCDN = 'ali';
        localStorage.setItem('preferredCdn', 'ali');
        console.log('[CDN] 重置為默認 CDN: ali (阿里雲)');
    }
}

// 創建全局 CDN 優化器實例 (用於視頻、音頻流以及直播)
const cdnOptimizer = new CDNOptimizer();

// 監聽 localStorage 變化以同步更新 CDN 設置
// 這樣用戶在播放過程中修改 CDN 設置也能生效
window.addEventListener('storage', (event) => {
    if (event.key === 'enableCdn' || event.key === 'preferredCdn') {
        console.log(`[CDN] 檢測到 ${event.key} 變更: ${event.oldValue} -> ${event.newValue}`);
        
        // 更新 CDN 設置
        if (event.key === 'preferredCdn' && event.newValue) {
            if (cdnOptimizer.cdnList[event.newValue]) {
                cdnOptimizer.preferredCDN = event.newValue;
                console.log(`[CDN] 已更新優選 CDN: ${event.newValue}`);
            }
        }
    }
});

export { cdnOptimizer };
