console.log('[LitePlayer] Content script loaded');
// content.js - 入口文件，導入並初始化其他模組

// 檢查是否在正確的頁面
if (window.location.hostname === 'www.bilibili.com') {
    console.log('[LitePlayer] 在 Bilibili 網站上，準備初始化');
    
    // 動態導入以避免模組加載問題
    import('./main.js').then(({ init }) => {
        console.log('[LitePlayer] 模組導入成功，開始初始化');
        init();
    }).catch(error => {
        console.error('[LitePlayer] 模組導入失敗:', error);
    });
} else {
    console.log('[LitePlayer] 不在 Bilibili 網站上，跳過初始化');
}
