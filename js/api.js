// api.js - 處理所有與 B 站 API 相關的請求

import { CDNOptimizer } from './cdn.js';

// 創建 CDN 優化器實例
const cdnOptimizer = new CDNOptimizer();

// 畫質選項 (完整B站支援的畫質)
const qualityMap = {
    127: '8K 超高清',          // 需要大會員+DASH
    126: '杜比視界',           // 需要大會員+DASH  
    125: 'HDR 真彩色',         // 需要大會員+DASH
    120: '4K 超清',            // 需要大會員
    116: '1080P60 高幀率',     // 需要大會員
    112: '1080P+ 高碼率',      // 需要大會員
    100: '智能修復',           // 需要大會員
    80: '1080P 高清',          // 需要登錄
    74: '720P60 高幀率',       // 需要登錄
    64: '720P 高清',           // 預設畫質
    32: '480P 清晰',
    16: '360P 流暢',
    6: '240P 極速'             // 僅MP4格式
};

// 音質選項（根據 B 站 API 文檔）
const audioQualityMap = {
    30280: '高音質',
    30232: '中音質',
    30216: '低音質'
};

// 解析 BV 號
function getBvId() {
    const match = window.location.pathname.match(/\/video\/(BV[\w]+)/);
    console.log('[LitePlayer] 當前BV號:', match ? match[1] : null);
    return match ? match[1] : null;
}

// 取得 cid
async function fetchCid(bvid) {
    const api = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
    console.log('[LitePlayer] 請求視頻信息API:', api);
    const res = await fetch(api, { credentials: 'include' });
    const data = await res.json();
    console.log('[LitePlayer] 視頻信息API返回:', data);
    if (data.data && data.data.cid) return data.data.cid;
    return null;
}

// 取得視頻流，優先 dash
async function fetchPlayUrl(bvid, cid, qn = 80, audioQuality = null, userFnval = null, userCodec = null) {
    // 根據畫質設置不同的 fnval 參數
    let fnval = userFnval !== null ? userFnval : 16; // 基礎DASH格式
    // 若未自訂，則根據 qn 自動補齊
    if (userFnval === null) {
        if (qn === 125) fnval |= 64; // HDR
        else if (qn === 120) fnval |= 128; // 4K
        else if (qn === 126) fnval |= 512; // 杜比視界
        else if (qn === 127) fnval |= 1024; // 8K
        fnval |= 256; // 杜比音頻
        fnval |= 2048; // AV1
    }
    const api = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=${qn}&fnval=${fnval}&fourk=1`;
    console.log('[LitePlayer] 請求API:', api, `(qn=${qn}, fnval=${fnval}, codec=${userCodec||''})`);
    try {
        const res = await fetch(api, {
            credentials: 'include',
            headers: {
                'Referer': 'https://www.bilibili.com/',
                'User-Agent': navigator.userAgent,
                'Origin': 'https://www.bilibili.com'
            },
        });
        const data = await res.json();
        console.log('[LitePlayer] API返回:', data);// 優先 dash
        if (data.data && data.data.dash && data.data.dash.video && data.data.dash.audio) {
            const dash = data.data.dash;
            // 畫質
            let videoStream = dash.video[0];
            let videoUrl = videoStream?.baseUrl || videoStream?.base_url;
            if (qn && dash.video) {
                // codec 選擇
                let filtered = dash.video;
                if (userCodec) {
                    filtered = dash.video.filter(v => (v.codecs||'').toLowerCase().includes(userCodec));
                }
                const v = filtered.find(v => v.id === qn) || dash.video.find(v => v.id === qn);
                if (v) {
                    videoStream = v;
                    videoUrl = v.baseUrl || v.base_url;
                }
            }
            // 音質
            let audioStream = dash.audio[0];
            let audioUrl = audioStream?.baseUrl || audioStream?.base_url;
            let audioList = dash.audio;
            if (audioQuality && dash.audio) {
                const a = dash.audio.find(a => a.id === audioQuality);
                if (a) {
                    audioStream = a;
                    audioUrl = a.baseUrl || a.base_url;
                }
            }            // CDN 優化處理 (與 Pilipala 一致，同時優化視頻和音頻流)
            const backupVideoUrl = videoStream?.backupUrl || videoStream?.backup_url;
            const backupAudioUrl = audioStream?.backupUrl || audioStream?.backup_url;
            // 優化視頻和音頻 URL
            const optimizedVideoUrl = cdnOptimizer.optimizeVideoUrl(videoUrl, backupVideoUrl);
            const optimizedAudioUrl = cdnOptimizer.optimizeVideoUrl(audioUrl, backupAudioUrl);
            // 提取流信息
            const videoInfo = {
                codec: videoStream?.codecs || 'unknown',
                bandwidth: videoStream?.bandwidth || 0,
                width: videoStream?.width || 0,
                height: videoStream?.height || 0,
                frameRate: videoStream?.frameRate || videoStream?.frame_rate || 0,
                size: videoStream?.size || 0,
                mimeType: videoStream?.mimeType || videoStream?.mime_type || 'unknown'
            };
            const audioInfo = {
                codec: audioStream?.codecs || 'unknown',
                bandwidth: audioStream?.bandwidth || 0,
                size: audioStream?.size || 0,
                mimeType: audioStream?.mimeType || audioStream?.mime_type || 'unknown'
            };
            // 收集可用畫質/音質
            const acceptQn = data.data.accept_quality || [qn];
            const acceptAudio = dash.audio.map(a => a.id);
            return {
                dash: true,
                videoUrl: optimizedVideoUrl,
                audioUrl: optimizedAudioUrl,
                originalVideoUrl: videoUrl,
                originalAudioUrl: audioUrl,
                rawDash: dash,
                acceptQn,
                qn,
                acceptAudio,
                audioQuality,
                videoInfo,
                audioInfo,
                videoStream,
                audioStream
            };
        }
        // 回退 durl
        if (data.data && data.data.durl && data.data.durl[0]) {
            const originalUrl = data.data.durl[0].url;
            const optimizedUrl = cdnOptimizer.optimizeVideoUrl(originalUrl);
            return {
                dash: false,
                videoUrl: optimizedUrl,
                originalVideoUrl: originalUrl,
                acceptQn: data.data.accept_quality || [qn],
                qn
            };
        }
        return null;
    } catch (error) {
        console.error('[LitePlayer] API請求失敗:', error);
        return null;
    }
}

export { 
    getBvId, 
    fetchCid, 
    fetchPlayUrl,
    qualityMap,
    audioQualityMap,
    cdnOptimizer
};