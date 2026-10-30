// 本地音乐引擎：当 cover / lrc 为空时，尝试从音频文件的内嵌标签中提取
// 支持 FLAC（VORBIS_COMMENT + PICTURE）与 MP3（ID3v2 的 USLT / APIC）

var ap;

// 先只读取 64KB 的块头区域，再按需精确补读封面 / 歌词所在区间
var HEAD_READ_BYTES = 64 * 1024;
// 标签区间读取的绝对上限，防止异常文件导致过量下载
var MAX_TAG_BYTES = 2 * 1024 * 1024;
// 单首歌标签解析的超时时间，防止慢速远程地址阻塞播放器初始化
var TAG_READ_TIMEOUT = 5000;
// 常见的内嵌歌词标签名
var LYRIC_TAGS = ['LYRICS', 'UNSYNCEDLYRICS', 'UNSYNCED LYRICS', 'SYNCEDLYRICS', 'LRC'];

// 记录内嵌标签生成的 blob 地址
var embeddedBlobUrls = [];

function createEmbeddedBlobUrl(blob) {
  var url = URL.createObjectURL(blob);
  embeddedBlobUrls.push(url);
  return url;
}

function encodeNonAscii(str) {
  return str.replace(/[^\x00-\x7F]/g, function (c) {
    return encodeURIComponent(c);
  });
}

// 读取流并只保留前 limit 字节，避免下载大文件的剩余部分
async function readStreamBytes(res, limit) {
  if (!res.body || typeof res.body.getReader !== 'function') {
    var full = new Uint8Array(await res.arrayBuffer());
    return full.length > limit ? full.subarray(0, limit) : full;
  }

  var reader = res.body.getReader();
  var chunks = [];
  var received = 0;

  while (received < limit) {
    var part = await reader.read();
    if (part.done) break;
    chunks.push(part.value);
    received += part.value.length;
  }
  reader.cancel().catch(function () {});

  var bytes = new Uint8Array(Math.min(received, limit));
  var offset = 0;
  for (var i = 0; i < chunks.length && offset < bytes.length; i++) {
    var length = Math.min(chunks[i].length, bytes.length - offset);
    bytes.set(chunks[i].subarray(0, length), offset);
    offset += length;
  }
  return bytes;
}

// 请求指定字节区间；服务器忽略 Range 时返回 200，由调用方决定读取上限
// 远程地址需要目标服务器返回 CORS 允许头，否则浏览器会拦截
async function fetchRange(url, start, end) {
  var controller = new AbortController();
  var timer = setTimeout(function () {
    controller.abort();
  }, TAG_READ_TIMEOUT);

  try {
    var res = await fetch(url, {
      headers: { Range: 'bytes=' + start + '-' + end },
      signal: controller.signal
    });
    if (!res.ok) return null;

    if (res.status === 206) {
      return { bytes: new Uint8Array(await res.arrayBuffer()), ranged: true };
    }
    return { response: res, ranged: false };
  } finally {
    clearTimeout(timer);
  }
}

// 读取音频标签区：先取 64KB，解析时再按需补读缺失区间
async function readAudioHead(url) {
  var first = await fetchRange(url, 0, HEAD_READ_BYTES - 1);
  if (!first) return null;

  // 服务器不支持 Range 时只能顺序读取，最多取 MAX_TAG_BYTES
  if (!first.ranged) {
    return { bytes: await readStreamBytes(first.response, MAX_TAG_BYTES), canRange: false, url: url };
  }

  return { bytes: first.bytes, canRange: true, url: url };
}

// 确保缓冲区包含前 end 个字节；支持 Range 时只补读缺失部分
async function ensureBytes(head, end) {
  if (end <= head.bytes.length) return head.bytes;
  if (!head.canRange) return head.bytes;

  // 多预读 4KB，避免为下一个元数据块头再单独发一次请求
  end = Math.min(end + 4096, MAX_TAG_BYTES);
  var part = await fetchRange(head.url, head.bytes.length, end - 1);
  if (!part || !part.ranged || part.bytes.length === 0) return head.bytes;

  var merged = new Uint8Array(head.bytes.length + part.bytes.length);
  merged.set(head.bytes, 0);
  merged.set(part.bytes, head.bytes.length);
  head.bytes = merged;
  return head.bytes;
}

// 判断文本是否带有 LRC 时间轴，避免把纯文本歌词交给 APlayer
function isLrc(text) {
  return /\[\d{1,3}:\d{1,2}[.:]\d{1,3}\]/.test(text);
}

// 解析 FLAC 的 VORBIS_COMMENT 块，取出歌词字段
function parseVorbisComment(block) {
  if (block.length < 8) return null;

  var view = new DataView(block.buffer, block.byteOffset, block.byteLength);
  var pos = 4 + view.getUint32(0, true); // 跳过 vendor 字符串
  if (pos + 4 > block.length) return null;

  var count = view.getUint32(pos, true);
  pos += 4;
  var decoder = new TextDecoder('utf-8');

  for (var i = 0; i < count && pos + 4 <= block.length; i++) {
    var size = view.getUint32(pos, true);
    pos += 4;
    if (pos + size > block.length) break;

    var text = decoder.decode(block.subarray(pos, pos + size));
    pos += size;

    var eq = text.indexOf('=');
    if (eq === -1) continue;

    var key = text.slice(0, eq).toUpperCase();
    if (LYRIC_TAGS.indexOf(key) !== -1) {
      var value = text.slice(eq + 1).trim();
      if (isLrc(value)) return value;
    }
  }
  return null;
}

// 解析 FLAC 的 PICTURE 块，返回封面 Blob
function parseFlacPicture(block) {
  if (block.length < 32) return null;

  var view = new DataView(block.buffer, block.byteOffset, block.byteLength);
  var pos = 4; // 跳过图片类型
  var mimeLength = view.getUint32(pos);
  pos += 4;
  var mime = new TextDecoder('ascii').decode(block.subarray(pos, pos + mimeLength));
  pos += mimeLength;
  var descLength = view.getUint32(pos);
  pos += 4 + descLength;
  pos += 16; // 跳过宽、高、色深、调色板数量
  var dataLength = view.getUint32(pos);
  pos += 4;

  if (dataLength === 0 || pos + dataLength > block.length) return null;
  return new Blob([block.subarray(pos, pos + dataLength)], { type: mime || 'image/jpeg' });
}

// 解析 FLAC 元数据块（块数据超出已读范围时按需补读）
async function parseFlac(head) {
  var bytes = head.bytes;
  if (bytes.length < 4 || bytes[0] !== 0x66 || bytes[1] !== 0x4c || bytes[2] !== 0x61 || bytes[3] !== 0x43) {
    return null;
  }

  var result = { cover: null, lrc: null };
  var offset = 4;

  while (offset + 4 <= MAX_TAG_BYTES) {
    if (offset + 4 > head.bytes.length) {
      await ensureBytes(head, offset + 4);
      if (offset + 4 > head.bytes.length) break; // 无法继续读取块头
    }

    var isLast = head.bytes[offset] & 0x80;
    var type = head.bytes[offset] & 0x7f;
    var size = (head.bytes[offset + 1] << 16) | (head.bytes[offset + 2] << 8) | head.bytes[offset + 3];
    var start = offset + 4;
    var end = start + size;

    if (end > MAX_TAG_BYTES) break;

    if (type === 4 || type === 6) {
      await ensureBytes(head, end);
      if (end <= head.bytes.length) {
        var block = head.bytes.subarray(start, end);
        if (type === 4 && !result.lrc) {
          result.lrc = parseVorbisComment(block);
        } else if (type === 6 && !result.cover) {
          result.cover = parseFlacPicture(block);
        }
      }
    }

    if (isLast) break;
    offset = end;
  }
  return result;
}

function readSynchsafe(bytes, offset) {
  return ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f);
}

function readUint32(bytes, offset) {
  return (bytes[offset] << 24 | bytes[offset + 1] << 16 | bytes[offset + 2] << 8 | bytes[offset + 3]) >>> 0;
}

// 跳过 ID3 文本描述（UTF-16 编码时以两个 0 字节结束）
function skipTagText(frame, offset, encoding) {
  if (encoding === 1 || encoding === 2) {
    for (var i = offset; i + 1 < frame.length; i += 2) {
      if (frame[i] === 0 && frame[i + 1] === 0) return i + 2;
    }
    return -1;
  }
  var end = frame.indexOf(0, offset);
  return end === -1 ? -1 : end + 1;
}

function decodeTagText(encoding, bytes) {
  var text;
  if (encoding === 1 || encoding === 2) {
    var littleEndian = true;
    var start = 0;
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      start = 2;
    } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      start = 2;
      littleEndian = false;
    }
    text = new TextDecoder(littleEndian ? 'utf-16le' : 'utf-16be').decode(bytes.subarray(start));
  } else if (encoding === 3) {
    text = new TextDecoder('utf-8').decode(bytes);
  } else {
    text = new TextDecoder('iso-8859-1').decode(bytes);
  }
  return text.replace(/\u0000+$/g, '');
}

// 解析 ID3v2 的 APIC（封面）帧
function parseApicFrame(frame) {
  if (frame.length < 4) return null;

  var encoding = frame[0];
  var mimeEnd = frame.indexOf(0, 1);
  if (mimeEnd === -1) return null;

  var mime = new TextDecoder('ascii').decode(frame.subarray(1, mimeEnd));
  var pos = skipTagText(frame, mimeEnd + 2, encoding); // 跳过 MIME 与图片类型
  if (pos === -1 || pos >= frame.length) return null;

  var data = frame.subarray(pos);
  if (!mime && data.length >= 2) {
    if (data[0] === 0xff && data[1] === 0xd8) mime = 'image/jpeg';
    else if (data[0] === 0x89 && data[1] === 0x50) mime = 'image/png';
  }
  return data.length ? new Blob([data], { type: mime || 'image/jpeg' }) : null;
}

// 解析 ID3v2 的 USLT（歌词）帧
function parseUsltFrame(frame) {
  if (frame.length < 5) return null;

  var encoding = frame[0];
  var pos = skipTagText(frame, 4, encoding); // 跳过语言(3 字节)与描述
  if (pos === -1 || pos >= frame.length) return null;

  var text = decodeTagText(encoding, frame.subarray(pos)).trim();
  return isLrc(text) ? text : null;
}

// 解析 MP3 的 ID3v2 标签（标签区超出已读范围时按需补读）
async function parseId3(head) {
  var bytes = head.bytes;
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return null;

  var major = bytes[3];
  if (major < 3 || major > 4) return null;

  var tagSize = 10 + readSynchsafe(bytes, 6);
  if (tagSize > MAX_TAG_BYTES) tagSize = MAX_TAG_BYTES;
  await ensureBytes(head, tagSize);

  var tagEnd = Math.min(tagSize, head.bytes.length);
  var result = { cover: null, lrc: null };
  var pos = 10;

  while (pos + 10 <= tagEnd && head.bytes[pos] !== 0) {
    var id = String.fromCharCode(head.bytes[pos], head.bytes[pos + 1], head.bytes[pos + 2], head.bytes[pos + 3]);
    var size = major === 4 ? readSynchsafe(head.bytes, pos + 4) : readUint32(head.bytes, pos + 4);
    pos += 10;
    if (size <= 0 || pos + size > tagEnd) break;

    var frame = head.bytes.subarray(pos, pos + size);
    if (id === 'APIC' && !result.cover) {
      result.cover = parseApicFrame(frame);
    } else if (id === 'USLT' && !result.lrc) {
      result.lrc = parseUsltFrame(frame);
    }
    pos += size;
  }
  return result;
}

// 读取单首歌的内嵌封面 / 歌词，仅补全用户没有填写的字段。
// 只读取一首：按需调用（切到该曲时才发起请求），避免打开页面就拉整个歌单。
async function extractEmbeddedTags(audio) {
  if (!audio || !audio.url) return null;
  if (/^(blob|data):/i.test(audio.url)) return null;
  // 封面与歌词都由用户配置时无需读取
  if (audio.userCover && audio.userLrc) return null;

  try {
    var head = await readAudioHead(audio.url);
    if (!head) return null;

    var tags = (await parseFlac(head)) || (await parseId3(head));
    if (!tags) return null;

    var result = { cover: null, lrc: null };
    if (!audio.userCover && tags.cover) result.cover = createEmbeddedBlobUrl(tags.cover);
    if (!audio.userLrc && tags.lrc) result.lrc = tags.lrc;
    if (!result.cover && !result.lrc) return null;
    return result;
  } catch (err) {
    // 远程地址常见的跨域 / 超时失败，静默降级为无封面、无歌词
    console.warn('[HeoMusic] 无法读取内嵌标签：' + audio.url, err);
    return null;
  }
}

// 用给定歌单数据创建本地音乐播放器（切换歌单时由 main.js 调用）
async function initLocalPlayer(audioList) {
  var audios = audioList.map(function (item, i) {
    return {
      // 全量曲库中的原始下标：队列被「播放全部」替换成子集后，仍能靠它把库里的歌对齐回队列
      srcIndex: i,
      name: item.name,
      artist: item.artist,
      url: encodeNonAscii(item.url),
      cover: item.cover ? encodeNonAscii(item.cover) : '',
      // lrcType 1：lrc 字段存内联文本（先占位），真实歌词由 setupLazyTags 异步补全
      lrc: '[00:00.00] 暂无歌词',
      lrcUrl: item.lrc ? encodeNonAscii(item.lrc) : '',
      userCover: !!item.cover,
      userLrc: !!item.lrc,
      tagsLoaded: false
    };
  });

  audios.forEach(function (audio) {
    if (!audio.cover) delete audio.cover;
  });

  // 全量曲库对象数组：供音乐库「播放全部 / 点歌」按全量下标取对象
  window.HeoAudios = audios;

  document.getElementById('heoMusic-page').classList.add('localMusic');

  ap = new APlayer({
    container: document.getElementById('heoMusic-page'),
    lrcType: 1,
    audio: audios,
    listFolded: window.innerWidth < 768 ? true : false
  });
  window.ap = ap;

  heo.setupMediaSessionHandlers(ap);
  if (window.SaltPlayer) { window.SaltPlayer.setup(ap); }
  setupLazyTags(ap);
  setupSeekFallback(ap);
}

// 封面 / 歌词按需读取：只为当前播放的曲目发起请求，切歌时才补全，
// 避免页面一打开就把整个歌单的音频头部全部请求一遍。
function setupLazyTags(player) {
  if (!player) return;

  var lrcCache = {};   // lrcUrl -> 文本，避免重复请求

  function applyCover(index) {
    var audio = player.list.audios[index];
    if (!audio || !audio.cover) return;
    if (index !== player.list.index) return;
    var bg = window.saltCssUrl ? window.saltCssUrl(audio.cover) : "url('" + audio.cover + "')";
    player.template.pic.style.backgroundImage = bg;
    var musicBg = document.getElementById('music_bg');
    if (musicBg) musicBg.style.backgroundImage = bg;
    // 背景（封面模糊）由 playerUI 监听 pic style 变化自动同步，无需手动触发
  }

  // 把解析后的歌词写入 APlayer 的 Lrc 缓存并重绘
  function applyLrc(index, text) {
    var lrc = player.lrc;
    if (!lrc || typeof lrc.parse !== 'function' || !text) return;
    var parsed = lrc.parse(text);
    if (!parsed || !parsed.length) return;
    lrc.parsed[index] = parsed;
    if (index !== player.list.index) return;
    lrc.switch(index);
    lrc.update(player.audio.currentTime || 0);
  }

  // 歌词：优先请求用户配置的 lrcUrl，失败或缺失则回退音频内嵌 USLT
  function loadLyrics(index) {
    var audio = player.list.audios[index];
    if (!audio) return;
    function embedded() {
      extractEmbeddedTags({ url: audio.url, userCover: true, userLrc: false })
        .then(function (tags) { if (tags && tags.lrc) applyLrc(index, tags.lrc); })
        .catch(function () {});
    }
    if (audio.lrcUrl) {
      var p = lrcCache[audio.lrcUrl]
        ? Promise.resolve(lrcCache[audio.lrcUrl])
        : fetch(audio.lrcUrl)
            .then(function (res) { return res.ok ? res.text() : Promise.reject(res.status); })
            .then(function (text) { lrcCache[audio.lrcUrl] = text; return text; });
      p.then(function (text) {
        if (text && isLrc(text)) applyLrc(index, text);
        else embedded();
      }).catch(embedded);
    } else {
      embedded();
    }
  }

  // 封面：用户未填 cover 时从音频内嵌 APIC/PICTURE 补全
  function loadCover(index) {
    var audio = player.list.audios[index];
    if (!audio || audio.cover) return;
    extractEmbeddedTags({ url: audio.url, userCover: false, userLrc: true })
      .then(function (tags) {
        if (tags && tags.cover && !audio.cover) { audio.cover = tags.cover; applyCover(index); }
      })
      .catch(function () {});
  }

  function ensure(index) {
    var audio = player.list.audios[index];
    if (!audio || audio.tagsLoaded) return;
    audio.tagsLoaded = true;   // 每首只尝试一次，失败保持占位 / 无封面
    loadCover(index);
    loadLyrics(index);
  }

  // listswitch 触发时 list.index 还没更新，必须用事件里的 index
  player.on('listswitch', function (data) {
    ensure(data && typeof data.index === 'number' ? data.index : player.list.index);
  });

  // APlayer 构造时已切到第 0 首，这里补一次初始曲目
  ensure(player.list.index);
}

// 不支持 Range 的服务器（如 python http.server）会让 audio.seekable 恒为 0，
// 拖动进度条/点击歌词时会直接跳回开头。这里对同源音频整檔缓存为 Blob 后替换地址，
// 使其恢复可拖动；远程地址仍交给服务器，避免额外流量。
function setupSeekFallback(player) {
  var pending = {};

  function isSameOriginUrl(url) {
    if (!url) return false;
    if (url.indexOf('blob:') === 0 || url.indexOf('data:') === 0) return true;
    if (url.charAt(0) === '/' || url.charAt(0) === '.') return true;
    try {
      return new URL(url, location.href).origin === location.origin;
    } catch (e) {
      return false;
    }
  }

  function canSeek(audio) {
    var s = audio.seekable;
    return s && s.length > 0 && s.end(s.length - 1) > 0;
  }

  function cacheCurrent(index) {
    var item = player.list.audios[index];
    if (!item || pending[index] || !isSameOriginUrl(item.url)) return;
    if (item.url.indexOf('blob:') === 0) return; // 已缓存
    pending[index] = true;

    fetch(item.url)
      .then(function (res) {
        return res.ok ? res.blob() : null;
      })
      .then(function (blob) {
        if (!blob || index !== player.list.index) return;
        var audio = player.audio;
        var keepTime = audio.currentTime;
        var wasPlaying = !player.paused;
        item.url = URL.createObjectURL(blob);
        audio.src = item.url;
        audio.addEventListener('loadedmetadata', function onMeta() {
          audio.removeEventListener('loadedmetadata', onMeta);
          if (keepTime > 0) audio.currentTime = keepTime;
        });
        if (wasPlaying) audio.play().catch(function () {});
      })
      .catch(function () {});
  }

  player.audio.addEventListener('loadedmetadata', function () {
    if (canSeek(player.audio)) return;
    cacheCurrent(player.list.index);
  });
}

window.initLocalPlayer = initLocalPlayer;

// 供音乐库按需提取内嵌封面（每专辑只取第一首，避免全量请求）
window.HeoTags = {
  extractCover: function (url) {
    return extractEmbeddedTags({ url: url, userCover: false, userLrc: true }).then(function (tags) {
      return tags ? tags.cover : null;
    });
  }
};

// 页面加载本文件后直接初始化单歌单播放器
if (typeof localMusic !== 'undefined' && Array.isArray(localMusic) && localMusic.length > 0) {
  initLocalPlayer(localMusic);
}
