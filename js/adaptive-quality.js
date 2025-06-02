// adaptive-quality.js - 自適應畫質調整器
/**
 * 自適應畫質調整器
 * 根據網絡狀況和播放表現自動調整視頻畫質
 */
class AdaptiveQuality {
    constructor() {
        this.config = {
            enabled: true,
            adjustInterval: 5000, // 5秒檢查一次
            stallThreshold: 3,    // 連續3次卡頓就降畫質
            bufferThreshold: 10,  // 緩衝超過10秒可以嘗試提升畫質
            speedThreshold: {
                low: 1.5,   // 1.5Mbps 以下使用低畫質
                medium: 4,  // 4Mbps 以下使用中等畫質
                high: 10    // 10Mbps 以上可使用高畫質
            }
        };
        
        this.state = {
            currentQuality: null,
            stallCount: 0,
            lastStallTime: 0,
            avgNetworkSpeed: 0,
            bufferHealth: 0,
            isAdjusting: false,
            adjustHistory: []
        };
        
        this.qualityLevels = [
            { qn: 16, name: '360P', bitrate: 0.5 },
            { qn: 32, name: '480P', bitrate: 1.2 },
            { qn: 64, name: '720P', bitrate: 2.5 },
            { qn: 74, name: '720P60', bitrate: 3.5 },
            { qn: 80, name: '1080P', bitrate: 5.0 },
            { qn: 112, name: '1080P+', bitrate: 7.5 },
            { qn: 116, name: '1080P60', bitrate: 10.0 },
            { qn: 120, name: '4K', bitrate: 20.0 }
        ];
        
        this.intervalId = null;
        console.log('[自適應畫質] 初始化完成');
    }
    
    /**
     * 啟動自適應畫質調整
     * @param {number} currentQuality - 當前畫質
     * @param {function} qualityChangeCallback - 畫質變更回調
     */
    start(currentQuality, qualityChangeCallback) {
        this.state.currentQuality = currentQuality;
        this.qualityChangeCallback = qualityChangeCallback;
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        
        this.intervalId = setInterval(() => {
            this.checkAndAdjustQuality();
        }, this.config.adjustInterval);
        
        // 監聽自定義事件
        document.addEventListener('qualityChangeRequest', (e) => {
            this.handleQualityRequest(e.detail);
        });
        
        console.log('[自適應畫質] 已啟動，當前畫質:', this.getQualityName(currentQuality));
    }
    
    /**
     * 停止自適應畫質調整
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        console.log('[自適應畫質] 已停止');
    }
    
    /**
     * 更新網絡狀態
     * @param {number} speed - 網絡速度 (Mbps)
     * @param {number} bufferHealth - 緩衝健康度 (秒)
     */
    updateNetworkStatus(speed, bufferHealth) {
        this.state.avgNetworkSpeed = speed;
        this.state.bufferHealth = bufferHealth;
    }
    
    /**
     * 記錄卡頓事件
     */
    recordStall() {
        this.state.stallCount++;
        this.state.lastStallTime = Date.now();
        console.log('[自適應畫質] 記錄卡頓事件:', this.state.stallCount);
    }
    
    /**
     * 檢查並調整畫質
     */
    checkAndAdjustQuality() {
        if (!this.config.enabled || this.state.isAdjusting) return;
        
        const decision = this.makeQualityDecision();
        
        if (decision.shouldChange) {
            this.adjustQuality(decision.targetQuality, decision.reason);
        }
    }
    
    /**
     * 做出畫質調整決策
     * @returns {Object} 決策結果
     */
    makeQualityDecision() {
        const current = this.state.currentQuality;
        const speed = this.state.avgNetworkSpeed;
        const buffer = this.state.bufferHealth;
        const stallCount = this.state.stallCount;
        
        // 決策1: 如果頻繁卡頓，降低畫質
        if (stallCount >= this.config.stallThreshold) {
            const lowerQuality = this.getLowerQuality(current);
            if (lowerQuality) {
                return {
                    shouldChange: true,
                    targetQuality: lowerQuality.qn,
                    reason: `頻繁卡頓(${stallCount}次)，降低畫質到${lowerQuality.name}`
                };
            }
        }
        
        // 決策2: 根據網絡速度調整
        const recommendedQuality = this.getRecommendedQualityBySpeed(speed);
        if (recommendedQuality && recommendedQuality.qn !== current) {
            const reason = speed < this.getQualityById(current)?.bitrate ? 
                `網速不足(${speed.toFixed(1)}Mbps)，降低畫質` : 
                `網速充足(${speed.toFixed(1)}Mbps)，提升畫質`;
                
            return {
                shouldChange: true,
                targetQuality: recommendedQuality.qn,
                reason: reason + `到${recommendedQuality.name}`
            };
        }
        
        // 決策3: 如果緩衝充足且網速好，嘗試提升畫質
        if (buffer > this.config.bufferThreshold && stallCount === 0) {
            const higherQuality = this.getHigherQuality(current);
            if (higherQuality && speed >= higherQuality.bitrate) {
                return {
                    shouldChange: true,
                    targetQuality: higherQuality.qn,
                    reason: `緩衝充足(${buffer.toFixed(1)}s)且網速良好，提升畫質到${higherQuality.name}`
                };
            }
        }
        
        return { shouldChange: false };
    }
    
    /**
     * 根據網速推薦畫質
     * @param {number} speed - 網絡速度 (Mbps)
     * @returns {Object|null} 推薦畫質
     */
    getRecommendedQualityBySpeed(speed) {
        if (speed <= 0) return null;
        
        // 為網速添加一些余量，避免頻繁切換
        const margin = 1.2;
        const effectiveSpeed = speed / margin;
        
        // 找到最高的可用畫質
        for (let i = this.qualityLevels.length - 1; i >= 0; i--) {
            const quality = this.qualityLevels[i];
            if (effectiveSpeed >= quality.bitrate) {
                return quality;
            }
        }
        
        return this.qualityLevels[0]; // 返回最低畫質
    }
    
    /**
     * 獲取更低的畫質
     * @param {number} currentQn - 當前畫質
     * @returns {Object|null} 更低的畫質
     */
    getLowerQuality(currentQn) {
        const currentIndex = this.qualityLevels.findIndex(q => q.qn === currentQn);
        if (currentIndex > 0) {
            return this.qualityLevels[currentIndex - 1];
        }
        return null;
    }
    
    /**
     * 獲取更高的畫質
     * @param {number} currentQn - 當前畫質
     * @returns {Object|null} 更高的畫質
     */
    getHigherQuality(currentQn) {
        const currentIndex = this.qualityLevels.findIndex(q => q.qn === currentQn);
        if (currentIndex < this.qualityLevels.length - 1) {
            return this.qualityLevels[currentIndex + 1];
        }
        return null;
    }
    
    /**
     * 根據ID獲取畫質信息
     * @param {number} qn - 畫質ID
     * @returns {Object|null} 畫質信息
     */
    getQualityById(qn) {
        return this.qualityLevels.find(q => q.qn === qn) || null;
    }
    
    /**
     * 獲取畫質名稱
     * @param {number} qn - 畫質ID
     * @returns {string} 畫質名稱
     */
    getQualityName(qn) {
        const quality = this.getQualityById(qn);
        return quality ? quality.name : `畫質${qn}`;
    }
    
    /**
     * 執行畫質調整
     * @param {number} targetQuality - 目標畫質
     * @param {string} reason - 調整原因
     */
    async adjustQuality(targetQuality, reason) {
        if (this.state.isAdjusting) return;
        
        this.state.isAdjusting = true;
        console.log('[自適應畫質] 調整畫質:', reason);
        
        try {
            // 記錄調整歷史
            this.state.adjustHistory.push({
                timestamp: Date.now(),
                from: this.state.currentQuality,
                to: targetQuality,
                reason: reason
            });
            
            // 保持最近10次記錄
            if (this.state.adjustHistory.length > 10) {
                this.state.adjustHistory.shift();
            }
            
            // 調用畫質變更回調
            if (this.qualityChangeCallback) {
                await this.qualityChangeCallback(targetQuality);
            }
            
            // 更新當前畫質
            this.state.currentQuality = targetQuality;
            
            // 重置卡頓計數
            this.state.stallCount = 0;
            
            console.log('[自適應畫質] 畫質調整完成:', this.getQualityName(targetQuality));
            
        } catch (error) {
            console.error('[自適應畫質] 畫質調整失敗:', error);
        } finally {
            // 延遲一段時間再允許下次調整，避免頻繁切換
            setTimeout(() => {
                this.state.isAdjusting = false;
            }, 10000);
        }
    }
    
    /**
     * 處理外部畫質變更請求
     * @param {Object} request - 請求詳情
     */
    handleQualityRequest(request) {
        const { direction, reason } = request;
        const current = this.state.currentQuality;
        
        let targetQuality = null;
        
        if (direction === 'higher') {
            const higher = this.getHigherQuality(current);
            targetQuality = higher?.qn;
        } else if (direction === 'lower') {
            const lower = this.getLowerQuality(current);
            targetQuality = lower?.qn;
        }
        
        if (targetQuality) {
            this.adjustQuality(targetQuality, `外部請求: ${reason}`);
        }
    }
    
    /**
     * 設置配置
     * @param {Object} config - 配置項
     */
    setConfig(config) {
        Object.assign(this.config, config);
        console.log('[自適應畫質] 配置已更新:', this.config);
    }
    
    /**
     * 獲取統計信息
     * @returns {Object} 統計信息
     */
    getStats() {
        return {
            currentQuality: this.getQualityName(this.state.currentQuality),
            stallCount: this.state.stallCount,
            adjustHistory: this.state.adjustHistory,
            avgNetworkSpeed: this.state.avgNetworkSpeed,
            bufferHealth: this.state.bufferHealth,
            isEnabled: this.config.enabled,
            isAdjusting: this.state.isAdjusting
        };
    }
    
    /**
     * 手動觸發畫質評估
     */
    triggerEvaluation() {
        console.log('[自適應畫質] 手動觸發畫質評估');
        this.checkAndAdjustQuality();
    }
}

export { AdaptiveQuality };
