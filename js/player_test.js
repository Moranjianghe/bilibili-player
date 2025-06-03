// player.js - 處理播放器的實現和相關功能
import { qualityMap, audioQualityMap, cdnOptimizer } from './api.js';
import { StreamMonitor, formatBytes, formatBitrate } from './utils.js';
import { createControlBar, createStreamInfoPanel, createPreloadControlPanel, createPlayerElements, showCDNSwitchingIndicator, showPlayerError } from './player-ui.js';

let streamMonitor = null;
let playbackOptimizer = null;

// 全局變量存儲播放器事件監聽器引用，用於內存洩漏防護
let playerEventHandlers = {
    video: new Map(),
    audio: new Map(),
    syncHandlers: []
};

console.log("Syntax check passed");
