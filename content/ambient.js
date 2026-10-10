// Ambient Light for 動画配信 - content script
// 動画再生画面に、映像の色に合わせて光るアンビエントライト効果を追加する。
//
// 実装方針:
// 対象サイトの多くはReactなどでDOMを管理しているため、既存の要素を別のラッパーで
// 包み直す(=付け替える)と、フレームワークが後からその要素を removeChild しようとして
// NotFoundError を起こしサイトを壊す恐れがある。
// そのため動画プレイヤーの要素は一切移動せず、同じ親要素の「兄弟」として
// グロー用canvasを挿入するだけに留める。
(() => {
  'use strict';

  const DEFAULTS = {
    enabled: true,
    strength: 65, // 0-100: ぼかし/広がり/明るさの総合強度
    fps: 24       // サンプリングの目標フレームレート
  };

  const SAMPLE_W = 32;
  const SAMPLE_H = 18;
  const CANVAS_W = 160;
  const CANVAS_H = 90;
  const CHECK_INTERVAL_MS = 1000;

  // サイトごとのプレイヤー検出ロジック。
  // host: このcontent_scriptがmatchesで読み込まれた各サイトのホスト名の一部。
  // findVideo: 対象の<video>要素を探す。見つからない場合はnullを返す。
  // findContainer: グローcanvasを挿入する基準となる要素(videoの実質的なラッパー)を返す。
  const SITE_ADAPTERS = [
    {
      host: 'tver.jp',
      findVideo: () =>
        document.querySelector('.video-js video.vjs-tech') ||
        document.querySelector('video.vjs-tech') ||
        document.querySelector('video'),
      findContainer: (video) => video.closest('.video-js') || video.parentElement
    },
    {
      host: 'abema.tv',
      findVideo: () =>
        document.querySelector('[class*="Video__video-element"]') ||
        document.querySelector('video'),
      findContainer: (video) =>
        video.closest('[class*="Video__container"]') || video.parentElement
    },
    {
      host: 'nicovideo.jp',
      findVideo: () => document.querySelector('video'),
      findContainer: (video) => video.parentElement
    }
  ];

  function getSiteAdapter() {
    const host = location.hostname;
    return (
      SITE_ADAPTERS.find((site) => host.includes(site.host)) || {
        // 未知サイトでも<video>があれば汎用ロジックで試みる
        findVideo: () => document.querySelector('video'),
        findContainer: (video) => video.parentElement
      }
    );
  }

  const siteAdapter = getSiteAdapter();

  let settings = { ...DEFAULTS };

  let video = null;
  let parentEl = null;   // glowCanvasを挿入している親要素(=containerの親)
  let containerEl = null;
  let glowCanvas = null;
  let glowCtx = null;
  let sampleCanvas = null;
  let sampleCtx = null;

  let rafId = null;
  let lastDrawTime = 0;
  let canvasTainted = false;

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function loadSettings() {
    return new Promise((resolve) => {
      if (!chrome?.storage?.sync) { resolve(); return; }
      chrome.storage.sync.get(DEFAULTS, (items) => {
        settings = { ...DEFAULTS, ...items };
        resolve();
      });
    });
  }

  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      let changed = false;
      for (const key in changes) {
        if (key in DEFAULTS) {
          settings[key] = changes[key].newValue;
          changed = true;
        }
      }
      if (changed) applySettingsToDom();
    });
  }

  function findVideo() {
    return siteAdapter.findVideo();
  }

  function isFullscreen() {
    return !!document.fullscreenElement;
  }

  function applySettingsToDom() {
    if (!glowCanvas) return;
    const visible = settings.enabled && !canvasTainted && !isFullscreen();
    glowCanvas.style.display = visible ? 'block' : 'none';

    const strength = clamp(Number(settings.strength) || 0, 0, 100) / 100;
    const blurPx = 24 + strength * 70;      // 24px - 94px
    const scale = 1.12 + strength * 0.38;   // 1.12 - 1.5
    const opacity = 0.45 + strength * 0.45; // 0.45 - 0.9

    glowCanvas.style.filter = `blur(${blurPx}px) saturate(1.6)`;
    glowCanvas.style.transform = `scale(${scale})`;
    glowCanvas.style.opacity = String(opacity);
  }

  function teardownDom() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (glowCanvas && glowCanvas.isConnected) {
      glowCanvas.remove();
    }
    glowCanvas = null;
    glowCtx = null;
    parentEl = null;
    containerEl = null;
  }

  function buildStructure() {
    const container = siteAdapter.findContainer(video);
    if (!container || !container.parentElement) return false;

    containerEl = container;
    parentEl = container.parentElement;

    // 絶対配置の基準にするため、親要素がstaticなら位置指定だけ変更する
    // (要素の移動や削除は行わないのでフレームワークの管理には影響しない)
    const parentPosition = getComputedStyle(parentEl).position;
    if (parentPosition === 'static') {
      parentEl.style.position = 'relative';
    }

    glowCanvas = document.createElement('canvas');
    glowCanvas.className = 'alf-glow';
    glowCanvas.width = CANVAS_W;
    glowCanvas.height = CANVAS_H;
    glowCanvas.setAttribute('aria-hidden', 'true');

    // containerより前に挿入する「追加」のみ行う(既存ノードの移動はしない)
    // DOM順で手前にあるためcontainerの背面に描画される
    parentEl.insertBefore(glowCanvas, parentEl.firstChild);

    glowCtx = glowCanvas.getContext('2d', { alpha: false });

    sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = SAMPLE_W;
    sampleCanvas.height = SAMPLE_H;
    sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });

    return true;
  }

  function ensureStructure() {
    const found = findVideo();
    if (!found) return;

    const videoChanged = found !== video;
    const domBroken = glowCanvas && !glowCanvas.isConnected;
    const containerMoved = containerEl && containerEl.parentElement !== parentEl;

    if (!videoChanged && !domBroken && !containerMoved) return;

    teardownDom();
    video = found;
    canvasTainted = false;

    if (!buildStructure()) return;

    applySettingsToDom();
    startLoop();
  }

  function drawFrame() {
    if (!video || video.readyState < 2 || !video.videoWidth) return;
    try {
      sampleCtx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
      glowCtx.drawImage(sampleCanvas, 0, 0, CANVAS_W, CANVAS_H);
    } catch (err) {
      // クロスオリジン制約やDRMによりcanvasがtaintedになった場合は諦めて非表示にする
      canvasTainted = true;
      console.warn('[Ambient Light] 映像の読み取りがブロックされたため、この動画では効果を無効化します。', err);
      applySettingsToDom();
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }
  }

  function startLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    const tick = (ts) => {
      rafId = requestAnimationFrame(tick);
      if (!settings.enabled || canvasTainted || document.hidden || isFullscreen()) return;
      const interval = 1000 / clamp(Number(settings.fps) || DEFAULTS.fps, 5, 60);
      if (ts - lastDrawTime < interval) return;
      lastDrawTime = ts;
      drawFrame();
    };
    rafId = requestAnimationFrame(tick);
  }

  function handleFullscreenChange() {
    applySettingsToDom();
  }

  function handleVisibilityChange() {
    // タブが再表示された際に状態を反映し直す
    applySettingsToDom();
  }

  async function init() {
    await loadSettings();
    ensureStructure();
    setInterval(ensureStructure, CHECK_INTERVAL_MS);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  init();
})();
