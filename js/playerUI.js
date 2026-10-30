/* 播放页增强 —— 本地 / 远程（Meting）模式通用实现
 * index.html 直接加载；window.ap 就绪后自动初始化。
 */
(function () {
  'use strict';

  function pageEl() { return document.getElementById('heoMusic-page'); }

  // CSS url() 安全拼接：封面 URL 可能含撇号（如专辑 1999-I'm OK），
  // 单引号包裹时撇号会提前终止字符串，整条 background-image 声明被浏览器丢弃，
  // 表现为「切到该专辑的歌封面/背景不更新」。统一用双引号包裹并转义 " 与 \。
  window.saltCssUrl = function (u) {
    return 'url("' + String(u).replace(/["\\]/g, function (c) { return encodeURIComponent(c); }) + '")';
  };

  // 强调色固定为 #4CC2FF；背景用封面模糊（syncSaltCover 设 --salt-cover），
  // 不再读封面像素取平均色，彻底消除「读像素需要 CORS」带来的反复失败与报错。

  var lastCoverBg = null;

  function syncSaltCover() {
    var page = pageEl();
    if (!page) return;
    var pic = page.querySelector('.aplayer-pic');
    if (!pic) return;
    var bg = pic.style.backgroundImage || '';
    if (bg === lastCoverBg) return;
    lastCoverBg = bg;
    var hasCover = bg && bg !== 'none';
    page.style.setProperty('--salt-cover', hasCover ? bg : 'none');
    page.classList.toggle('salt-no-cover', !hasCover);
  }

  function ensureNowTitle(page) {
    var info = page.querySelector('.aplayer-info');
    if (!info) return null;
    var el = info.querySelector('.salt-now-title');
    if (!el) {
      el = document.createElement('div');
      el.className = 'salt-now-title';
      info.insertBefore(el, info.firstChild);
    }
    return el;
  }

  function updateNowTitle() {
    var page = pageEl();
    var ap = window.ap;
    if (!page || !ap || !ap.list) return;
    var audio = ap.list.audios && ap.list.audios[ap.list.index];
    var el = ensureNowTitle(page);
    if (!el) return;
    el.textContent = audio ? ((audio.artist ? audio.artist + ' - ' : '') + (audio.name || '')) : '';
    setTimeout(updateMarquee, 0);
  }

  // 底栏「曲名 - 歌手」溢出时循环滚动，放得下则静止
  function updateMarquee() {
    var page = pageEl();
    if (!page) return;
    var music = page.querySelector('.salt-capsule-meta .aplayer-music');
    if (!music) return;
    var inner = music.querySelector('.salt-marquee-inner');
    if (!inner) {
      inner = document.createElement('span');
      inner.className = 'salt-marquee-inner';
      while (music.firstChild) inner.appendChild(music.firstChild);
      music.appendChild(inner);
    }
    var overflow = inner.scrollWidth - music.clientWidth;
    if (overflow > 6) {
      var dist = overflow + 28;
      music.classList.add('salt-marquee');
      music.style.setProperty('--salt-marquee-shift', '-' + dist + 'px');
      music.style.setProperty('--salt-marquee-dur', Math.max(9, Math.min(22, dist / 20)).toFixed(1) + 's');
    } else {
      music.classList.remove('salt-marquee');
      music.style.removeProperty('--salt-marquee-shift');
    }
  }

  function setupSaltUI(player) {
    var page = pageEl();
    if (!page || !player) return;
    if (page.__saltInited) { updateNowTitle(); return; }
    page.__saltInited = true;

    var topbar = document.getElementById('salt-topbar');
    var backBtn = document.getElementById('salt-back');
    var listBtn = document.getElementById('salt-list-btn');
    var pic = page.querySelector('.aplayer-pic');
    var controller = page.querySelector('.aplayer-controller');
    var music = page.querySelector('.aplayer-music');
    var timeInner = page.querySelector('.aplayer-time-inner');
    var list = page.querySelector('.aplayer-list');

    // 列表必须留在 APlayer 的 container 内：switch() 会在 setAudio() 之前执行
    // container.querySelectorAll('.aplayer-list li')[index].classList.add(...)，
    // 移出 container 会抛异常导致声音不切换。
    // 但可以移出带 transform 的 .aplayer-left，保证 position:fixed 相对视口全屏。
    if (list && player.container && list.parentNode !== player.container) {
      player.container.appendChild(list);
    }

    if (controller && music && timeInner) {
      var meta = document.createElement('div');
      meta.className = 'salt-capsule-meta';
      meta.appendChild(music);
      meta.appendChild(timeInner);
      controller.insertBefore(meta, controller.firstChild);
    }

    var ICON_PREV = '<svg viewBox="0 0 24 24"><path d="M6 5h2.2v14H6z"></path><path d="M19 5 9.4 12 19 19z"></path></svg>';
    var ICON_NEXT = '<svg viewBox="0 0 24 24"><path d="M15.8 5h2.2v14h-2.2z"></path><path d="M5 5 14.6 12 5 19z"></path></svg>';
    var ICON_SHUFFLE = '<svg viewBox="0 0 24 24"><path d="M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"></path></svg>';
    var prevBtn = page.querySelector('.aplayer-icon-back');
    var nextBtn = page.querySelector('.aplayer-icon-forward');
    var orderBtnIcon = page.querySelector('.aplayer-icon-order');
    if (prevBtn) prevBtn.innerHTML = ICON_PREV;
    if (nextBtn) nextBtn.innerHTML = ICON_NEXT;
    if (orderBtnIcon) orderBtnIcon.innerHTML = ICON_SHUFFLE;

    // 右侧工具区：48 kHz / 音量
    var right = controller && controller.querySelector('.salt-bar-right');
    if (controller && !right) {
      right = document.createElement('div');
      right.className = 'salt-bar-right';
      var vol = controller.querySelector('.aplayer-volume-wrap');
      if (vol) right.appendChild(vol);

      var khz = document.createElement('span');
      khz.className = 'salt-khz';
      khz.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 12c2.2 0 2.2-5 4.4-5s2.2 10 4.4 10 2.2-10 4.4-10 2.2 5 4.4 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg><span>48 kHz</span>';
      right.appendChild(khz);

      controller.appendChild(right);
    }

    var orderBtn = page.querySelector('.aplayer-icon-order');
    var loopBtn = page.querySelector('.aplayer-icon-loop');
    var volumeBtn = page.querySelector('.aplayer-time .aplayer-icon-volume-down');

    var ORDER_TEXT = { list: '顺序播放', random: '随机播放' };
    var LOOP_TEXT = { all: '列表循环', one: '单曲循环', none: '不循环' };

    function refreshTitles() {
      if (!player || !player.options) return;
      if (orderBtn) orderBtn.title = '播放顺序：' + (ORDER_TEXT[player.options.order] || '顺序播放');
      if (loopBtn) loopBtn.title = '循环方式：' + (LOOP_TEXT[player.options.loop] || '列表循环');
      if (prevBtn) prevBtn.title = '上一首';
      if (nextBtn) nextBtn.title = '下一首';
      if (volumeBtn) volumeBtn.title = '静音切换';
    }

    function feedback(text) {
      if (player && typeof player.notice === 'function') player.notice(text, 1400, 0.9);
    }

    if (orderBtn) orderBtn.addEventListener('click', function () { refreshTitles(); feedback(ORDER_TEXT[player.options.order] || ''); });
    if (loopBtn) loopBtn.addEventListener('click', function () { refreshTitles(); feedback(LOOP_TEXT[player.options.loop] || ''); });
    refreshTitles();

    function setListMode(on) {
      page.classList.toggle('salt-list', on);
      if (topbar) topbar.classList.toggle('is-list', on);
      var title = document.getElementById('salt-topbar-title');
      if (title) title.textContent = on ? '播放列表' : '正在播放';
    }

    function toggleList() { setListMode(!page.classList.contains('salt-list')); }

    if (backBtn) backBtn.addEventListener('click', function () {
      // 播放列表模式下：返回键先退出列表（避免一按就跳去音乐库、退不出列表）
      if (page.classList.contains('salt-list')) { setListMode(false); return; }
      // 否则：本地库可用时进入音乐库（播放页 ← → 库）
      if (window.SaltLibrary && window.SaltLibrary.available()) { window.SaltLibrary.open(); return; }
      toggleList();
    });
    // 顶栏右侧按钮：全屏切换（原播放列表入口保留在底栏队列键与左上角返回键）
    var ICON_FS_ENTER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';
    var ICON_FS_EXIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M10 20H4v-6M20 14v6h-6M4 10V4h6"/></svg>';
    function isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
    function refreshFsIcon() { if (listBtn) listBtn.innerHTML = isFullscreen() ? ICON_FS_ENTER : ICON_FS_EXIT; }
    function toggleFullscreen() {
      var el = document.documentElement;
      if (isFullscreen()) {
        (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
      } else {
        (el.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el);
      }
    }
    if (listBtn) {
      listBtn.title = '全屏';
      refreshFsIcon();
      listBtn.addEventListener('click', toggleFullscreen);
      document.addEventListener('fullscreenchange', refreshFsIcon);
      document.addEventListener('webkitfullscreenchange', refreshFsIcon);
    }

    // 播放队列键：APlayer 自带的 menu 切换依赖它的隐藏列表状态，这里直接接管
    var menuBtn = page.querySelector('.aplayer-icon-menu');
    if (menuBtn) {
      menuBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopImmediatePropagation();
        toggleList();
      }, true);
    }

    // 进度镜像：APlayer 把已播放宽度写在 .aplayer-played 的内联 style 上，
    // 同步成控制器上的 --played，供顶边轮廓进度线（CSS 伪元素）裁剪
    var playedEl = page.querySelector('.aplayer-played');
    var controllerEl = page.querySelector('.aplayer-controller');
    if (playedEl && controllerEl && window.MutationObserver) {
      var syncPlayed = function () { controllerEl.style.setProperty('--played', playedEl.style.width || '0%'); };
      syncPlayed();
      new MutationObserver(syncPlayed).observe(playedEl, { attributes: true, attributeFilter: ['style'] });
    }

    if (pic) {
      pic.addEventListener('click', function (e) {
        if (e.target && e.target.closest && e.target.closest('.aplayer-button')) return;
        e.stopPropagation();
        page.classList.toggle('salt-focus');
        if (page.classList.contains('salt-focus')) {
          pic.style.transform = '';
          pic.classList.remove('salt-tilt');
        }
      }, true);
      if (window.MutationObserver) {
        new MutationObserver(syncSaltCover).observe(pic, { attributes: true, attributeFilter: ['style'] });
      }

      // 封面跟随鼠标：3D 透视倾斜（聚焦态保持 0.89 缩放一起晃）
      var TILT_X = 10;
      var TILT_Y = 13;
      pic.addEventListener('mousemove', function (e) {
        var r = pic.getBoundingClientRect();
        if (!r.width || !r.height) return;
        var dx = (e.clientX - r.left) / r.width - 0.5;
        var dy = (e.clientY - r.top) / r.height - 0.5;
        pic.classList.add('salt-tilt');
        var focusScale = page.classList.contains('salt-focus') ? ' scale(0.89)' : '';
        pic.style.transform = 'perspective(900px) rotateX(' + (-dy * TILT_X).toFixed(2) + 'deg) rotateY(' + (dx * TILT_Y).toFixed(2) + 'deg)' + focusScale;
      });
      pic.addEventListener('mouseleave', function () {
        pic.style.transform = '';
        pic.classList.remove('salt-tilt');
      });
    }

    // 歌词玻璃：滚动/移动时全部清晰；离开 1.2s 后恢复磨砂
    var lrc = page.querySelector('.aplayer-lrc');
    if (lrc) {
      var lrcTimer = null;
      var setLyricsGlass = function (clear) {
        page.classList.toggle('salt-lyrics-clear', clear);
      };
      var clearLyricsGlass = function () {
        if (lrcTimer) { clearTimeout(lrcTimer); lrcTimer = null; }
        setLyricsGlass(true);
      };
      lrc.addEventListener('mouseenter', clearLyricsGlass);
      lrc.addEventListener('mousemove', clearLyricsGlass, { passive: true });
      lrc.addEventListener('wheel', clearLyricsGlass, { passive: true });
      lrc.addEventListener('touchstart', function () {
        clearLyricsGlass();
        if (lrcTimer) clearTimeout(lrcTimer);
        lrcTimer = setTimeout(function () { setLyricsGlass(false); lrcTimer = null; }, 2000);
      }, { passive: true });
      lrc.addEventListener('mouseleave', function () {
        if (lrcTimer) clearTimeout(lrcTimer);
        lrcTimer = setTimeout(function () {
          setLyricsGlass(false);
          lrcTimer = null;
        }, 1200);
      });
    }

    // 底栏自动收起：鼠标静止 2.6s 后只留 曲名 + 时间 + 顶部进度线
    var idleTimer = null;
    function setBarIdle(on) { page.classList.toggle('salt-idle', on); }
    function bumpBar() {
      setBarIdle(false);
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(function () { setBarIdle(true); }, 2600);
    }
    page.addEventListener('mousemove', bumpBar);
    var ctrlEl = page.querySelector('.aplayer-info .aplayer-controller');
    if (ctrlEl) {
      ctrlEl.addEventListener('mouseenter', function () { if (idleTimer) clearTimeout(idleTimer); setBarIdle(false); });
      ctrlEl.addEventListener('mouseleave', bumpBar);
    }
    bumpBar();

    if (player) {
      player.on('listswitch', function () {
        setListMode(false);
        setTimeout(function () { syncSaltCover(); updateNowTitle(); }, 0);
      });
      player.on('loadeddata', function () { syncSaltCover(); updateNowTitle(); });
    }

    updateNowTitle();
    syncSaltCover();

    var resizeTimer = null;
    window.addEventListener('resize', function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(updateMarquee, 200);
    });
  }

  // window.ap 就绪后自动初始化（本地 / Meting 通用）
  var tries = 0;
  var timer = setInterval(function () {
    if (window.ap && window.ap.container) {
      setupSaltUI(window.ap);
      syncSaltCover();
      clearInterval(timer);
    } else if (++tries > 300) {
      clearInterval(timer);
    }
  }, 100);

  window.SaltPlayer = { setup: setupSaltUI, sync: syncSaltCover, marquee: updateMarquee };
})();
