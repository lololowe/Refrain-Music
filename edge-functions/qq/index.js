// EdgeOne 边缘函数：QQ 音乐官方接口代理（仓库根目录的 edge-functions/qq，与整站同项目部署，路由 /qq）
// 浏览器拿不到 c.y.qq.com 的 CORS 授权、也无法伪造 Referer；老的 client_search_cp
// 接口已退役（服务端直连也 500）。这里在服务端复刻 MusicPlayer2 原生客户端的请求头，
// 改走现役 u.y.qq.com/cgi-bin/musics.fcg + sign 签名，再把结果带 CORS 头返回。
// 运行时为 V8（非 Node）：不用 Node 内置、不用 btoa/escape，base64 与 UTF-8 自行实现。
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const REFERER = 'https://y.qq.com/';
// music.lololowe.com 是同域（本来不需要 CORS），host.lololowe.com 是本地开发的跨域来源
const TRUSTED = /^https?:\/\/(?:host|music)\.lololowe\.com(:\d+)?$/;

/* ---------- UTF-8 字节与 base64（V8 安全实现） ---------- */
function utf8Bytes(s) { return new TextEncoder().encode(String(s)); }
const B64T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64(bytes) {
  var out = '';
  for (var i = 0; i < bytes.length; i += 3) {
    var b0 = bytes[i], b1 = i + 1 < bytes.length ? bytes[i + 1] : 0, b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64T[b0 >> 2] + B64T[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64T[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? B64T[b2 & 63] : '=';
  }
  return out;
}

/* ---------- 纯 JS MD5（输入字符串，按 UTF-8 字节计算） ---------- */
function md5(str) {
  function rl(n, c) { return (n << c) | (n >>> (32 - c)); }
  function ad(x, y) {
    var l = (x & 0xffff) + (y & 0xffff);
    return ((((x >> 16) + (y >> 16) + (l >> 16)) << 16) | (l & 0xffff));
  }
  function cm(q, a, b, x, s, t) { return ad(rl(ad(ad(a, q), ad(x, t)), s), b); }
  function ff(a, b, c, d, x, s, t) { return cm((b & c) | (~b & d), a, b, x, s, t); }
  function gg(a, b, c, d, x, s, t) { return cm((b & d) | (c & ~d), a, b, x, s, t); }
  function hh(a, b, c, d, x, s, t) { return cm(b ^ c ^ d, a, b, x, s, t); }
  function ii(a, b, c, d, x, s, t) { return cm(c ^ (b | ~d), a, b, x, s, t); }
  function hex8(v) {
    var out = '';
    for (var i = 0; i < 4; i++) {
      var b = (v >>> (i * 8)) & 0xff;
      out += '0123456789abcdef'.charAt(b >> 4) + '0123456789abcdef'.charAt(b & 15);
    }
    return out;
  }
  var bytes = utf8Bytes(str);
  var n = bytes.length;
  var total = ((n + 8) >> 6) + 1;
  var words = new Array(total * 16);
  for (var w = 0; w < words.length; w++) words[w] = 0;
  for (var i = 0; i < n; i++) words[i >> 2] |= bytes[i] << ((i % 4) * 8);
  words[n >> 2] |= 0x80 << ((n % 4) * 8);
  words[total * 16 - 2] = n * 8;
  var a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
  for (var k = 0; k < words.length; k += 16) {
    var oa = a, ob = b, oc = c, od = d;
    var x = words.slice(k, k + 16);
    a = ff(a, b, c, d, x[0], 7, -680876936); d = ff(d, a, b, c, x[1], 12, -389564586); c = ff(c, d, a, b, x[2], 17, 606105819); b = ff(b, c, d, a, x[3], 22, -1044525330);
    a = ff(a, b, c, d, x[4], 7, -176418897); d = ff(d, a, b, c, x[5], 12, 1200080426); c = ff(c, d, a, b, x[6], 17, -1473231341); b = ff(b, c, d, a, x[7], 22, -45705983);
    a = ff(a, b, c, d, x[8], 7, 1770035416); d = ff(d, a, b, c, x[9], 12, -1958414417); c = ff(c, d, a, b, x[10], 17, -42063); b = ff(b, c, d, a, x[11], 22, -1990404162);
    a = ff(a, b, c, d, x[12], 7, 1804603682); d = ff(d, a, b, c, x[13], 12, -40341101); c = ff(c, d, a, b, x[14], 17, -1502002290); b = ff(b, c, d, a, x[15], 22, 1236535329);
    a = gg(a, b, c, d, x[1], 5, -165796510); d = gg(d, a, b, c, x[6], 9, -1069501632); c = gg(c, d, a, b, x[11], 14, 643717713); b = gg(b, c, d, a, x[0], 20, -373897302);
    a = gg(a, b, c, d, x[5], 5, -701558691); d = gg(d, a, b, c, x[10], 9, 38016083); c = gg(c, d, a, b, x[15], 14, -660478335); b = gg(b, c, d, a, x[4], 20, -405537848);
    a = gg(a, b, c, d, x[9], 5, 568446438); d = gg(d, a, b, c, x[14], 9, -1019803690); c = gg(c, d, a, b, x[3], 14, -187363961); b = gg(b, c, d, a, x[8], 20, 1163531501);
    a = gg(a, b, c, d, x[13], 5, -1444681467); d = gg(d, a, b, c, x[2], 9, -51403784); c = gg(c, d, a, b, x[7], 14, 1735328473); b = gg(b, c, d, a, x[12], 20, -1926607734);
    a = hh(a, b, c, d, x[5], 4, -378558); d = hh(d, a, b, c, x[8], 11, -2022574463); c = hh(c, d, a, b, x[11], 16, 1839030562); b = hh(b, c, d, a, x[14], 23, -35309556);
    a = hh(a, b, c, d, x[1], 4, -1530992060); d = hh(d, a, b, c, x[4], 11, 1272893353); c = hh(c, d, a, b, x[7], 16, -155497632); b = hh(b, c, d, a, x[10], 23, -1094730640);
    a = hh(a, b, c, d, x[13], 4, 681279174); d = hh(d, a, b, c, x[0], 11, -358537222); c = hh(c, d, a, b, x[3], 16, -722521979); b = hh(b, c, d, a, x[6], 23, 76029189);
    a = hh(a, b, c, d, x[9], 4, -640364487); d = hh(d, a, b, c, x[12], 11, -421815835); c = hh(c, d, a, b, x[15], 16, 530742520); b = hh(b, c, d, a, x[2], 23, -995338651);
    a = ii(a, b, c, d, x[0], 6, -198630844); d = ii(d, a, b, c, x[7], 10, 1126891415); c = ii(c, d, a, b, x[14], 15, -1416354905); b = ii(b, c, d, a, x[5], 21, -57434055);
    a = ii(a, b, c, d, x[12], 6, 1700485571); d = ii(d, a, b, c, x[3], 10, -1894986606); c = ii(c, d, a, b, x[10], 15, -1051523); b = ii(b, c, d, a, x[1], 21, -2054922799);
    a = ii(a, b, c, d, x[8], 6, 1873313359); d = ii(d, a, b, c, x[15], 10, -30611744); c = ii(c, d, a, b, x[6], 15, -1560198380); b = ii(b, c, d, a, x[13], 21, 1309151649);
    a = ii(a, b, c, d, x[4], 6, -145523070); d = ii(d, a, b, c, x[11], 10, -1120210379); c = ii(c, d, a, b, x[2], 15, 718787259); b = ii(b, c, d, a, x[9], 21, -343485551);
    a = ad(a, oa); b = ad(b, ob); c = ad(c, oc); d = ad(d, od);
  }
  return hex8(a) + hex8(b) + hex8(c) + hex8(d);
}

/* ---------- 官方 sign 签名（zzb / zzc 双变体，probe 用于判定哪个活着） ---------- */
const L1 = [212, 45, 80, 68, 195, 163, 163, 203, 157, 220, 254, 91, 204, 79, 104, 6];
function getSign(payload, prefix) {
  var hex = md5(JSON.stringify(payload)).toUpperCase();
  var bytes = [];
  for (var i = 0; i < 16; i++) bytes.push(parseInt(hex.substr(i * 2, 2), 16));
  var t1 = [21, 4, 9, 26, 16, 20, 27, 30].map(function (i) { return hex[i]; }).join('');
  var t3 = [18, 11, 3, 2, 1, 7, 6, 25].map(function (i) { return hex[i]; }).join('');
  var xor = [];
  for (var j = 0; j < 16; j++) xor.push(L1[j] ^ bytes[j]);
  var t2 = b64(xor);
  return (prefix + t1 + t2 + t3).toLowerCase().replace(/\+/g, '').replace(/\//g, '').replace(/=/g, '');
}

function musicsFcgUrl(payload, prefix) {
  var data = JSON.stringify(payload);
  return 'https://u.y.qq.com/cgi-bin/musics.fcg?sign=' + getSign(payload, prefix) +
    '&g_tk=5381&loginUin=0&hostUin=0&format=json&inCharset=utf8&outCharset=utf8&notice=0&platform=yqq.json&needNewCode=0' +
    '&data=' + encodeURIComponent(data);
}

function searchPayload(w) {
  return {
    comm: { ct: '19', cv: '1859', uin: '0' },
    req: {
      module: 'music.search.SearchCgiService',
      method: 'DoSearchForQQMusicDesktop',
      param: { num_per_page: '5', page_num: 1, query: w },
    },
  };
}
function lyricPayload(mid) {
  return {
    comm: { ct: '19', cv: '1859', uin: '0' },
    req: {
      module: 'music.musichallSong.PlayLyricInfo',
      method: 'GetPlayLyricInfo',
      param: { songmid: mid },
    },
  };
}

async function proxyJson(url) {
  const res = await fetch(url, { headers: { Referer: REFERER, 'User-Agent': UA } });
  if (!res.ok) throw new Error('upstream ' + res.status);
  return res.json();
}

// 现役搜索：返回归一化的歌曲列表
async function qqSearch(w) {
  const j = await proxyJson(musicsFcgUrl(searchPayload(w), 'zzb'));
  const list = j && j.req && j.req.data && j.req.data.body && j.req.data.body.song && j.req.data.body.song.list;
  if (!Array.isArray(list)) throw new Error('bad search shape: ' + JSON.stringify(j).slice(0, 200));
  return list.map(function (it) {
    return {
      songname: it.name,
      songmid: it.mid,
      albummid: it.album && it.album.mid,
      albumname: it.album && it.album.name,
      interval: it.interval,
      singer: (it.singer || []).map(function (s) { return { name: s.name }; }),
    };
  });
}

async function qqLyric(mid) {
  const j = await proxyJson(musicsFcgUrl(lyricPayload(mid), 'zzb'));
  const d = j && j.req && j.req.data;
  return { lyric: (d && d.lyric) || '', trans: (d && d.trans) || '' };
}

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': TRUSTED.test(origin) ? origin : '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

export async function onRequest(context) {
  const request = context.request;
  const h = corsHeaders(request);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });

  const u = new URL(request.url);
  const act = u.searchParams.get('act');
  const json = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: h });
  try {
    if (act === 'search') {
      return json({ list: await qqSearch(u.searchParams.get('w') || '') });
    }
    if (act === 'lyric') {
      return json(await qqLyric(u.searchParams.get('songmid') || ''));
    }
    if (act === 'probe') {
      // 自诊断：两种签名前缀各打一次，带回上游状态与响应片段，用于判定哪种活着
      const out = {};
      for (const prefix of ['zzb', 'zzc']) {
        try {
          const r = await fetch(musicsFcgUrl(searchPayload('周杰伦'), prefix), { headers: { Referer: REFERER, 'User-Agent': UA } });
          const t = await r.text();
          out[prefix] = { status: r.status, body: t.slice(0, 300) };
        } catch (e) {
          out[prefix] = { error: String((e && e.message) || e) };
        }
      }
      return json(out);
    }
    return json({ error: 'unknown act' }, 400);
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 502);
  }
}
