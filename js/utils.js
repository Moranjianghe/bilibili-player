// utils.js - 工具函數和通用邏輯
import { getBvId } from './api.js';

// 下載速度監控器
class StreamMonitor {
    constructor() {
        this.videoStats = { downloaded: 0, speed: 0, lastTime: Date.now() };
        this.audioStats = { downloaded: 0, speed: 0, lastTime: Date.now() };
        this.updateInterval = null;
    }
    
    startMonitoring(videoElement, audioElement) {
        this.stopMonitoring(); // 停止之前的監控
        
        this.updateInterval = setInterval(() => {
            this.updateStats(videoElement, audioElement);
        }, 1000);
    }
    
    stopMonitoring() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
    
    updateStats(videoElement, audioElement) {
        const now = Date.now();
        const timeDiff = (now - this.videoStats.lastTime) / 1000;
        
        if (videoElement && videoElement.buffered.length > 0) {
            const bufferedEnd = videoElement.buffered.end(videoElement.buffered.length - 1);
            const newDownloaded = bufferedEnd * (this.getEstimatedBitrate(videoElement) / 8); // 估算下載量
            const downloadDiff = newDownloaded - this.videoStats.downloaded;
            
            this.videoStats.speed = timeDiff > 0 ? downloadDiff / timeDiff : 0;
            this.videoStats.downloaded = newDownloaded;
        }
        
        if (audioElement && audioElement.buffered.length > 0) {
            const bufferedEnd = audioElement.buffered.end(audioElement.buffered.length - 1);
            const newDownloaded = bufferedEnd * (this.getEstimatedBitrate(audioElement) / 8);
            const downloadDiff = newDownloaded - this.audioStats.downloaded;
            
            this.audioStats.speed = timeDiff > 0 ? downloadDiff / timeDiff : 0;
            this.audioStats.downloaded = newDownloaded;
        }
        
        this.videoStats.lastTime = now;
        this.audioStats.lastTime = now;
        
        // 觸發更新事件
        this.onStatsUpdate?.(this.videoStats, this.audioStats);
    }
    
    getEstimatedBitrate(element) {
        // 簡單的碼率估算，實際應用中可以從流信息獲取
        return element === element.closest('#bilibili-lite-player')?.querySelector('video') ? 2000000 : 128000;
    }
}

// 提取 CDN 信息
function extractCDNInfo(url) {
    if (!url) return { host: 'unknown', cdn: 'unknown' };
    
    try {
        const urlObj = new URL(url);
        const host = urlObj.hostname;
        
        // CDN 名稱映射
        const cdnNameMap = {
            'upos-sz-mirrorali.bilivideo.com': '阿里雲',
            'upos-sz-mirrorcos.bilivideo.com': '騰訊雲',
            'upos-sz-mirrorhw.bilivideo.com': '華為雲',
            'upos-sz-mirrorws.bilivideo.com': '網宿',
            'upos-sz-mirrorbda2.bilivideo.com': '百度雲'
        };
        
        // 根據域名判斷 CDN 提供商
        let cdn = 'unknown';
        
        // 先檢查是否是已知的 CDN 節點
        if (cdnNameMap[host]) {
            cdn = cdnNameMap[host];
        }
        // 否則根據域名特徵判斷
        else if (host.includes('bilivideo.com') || host.includes('hdslb.com')) {
            cdn = 'Bilibili CDN';
        } else if (host.includes('acgvideo.com')) {
            cdn = 'Bilibili ACG CDN';
        } else if (host.includes('akamai')) {
            cdn = 'Akamai';
        } else if (host.includes('cloudflare')) {
            cdn = 'Cloudflare';
        } else if (host.includes('fastly')) {
            cdn = 'Fastly';
        }
        
        return { host, cdn };
    } catch (e) {
        return { host: 'unknown', cdn: 'unknown' };
    }
}

// 格式化字節大小
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 格式化碼率
function formatBitrate(bitrate) {
    if (bitrate === 0) return '0 bps';
    const k = 1000;
    const sizes = ['bps', 'Kbps', 'Mbps', 'Gbps'];
    const i = Math.floor(Math.log(bitrate) / Math.log(k));
    return parseFloat((bitrate / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 監聽 B 站 SPA 跳轉（如點擊推薦視頻、上下集等）自動刷新播放器
function observeBVChange(callback) {
    let lastBv = getBvId();
    let ticking = false;
    
    function checkBV() {
        const curBv = getBvId();
        if (curBv && curBv !== lastBv) {
            lastBv = curBv;
            // 回調通知 BV 變化
            callback && callback(curBv);
        }
        ticking = false;
    }
    
    function onUrlChange() {
        if (!ticking) {
            ticking = true;
            setTimeout(checkBV, 200); // 延遲避免 DOM 未切換完
        }
    }
    
    // 監聽 pushState/replaceState
    const rawPush = history.pushState;
    const rawReplace = history.replaceState;
    history.pushState = function() { rawPush.apply(this, arguments); onUrlChange(); };
    history.replaceState = function() { rawReplace.apply(this, arguments); onUrlChange(); };
    window.addEventListener('popstate', onUrlChange);
}

// 監聽所有 <a> 標籤點擊，若 href 為 /video/BV*，則攔截並 pushState，觸發播放器自動刷新
function hijackBVLinks() {
    document.body.addEventListener('click', function(e) {
        let a = e.target;
        // 向上找 a 標籤
        while (a && a.tagName !== 'A') a = a.parentNode;
        if (!a || !a.getAttribute) return;
        const href = a.getAttribute('href');
        if (href && /^\/video\/BV[\w]+/.test(href)) {
            // 攔截並用 pushState 跳轉
            e.preventDefault();
            history.pushState({}, '', href);
            // 觸發 url 監聽
            const event = new Event('popstate');
            window.dispatchEvent(event);
        }
    }, true);
}

export { observeBVChange, hijackBVLinks, StreamMonitor, extractCDNInfo, formatBytes, formatBitrate };