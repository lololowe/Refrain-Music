/* ============================================================
 * 音乐库：歌曲 / 专辑 / 艺术家 三板块 + 底部 dock 播放栏
 * 数据：music-list.json(扁平歌曲，必选) + music-meta.json(歌手头像，可选)
 * ============================================================ */
(function () {
  'use strict';
  if (window.__saltLibrary) return;

  // 项目仓库地址：音乐库左下角 GitHub 按钮的跳转目标
  var REPO_URL = 'https://github.com/lololowe/Refrain-Music';

  var S = {
    open: false,
    view: 'songs',            // songs | albums | artists | album | artist
    album: '',                // 当前专辑 key
    artist: '',               // 当前歌手名
    artistTab: 'albums',      // 艺术家页分区：albums | songs
    covers: {},               // albumKey -> blobURL
    coversStarted: false,
    meta: { artists: {}, albums: {} },
    query: '',
    V: null                   // 当前视图模型 {title,count,search,html}
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtTime(s) {
    s = Math.max(0, Math.floor(s || 0));
    var m = Math.floor(s / 60), x = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (x < 10 ? '0' : '') + x;
  }

  /* ---------------- 数据派生 ---------------- */
  function songs() {
    return (window.localMusic && window.localMusic.length) ? window.localMusic : null;
  }

  function albumKeyOf(song) {
    if (song.album) return song.album;
    try {
      var segs = decodeURIComponent(String(song.url || '').split('?')[0]).split('/');
      return segs.length >= 2 ? segs[segs.length - 2] : '';
    } catch (e) { return ''; }
  }

  function splitArtists(str) {
    return String(str || '').split(/[、，,]/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function albumYear(name) { var m = /^(\d{4})[-_ ]/.exec(name || ''); return m ? m[1] : ''; }
  function albumDisplay(name) { return (name || '').replace(/^\d{4}[-_ ]/, ''); }

  // 专辑排序：年份降序（新专辑在前），无年份的排最后，同年/同年缺省时按专辑名升序
  function cmpAlbumKey(k1, k2) {
    var y1 = albumYear(k1), y2 = albumYear(k2);
    if (y1 !== y2) {
      if (!y1) return 1;
      if (!y2) return -1;
      return y2.localeCompare(y1);
    }
    return albumDisplay(k1).localeCompare(albumDisplay(k2), 'zh-Hans-CN');
  }

  function buildAlbums() {
    var map = {}, order = [];
    songs().forEach(function (sg, i) {
      var k = albumKeyOf(sg) || '未知专辑';
      if (!map[k]) { map[k] = { key: k, name: albumDisplay(k) || k, year: albumYear(k), songs: [] }; order.push(k); }
      map[k].songs.push(i);
    });
    return order.slice().sort(cmpAlbumKey).map(function (k) {
      var a = map[k];
      var meta = (S.meta.albums || {})[k] || {};
      a.pic = meta.pic || S.covers[k] || '';
      return a;
    });
  }

  function buildArtists() {
    var map = {}, order = [];
    songs().forEach(function (sg, i) {
      splitArtists(sg.artist).forEach(function (name) {
        if (!map[name]) { map[name] = { name: name, songIdx: [], albums: {} }; order.push(name); }
        map[name].songIdx.push(i);
        var k = albumKeyOf(sg) || '未知专辑';
        if (!map[name].albums[k]) map[name].albums[k] = [];
        map[name].albums[k].push(i);
      });
    });
    return order.map(function (name) {
      var a = map[name];
      a.albumKeys = Object.keys(a.albums).sort(cmpAlbumKey);
      var meta = (S.meta.artists || {})[name] || {};
      // 头像兜底取最新一张专辑的封面（albumKeys 已按年份降序）
      a.pic = meta.pic || S.covers[a.albumKeys[0]] || '';
      a.count = a.songIdx.length;
      return a;
    });
  }

  /* ---------------- 封面按需提取（每专辑只取第一首） ---------------- */
  function startCoverExtract() {
    if (S.coversStarted) return;

    var albums = buildAlbums();
    // 优先使用用户在 music-list.json 里填写的 cover URL（无需 CORS，同步可用）
    albums.forEach(function (a) {
      var first = songs()[a.songs[0]];
      if (first && first.cover && !S.covers[a.key]) S.covers[a.key] = first.cover;
    });

    // localEngine 异步加载，HeoTags 可能尚未就绪：短暂重试，别一次性放弃内嵌提取
    if (!(window.HeoTags && window.HeoTags.extractCover)) {
      S.coverTries = (S.coverTries || 0) + 1;
      if (S.coverTries <= 100) setTimeout(startCoverExtract, 300);
      return;
    }
    S.coversStarted = true;

    // 只有没有 cover 的专辑才走 FLAC 内嵌提取兜底（依赖 CORS，尽力而为）
    var queue = albums.filter(function (a) { return !S.covers[a.key]; })
      .map(function (a) { return { key: a.key, songIdx: a.songs[0], url: songs()[a.songs[0]].url }; });
    var CONC = 3;
    function next() {
      if (!queue.length) { renderContent(); return; }
      var job = queue.shift();
      window.HeoTags.extractCover(job.url).then(function (blob) {
        if (blob) { S.covers[job.key] = blob; patchCovers(job.key); next(); return; }
        // 内嵌提取无结果：退到 QQ 音乐接口识别专辑封面
        var sg = songs()[job.songIdx];
        var qq = (sg && window.HeoTags.qqCoverUrl) ? window.HeoTags.qqCoverUrl(sg.name, sg.artist) : Promise.resolve('');
        qq.then(function (u) {
          if (u) { S.covers[job.key] = u; patchCovers(job.key); }
          next();
        }).catch(function () { next(); });
      }).catch(function () { next(); });
    }
    for (var i = 0; i < CONC; i++) next();
  }

  function patchCovers(key) {
    var lib = document.getElementById('salt-library');
    if (!lib) return;
    lib.querySelectorAll('img[data-albumkey]').forEach(function (img) {
      if (img.getAttribute('data-albumkey') === key) img.src = S.covers[key];
    });
    updateDock();
  }

  /* ---------------- 播放控制 ---------------- */
  // 当前 APlayer 队列里，全量下标为 globalIdx 的歌曲所在位置（-1 表示不在队列中）
  function findQueuePos(globalIdx) {
    var ap = window.ap;
    var list = ap && ap.list && ap.list.audios;
    if (!list) return -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].srcIndex === globalIdx) return i;
    }
    return -1;
  }

  function playIndex(idx) {
    var ap = window.ap;
    if (!ap || !ap.list) return;
    try {
      var pos = findQueuePos(idx);
      if (pos < 0) {
        // 目标不在当前队列（队列被「播放全部」换成了其他专辑/歌手）：恢复全量队列后再播
        var full = window.HeoAudios;
        if (full && full.length) {
          if (typeof ap.list.clear === 'function') ap.list.clear();
          if (typeof ap.list.add === 'function') ap.list.add(full.slice());
          pos = idx >= 0 && idx < full.length ? idx : 0;
        }
      }
      if (pos >= 0 && typeof ap.list.switch === 'function') ap.list.switch(pos);
      if (typeof ap.play === 'function') ap.play();
    } catch (e) {}
    updateDock();
    highlightPlaying();
  }

  // 播放一组歌曲：把 APlayer 队列替换为该组，然后从头播放（「播放全部」的语义）
  function playQueue(indices) {
    var ap = window.ap;
    if (!ap || !ap.list || !indices || !indices.length) return;
    try {
      // 必须从「全量曲库」取对象：当前队列可能已被替换成子集，全量下标不再对应
      var src = window.HeoAudios || ap.list.audios;
      var picked = indices.map(function (i) { return src[i]; }).filter(Boolean);
      if (!picked.length) return;
      // 重置状态，让 clear→add 后 listswitch 重新触发歌词/封面加载
      picked.forEach(function (a) { a.tagsLoaded = false; a.lrc = '[00:00.00] 暂无歌词'; });
      if (typeof ap.list.clear === 'function') ap.list.clear();
      if (typeof ap.list.add === 'function') ap.list.add(picked);
      if (typeof ap.play === 'function') ap.play();
    } catch (e) {}
    updateDock();
    highlightPlaying();
  }

  function currentIndex() {
    var ap = window.ap;
    return ap && ap.list ? ap.list.index : -1;
  }

  /* ---------------- 视图模型 ---------------- */
  function coverImg(albumKey) {
    var src = S.covers[albumKey] || (S.meta.albums && S.meta.albums[albumKey] && S.meta.albums[albumKey].pic) || '';
    return '<img data-albumkey="' + esc(albumKey) + '" ' +
      (src ? 'src="' + esc(src) + '" ' : '') + 'alt="">';
  }

  function artistLinks(str) {
    return splitArtists(str).map(function (n) {
      return '<a class="salt-lib-artist" data-artist="' + esc(n) + '">' + esc(n) + '</a>';
    }).join('、');
  }

  function songsRow(idx, num) {
    var sg = songs()[idx];
    var key = albumKeyOf(sg);
    return '<div class="salt-lib-row" data-idx="' + idx + '">' +
      (num != null ? '<span class="salt-lib-num">' + num + '</span>' : '') +
      '<div class="salt-lib-thumb">' + coverImg(key) + '</div>' +
      '<div class="salt-lib-titles"><b>' + esc(sg.name) + '</b><span>' + artistLinks(sg.artist) + '</span></div>' +
      '<span class="salt-lib-album"><a class="salt-lib-albumlink" data-album="' + esc(key) + '">' + esc(albumDisplay(key) || '') + '</a></span>' +
      '</div>';
  }

  function computeView() {
    if (S.view === 'albums') {
      var albums = buildAlbums();
      var gh = '<div class="salt-lib-grid">';
      albums.forEach(function (a) {
        gh += '<div class="salt-lib-card" data-album="' + esc(a.key) + '">' +
          '<div class="salt-lib-cover">' + coverImg(a.key) + '</div>' +
          '<b>' + esc(a.name) + '</b>' +
          '<span><i>' + a.songs.length + ' 首歌曲' + (a.year ? ' ' + a.year : '') + '</i><u>' + esc(splitArtists(songs()[a.songs[0]].artist)[0] || '') + '</u></span>' +
          '</div>';
      });
      return { title: '专辑', count: albums.length, search: false, html: gh + '</div>' };
    }
    if (S.view === 'artists') {
      var artists = buildArtists();
      var ah = '<div class="salt-lib-agrid">';
      artists.forEach(function (a) {
        ah += '<div class="salt-lib-acard" data-artist="' + esc(a.name) + '">' +
          '<div class="salt-lib-avatar">' + (a.pic ? '<img src="' + esc(a.pic) + '" alt="">' : '') + '</div>' +
          '<b>' + esc(a.name) + '</b></div>';
      });
      return { title: '艺术家', count: artists.length, search: false, html: ah + '</div>' };
    }
    if (S.view === 'album') {
      var a = buildAlbums().filter(function (x) { return x.key === S.album; })[0];
      if (!a) { S.view = 'albums'; return computeView(); }
      var dh = '<div class="salt-lib-back" data-nav="albums">‹ 专辑</div>' +
        '<div class="salt-lib-detail">' +
        '<div class="salt-lib-dcover">' + coverImg(a.key) + '</div>' +
        '<div class="salt-lib-dinfo"><span>专辑</span><h1>' + esc(a.name) + '</h1>' +
        '<p>' + splitArtists(songs()[a.songs[0]].artist).map(function (n) {
          return '<a class="salt-lib-artist" data-artist="' + esc(n) + '">' + esc(n) + '</a>';
        }).join(' / ') + ' · ' + a.songs.length + ' 首' + (a.year ? ' · ' + a.year : '') + '</p>' +
        '<button class="salt-lib-playall" id="salt-lib-playall">▶ 播放全部</button></div></div>' +
        '<div class="salt-lib-list">';
      a.songs.forEach(function (idx, n) { dh += songsRow(idx, n + 1); });
      return { title: a.name, count: a.songs.length, search: false, html: dh + '</div>' };
    }
    if (S.view === 'artist') {
      var ar = buildArtists().filter(function (x) { return x.name === S.artist; })[0];
      if (!ar) { S.view = 'artists'; return computeView(); }
      var tab = S.artistTab === 'songs' ? 'songs' : 'albums';
      var rh = '<div class="salt-lib-back" data-nav="artists">‹ 艺术家</div>' +
        '<div class="salt-lib-detail">' +
        '<div class="salt-lib-dcover salt-round">' + (ar.pic ? '<img src="' + esc(ar.pic) + '" alt="">' : '') + '</div>' +
        '<div class="salt-lib-dinfo"><span>艺术家</span><h1>' + esc(ar.name) + '</h1>' +
        '<p>' + ar.albumKeys.length + ' 张专辑 · ' + ar.count + ' 首</p>' +
        '<button class="salt-lib-playall" id="salt-lib-playartist">▶ 播放全部</button></div></div>' +
        '<div class="salt-lib-tabs">' +
        '<button class="salt-lib-tab' + (tab === 'albums' ? ' active' : '') + '" data-artisttab="albums">专辑 ' + ar.albumKeys.length + '</button>' +
        '<button class="salt-lib-tab' + (tab === 'songs' ? ' active' : '') + '" data-artisttab="songs">歌曲 ' + ar.count + '</button>' +
        '</div>';
      if (tab === 'songs') {
        rh += '<div class="salt-lib-list">';
        ar.songIdx.forEach(function (idx, n) { rh += songsRow(idx, n + 1); });
        return { title: ar.name, count: ar.count, search: false, html: rh + '</div>' };
      }
      rh += '<div class="salt-lib-grid">';
      ar.albumKeys.forEach(function (k) {
        rh += '<div class="salt-lib-card" data-album="' + esc(k) + '">' +
          '<div class="salt-lib-cover">' + coverImg(k) + '</div>' +
          '<b>' + esc(albumDisplay(k) || k) + '</b><span><i>' + ar.albums[k].length + ' 首歌曲' + (albumYear(k) ? ' ' + albumYear(k) : '') + '</i></span></div>';
      });
      return { title: ar.name, count: ar.count, search: false, html: rh + '</div>' };
    }
    // 歌曲列表
    var list = songs().map(function (sg, i) { return { i: i, name: sg.name, artist: sg.artist }; });
    if (S.query) {
      var q = S.query.toLowerCase();
      list = list.filter(function (x) { return (x.name + ' ' + x.artist).toLowerCase().indexOf(q) >= 0; });
    }
    list.sort(function (a, b) { return a.name.localeCompare(b.name, 'zh-Hans-CN'); });
    var lh = '<div class="salt-lib-list">', last = null;
    list.forEach(function (x) {
      var ch = (x.name || '?').charAt(0).toUpperCase();
      if (ch !== last) { lh += '<div class="salt-lib-letter">' + esc(ch) + '</div>'; last = ch; }
      lh += songsRow(x.i);
    });
    if (!list.length) lh += '<div class="salt-lib-empty">没有匹配的歌曲</div>';
    // 定位当前播放歌曲的悬浮按钮
    lh += '</div><button class="salt-lib-locate" id="salt-lib-locate" title="定位到当前播放歌曲">' +
      '<svg viewBox="0 0 24 24"><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.6"/></svg></button>';
    return { title: '歌曲', count: list.length, search: true, html: lh };
  }

  /* ---------------- 渲染（head 与 content 分离，保住输入法） ---------------- */
  function renderHead() {
    var lib = document.getElementById('salt-library');
    if (!lib || !S.V) return;
    lib.querySelector('.salt-lib-head').innerHTML =
      '<h1>' + esc(S.V.title) + ' <span>' + S.V.count + '</span></h1>' +
      (S.V.search ? '<input id="salt-lib-search" class="salt-lib-search" placeholder="搜索歌曲 / 歌手" value="' + esc(S.query) + '">' : '');
    bindSearch();
  }

  function renderContent() {
    var lib = document.getElementById('salt-library');
    if (!lib) return;
    S.V = computeView();
    lib.querySelector('.salt-lib-content').innerHTML = S.V.html;
    // 仅更新标题里的数量，不重建搜索框
    var sp = lib.querySelector('.salt-lib-head h1 span');
    if (sp && S.V.search) sp.textContent = S.V.count;
    highlightPlaying();
  }

  function render() {
    var lib = document.getElementById('salt-library');
    if (!lib) return;
    S.V = computeView();
    renderHead();
    lib.querySelector('.salt-lib-content').innerHTML = S.V.html;
    highlightPlaying();
  }

  function bindSearch() {
    var el = document.getElementById('salt-lib-search');
    if (!el) return;
    var composing = false;
    el.addEventListener('compositionstart', function () { composing = true; });
    el.addEventListener('compositionend', function () {
      composing = false;
      S.query = el.value;
      renderContent();
    });
    el.addEventListener('input', function () {
      if (composing) return;   // 输入法组词过程中不重渲染
      S.query = el.value;
      renderContent();
    });
  }

  // 队列位置 -> 全量曲库下标（行上的 data-idx 也是全量下标）
  // 注意：APlayer 的 listswitch 事件里 list.index 尚未更新，必须显式传入事件中的 index
  function globalIndexAt(queueIdx) {
    var ap = window.ap;
    var list = ap && ap.list && ap.list.audios;
    if (!list) return -1;
    var a = list[typeof queueIdx === 'number' ? queueIdx : ap.list.index];
    return a && typeof a.srcIndex === 'number' ? a.srcIndex : -1;
  }

  function highlightPlaying(queueIdx) {
    var lib = document.getElementById('salt-library');
    if (!lib) return;
    var cur = globalIndexAt(queueIdx);
    lib.querySelectorAll('.salt-lib-row.salt-lib-playing').forEach(function (r) {
      r.classList.remove('salt-lib-playing');
    });
    if (cur < 0) return;
    var row = lib.querySelector('.salt-lib-row[data-idx="' + cur + '"]');
    if (row) row.classList.add('salt-lib-playing');
  }

  function locatePlaying() {
    var cur = globalIndexAt();
    if (cur < 0) return;
    var row = document.querySelector('.salt-lib-content .salt-lib-row[data-idx="' + cur + '"]');
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.add('salt-lib-locate-flash');
    setTimeout(function () { row.classList.remove('salt-lib-locate-flash'); }, 1600);
  }

  /* ---------------- 底部 dock（规格/按钮与播放页底栏一致：曲名 + 时间 + 顶部进度线） ---------------- */
  var ICON_ORDER = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>';
  var ICON_PREV = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2.2v14H6z"></path><path d="M19 5 9.4 12 19 19z"></path></svg>';
  var ICON_NEXT = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.8 5h2.2v14h-2.2z"></path><path d="M5 5 14.6 12 5 19z"></path></svg>';
  var ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  var ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>';

  function dockHTML() {
    return '<div class="salt-dock" id="salt-dock" title="打开播放页">' +
      '<div class="salt-dock-bar"><i id="salt-dock-played"></i></div>' +
      '<div class="salt-dock-left">' +
      '<div class="salt-dock-cover" id="salt-dock-cover"></div>' +
      '<div class="salt-dock-meta"><b id="salt-dock-name">—</b><span id="salt-dock-sub"></span></div>' +
      '</div>' +
      '<div class="salt-dock-ctrl">' +
      '<button data-act="prev" title="上一首">' + ICON_PREV + '</button>' +
      '<button data-act="toggle" id="salt-dock-toggle" title="播放 / 暂停">' + ICON_PLAY + '</button>' +
      '<button data-act="next" title="下一首">' + ICON_NEXT + '</button>' +
      '</div>' +
      '<div class="salt-dock-right">' +
      '<button data-act="order" title="播放顺序">' + ICON_ORDER + '</button>' +
      '<input type="range" class="salt-dock-vol" id="salt-dock-vol" min="0" max="1" step="0.01" value="1" title="音量">' +
      '</div>' +
      '</div>';
  }

  function updateDock(queueIdx) {
    var ap = window.ap;
    if (!ap || !ap.list) return;
    // listswitch 事件触发时 ap.list.index 尚未更新，优先用事件里的队列索引
    var a = ap.list.audios && ap.list.audios[typeof queueIdx === 'number' ? queueIdx : ap.list.index];
    var name = document.getElementById('salt-dock-name');
    if (!name) return;
    name.textContent = a ? (a.name || '') : '';
    var sub = document.getElementById('salt-dock-sub');
    if (sub) sub.textContent = (a ? (a.artist || '') : '') + ' · ' +
      fmtTime(ap.audio ? ap.audio.currentTime : 0) + ' / ' +
      fmtTime(ap.audio && ap.audio.duration ? ap.audio.duration : 0);
    var cov = document.getElementById('salt-dock-cover');
    if (cov) {
      // audio 对象没有 album 字段：用 srcIndex 回到全量曲库取原始歌曲，
      // 否则 albumKeyOf 会退化成 url 父文件夹推导（带年份前缀），与 S.covers 的 key 对不上
      var src = (a && typeof a.srcIndex === 'number' && songs()) ? songs()[a.srcIndex] : a;
      var ck = src ? albumKeyOf(src) : '';
      var p = (a && a.cover) || S.covers[ck] || (S.meta.albums && S.meta.albums[ck] && S.meta.albums[ck].pic) || '';
      if (p) { cov.style.backgroundImage = window.saltCssUrl ? window.saltCssUrl(p) : 'url("' + p + '")'; cov.classList.add('has'); }
      else { cov.style.backgroundImage = ''; cov.classList.remove('has'); }
    }
    var tg = document.getElementById('salt-dock-toggle');
    if (tg) tg.innerHTML = (ap.audio && !ap.audio.paused) ? ICON_PAUSE : ICON_PLAY;
    var vol = document.getElementById('salt-dock-vol');
    if (vol && ap.audio) vol.value = ap.audio.muted ? 0 : (ap.audio.volume == null ? 1 : ap.audio.volume);
  }

  function hookPlayer() {
    var ap = window.ap;
    if (!ap || ap.__dockHooked) return;
    ap.__dockHooked = true;
    ap.on('listswitch', function (data) {
      var qi = data && typeof data.index === 'number' ? data.index : undefined;
      updateDock(qi); highlightPlaying(qi);
    });
    ap.on('loadeddata', updateDock);
    ap.on('play', updateDock);
    ap.on('pause', updateDock);

    // dock 音量滑块 → 当前音频音量
    var volInput = document.getElementById('salt-dock-vol');
    if (volInput) {
      volInput.addEventListener('input', function () {
        if (ap.audio) { ap.audio.volume = +this.value; ap.audio.muted = false; }
      });
    }
    ap.on('timeupdate', function () {
      var bar = document.getElementById('salt-dock-played');
      if (bar && ap.audio && ap.audio.duration) {
        bar.style.width = (ap.audio.currentTime / ap.audio.duration * 100).toFixed(2) + '%';
      }
      // 底栏可见时间写在 salt-dock-sub（歌手 · 时间）里，必须随 timeupdate 一起刷新
      var sub = document.getElementById('salt-dock-sub');
      if (sub && ap.list && ap.list.audios) {
        var ca = ap.list.audios[ap.list.index];
        sub.textContent = (ca ? (ca.artist || '') : '') + ' · ' +
          fmtTime(ap.audio.currentTime) + ' / ' + fmtTime(ap.audio.duration);
      }
    });
  }

  /* ---------------- 打开 / 关闭与路由 ---------------- */
  function ensureDOM() {
    if (document.getElementById('salt-library')) return;
    var div = document.createElement('div');
    div.id = 'salt-library';
    div.innerHTML =
      '<div class="salt-lib-bg"></div>' +
      '<aside class="salt-lib-side">' +
      '<div class="salt-lib-logo">音乐库</div>' +
      '<button class="salt-lib-nav active" data-nav="songs"><svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>歌曲</button>' +
      '<button class="salt-lib-nav" data-nav="albums"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>专辑</button>' +
      '<button class="salt-lib-nav" data-nav="artists"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>艺术家</button>' +
      '<button class="salt-lib-github" id="salt-lib-github" title="GitHub 仓库"><svg viewBox="0 0 24 24"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55v-1.94c-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.18-1.49 3.14-1.18 3.14-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.4-5.25 5.69.41.35.77 1.05.77 2.12v3.14c0 .3.21.67.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z"/></svg><span>GitHub</span></button>' +
      '</aside>' +
      '<main class="salt-lib-main"><div class="salt-lib-head"></div><div class="salt-lib-content"></div></main>' +
      dockHTML();
    document.body.appendChild(div);

    // 左下角 GitHub 仓库按钮：地址写死在 REPO_URL
    var gh = div.querySelector('#salt-lib-github');
    if (gh) {
      gh.addEventListener('click', function (e) {
        e.stopPropagation();
        window.open(REPO_URL, '_blank', 'noopener');
      });
    }

    div.addEventListener('click', function (e) {
      var nav = e.target.closest('[data-nav]');
      if (nav) {
        S.view = nav.getAttribute('data-nav');
        if (S.view === 'songs') S.query = '';
        location.hash = '#/library/' + S.view;
        return;
      }
      var card = e.target.closest('[data-album]');
      if (card) { S.album = card.getAttribute('data-album'); S.view = 'album'; location.hash = '#/library/album/' + encodeURIComponent(S.album); return; }
      var acard = e.target.closest('[data-artist]');
      if (acard) { S.artist = acard.getAttribute('data-artist'); S.view = 'artist'; location.hash = '#/library/artist/' + encodeURIComponent(S.artist); return; }
      var row = e.target.closest('.salt-lib-row');
      if (row && row.getAttribute('data-idx') != null) { playIndex(+row.getAttribute('data-idx')); return; }
      if (e.target.closest('#salt-lib-playall')) {
        var a = buildAlbums().filter(function (x) { return x.key === S.album; })[0];
        if (a) playQueue(a.songs);
        return;
      }
      // 艺术家页：播放全部（该歌手所有歌曲，替换队列）
      if (e.target.closest('#salt-lib-playartist')) {
        var arp = buildArtists().filter(function (x) { return x.name === S.artist; })[0];
        if (arp) playQueue(arp.songIdx);
        return;
      }
      // 艺术家页分区切换：专辑 / 歌曲
      var atab = e.target.closest('[data-artisttab]');
      if (atab) { S.artistTab = atab.getAttribute('data-artisttab'); renderContent(); return; }
      if (e.target.closest('#salt-lib-locate')) { locatePlaying(); return; }
      var act = e.target.closest('[data-act]');
      if (act) {
        var ap = window.ap;
        if (!ap) return;
        var k = act.getAttribute('data-act');
        if (k === 'toggle') ap.toggle();
        else if (k === 'next') ap.skipForward();
        else if (k === 'prev') ap.skipBack();
        else if (k === 'order') { var ob = document.getElementById('heoMusic-page').querySelector('.aplayer-icon-order'); if (ob) ob.click(); }
        return;
      }
      // 点 dock 的信息区（封面/曲名）回播放页；控制区（按钮/音量）不触发
      if (e.target.closest('#salt-dock') && !e.target.closest('.salt-dock-ctrl')) close();
    });

    // dock 按钮：与播放页底栏同一套自动收起逻辑（鼠标静止 2.6s 隐藏，悬停常显）
    var dock = div.querySelector('#salt-dock');
    var dockIdleTimer = null;
    function setDockIdle(on) { dock.classList.toggle('salt-dock-idle', on); }
    function bumpDock() {
      setDockIdle(false);
      if (dockIdleTimer) clearTimeout(dockIdleTimer);
      dockIdleTimer = setTimeout(function () { setDockIdle(true); }, 2600);
    }
    div.addEventListener('mousemove', bumpDock);
    dock.addEventListener('mouseenter', function () { if (dockIdleTimer) clearTimeout(dockIdleTimer); setDockIdle(false); });
    dock.addEventListener('mouseleave', bumpDock);
    bumpDock();

    updateDock();
  }

  function applyRoute() {
    var h = location.hash || '';
    var m = /^#\/library(?:\/(songs|albums|artists|album|artist)(?:\/(.*))?)?$/.exec(h);
    if (!m) { hide(); return; }
    S.view = m[1] || 'songs';
    if (S.view === 'album' && m[2]) S.album = decodeURIComponent(m[2]);
    if (S.view === 'artist') { if (m[2]) S.artist = decodeURIComponent(m[2]); S.artistTab = 'albums'; }
    show();
  }

  function show() {
    ensureDOM();
    var wasOpen = S.open;
    S.open = true;
    var lib = document.getElementById('salt-library');
    lib.classList.add('open');
    var page = document.getElementById('heoMusic-page');
    var tb = document.getElementById('salt-topbar');
    if (!wasOpen) {
      // 播放页缩小淡出（333ms）
      page.classList.add('salt-minimize');
      if (tb) tb.classList.add('salt-minimize');
      setTimeout(function () {
        if (S.open) { page.classList.add('salt-behind'); if (tb) tb.classList.add('salt-behind'); }
      }, 350);
    } else {
      page.classList.add('salt-behind');
      if (tb) tb.classList.add('salt-behind');
    }
    lib.querySelectorAll('.salt-lib-nav').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-nav') === S.view ||
        (S.view === 'album' && b.getAttribute('data-nav') === 'albums') ||
        (S.view === 'artist' && b.getAttribute('data-nav') === 'artists'));
    });
    hookPlayer();
    startCoverExtract();
    render();
    updateDock();
    highlightPlaying();
  }

  function hide() {
    var wasOpen = S.open;
    S.open = false;
    var lib = document.getElementById('salt-library');
    if (lib) lib.classList.remove('open');
    var page = document.getElementById('heoMusic-page');
    var tb = document.getElementById('salt-topbar');
    page.classList.remove('salt-behind');
    if (tb) tb.classList.remove('salt-behind');
    if (wasOpen) {
      // 播放页从缩小态恢复
      page.classList.add('salt-restore');
      if (tb) tb.classList.add('salt-restore');
      setTimeout(function () {
        page.classList.remove('salt-restore', 'salt-minimize');
        if (tb) tb.classList.remove('salt-restore', 'salt-minimize');
      }, 360);
    } else {
      page.classList.remove('salt-minimize');
      if (tb) tb.classList.remove('salt-minimize');
    }
  }

  function open() { if (!available()) return; location.hash = '#/library/' + S.view; applyRoute(); }
  function close() { location.hash = '#/now'; applyRoute(); }
  function available() { return !!songs(); }
  function toggle() { if (S.open) close(); else open(); }

  window.addEventListener('hashchange', applyRoute);

  // ESC：播放页 ↔ 音乐库
  window.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (e.target && e.target.id === 'salt-lib-search') return; // 输入法取消组词时不触发
    if (S.open) close();
    else if (available()) open();
  });

  // 播放器就绪后再允许打开（拿到 localMusic 即可）
  var tries = 0;
  var timer = setInterval(function () {
    if (available()) { applyRoute(); clearInterval(timer); }
    else if (++tries > 300) clearInterval(timer);
  }, 100);

  // 加载可选元数据（歌手头像；缺省回退到首张专辑首首歌的 cover）
  fetch('./music-meta.json')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (m) {
      if (!m) return;
      S.meta.artists = m.artists || {};
      S.meta.albums = m.albums || {};
      if (S.open) { render(); updateDock(); }
    })
    .catch(function () {});

  // 播放页从音频内嵌标签提取到封面时回填音乐库（音乐库自己的兜底未跑或失败时）
  function noteCover(idx, pic) {
    if (typeof idx !== 'number' || !pic) return;
    var sg = songs() && songs()[idx];
    if (!sg) return;
    var k = albumKeyOf(sg);
    if (k && !S.covers[k]) { S.covers[k] = pic; patchCovers(k); }
  }

  window.SaltLibrary = {
    open: open, close: close, toggle: toggle,
    available: available, refresh: render, updateDock: updateDock,
    noteCover: noteCover
  };
})();
