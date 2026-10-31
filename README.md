# Refrain

![Refrain 播放界面](/img/screenshot.png)

一个基于 [APlayer](https://github.com/DIYgod/APlayer) 和 [MetingJS](https://github.com/metowolf/MetingJS) 的静态音乐播放器。

> 本项目基于 [zhheo/HeoMusic](https://github.com/zhheo/HeoMusic)（Apache 2.0）大幅修改而来，保留原项目的核心播放能力，并重构了界面与本地音乐库。

## 基本操作

`Space空格键`：暂停/播放音乐

`上/下方向键`：增加/减少音量

`左/右方向键`：上一曲/下一曲

切歌（播放页与音乐库底栏的上一曲 / 下一曲按钮、`←` `→` 方向键、系统媒体键）在暂停状态下也会直接开始播放。

`ESC键`：在播放页与音乐库之间切换

## 修改歌单/私有部署与配置

### 使用URL参数（推荐）（适用于在线音乐）

Refrain 支持 URL 参数 `/?id=` + id + `&server=` + server（部署到你自己的域名后使用）

例如：

**示例歌单:** https://你的域名/?id=2762963245&server=netease

在线音乐模式歌单 ID 的解析由 [js/Meting.js](js/Meting.js) 内置的默认Meting API接口完成： `https://music.zhheo.com/meting-api/`。

### 修改配置文件（适用于在线音乐和本地音乐）

将`config.js.demo`文件重命名为`config.js`，并修改其中的配置

直接访问首页`index.html`即可

#### ID

播放列表的id，可以从音乐歌单分享的链接中获取，例如`https://y.qq.com/n/ryqq/playlist/8668419170`中，id为`8668419170`

#### Server

播放列表的服务商，例如`netease`（网易云音乐）,`tencent`（腾讯）,`kugou`（酷狗）,`xiami`（小米音乐）,`baidu`（百度音乐）

#### Type（可选）

播放列表的类型，例如`song`（单曲）, `playlist`（歌单，默认）, `album`（专辑）, `search`（搜索结果）, `artist`（歌手）

#### localMusic（可选）

本地音乐/外链音乐。如果填写了本地音乐，则优先使用本地音乐。

本地音乐需要添加loaclMusic数组，它的形式类似于：

```
  var localMusic = [{
      name: '重生之我在异乡为异客',
      artist: '王睿卓',
      url: '/music/重生之我在异乡为异客.mp3',
      cover: '/music/重生之我在异乡为异客.png',
      lrc: '/music/重生之我在异乡为异客.lrc'
  },
  {
      name: '落',
      artist: '唐伯虎',
      url: '/music/落.mp3',
      cover: '/music/落.png',
      lrc: '/music/落.lrc'
  }
  ];
```

#### remoteMusic（可选）

使用json格式的链接来进行读取localMusic，会覆盖localMusic的设置。

例如：

```
var remoteMusic = './music.json';
```

musicjson内容例如：

```
[
  {
    "name": "重生之我在异乡为异客",
    "artist": "王睿卓",
    "url": "/music/重生之我在异乡为异客.mp3",
    "cover": "/music/重生之我在异乡为异客.png",
    "lrc": "/music/重生之我在异乡为异客.lrc"
  },
  {
    "name": "落",
    "artist": "唐伯虎",
    "url": "/music/落.mp3",
    "cover": "/music/落.png",
    "lrc": "/music/落.lrc"
  }
]
```

## 本地音乐库数据文件

本地音乐模式（音乐库的歌曲 / 专辑 / 艺术家三个板块）依赖下面两个 JSON 数据文件。两者都已在 `.gitignore` 中，**不会随仓库发布**，需要自行创建。

### music-list.json（本地模式必需）

扁平的歌曲数组，通过 `config.js` 的 `remoteMusic` 指向（读取时会自动附加时间戳，避免浏览器缓存旧文件）：

```
[
  {
    "name": "Airport Arrival",
    "artist": "陶喆",
    "url": "/music/陶喆/1997-陶喆同名专辑/陶喆 - Airport Arrival.flac",
    "cover": "/music/陶喆/1997-陶喆同名专辑/cover.jpg",
    "lrc": "/music/陶喆/1997-陶喆同名专辑/陶喆 - Airport Arrival.lrc",
    "album": "1997-陶喆同名专辑"
  }
]
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `name` | 是 | 歌名 |
| `artist` | 是 | 歌手；多位歌手用 `、` `，` `,` 分隔，音乐库会拆分成多个艺术家 |
| `url` | 是 | 音频地址，本地相对路径或外链均可 |
| `cover` | 否 | 封面图地址 |
| `lrc` | 否 | 歌词文件地址 |
| `album` | 否 | 专辑 key；**留空则由 QQ 接口自动识别**（见下一节），识别不到才退回 `url` 的父文件夹名，再退回「未知专辑」 |

专辑 key 建议写成 `年份-专辑名`（如 `1997-陶喆同名专辑`）：音乐库会把开头的四位年份解析出来单独显示，列表里只展示去掉年份后的专辑名。

所以新增一首歌最少只要填 `url` / `artist` / `name` 三项：歌词、封面、专辑、年份都会在打开音乐库时自动补全并按专辑归类（前提是第一级没填、且接口代理可用）。

### music-meta.json（可选）

为音乐库补充艺术家头像与专辑封面；文件缺失或请求失败时静默忽略，不影响播放：

```
{
  "artists": {
    "陶喆": { "pic": "https://example.com/artist.jpg" }
  },
  "albums": {
    "1997-陶喆同名专辑": { "pic": "https://example.com/album.jpg" }
  }
}
```

- `albums` 的 key 必须与 `music-list.json` 里的 `album` 字段（或缺省推导出的父文件夹名）**完全一致**
- 专辑封面回退链：`music-meta.json` 的 `pic` → 自动取该专辑第一首歌的 `cover` → 留空
- 艺术家头像回退链：`music-meta.json` 的 `pic` → 其第一张专辑的封面 → 留空

## 封面 / 歌词 / 专辑自动补全（三级兜底）

每首歌的封面与歌词按下面的顺序取值，前一级拿不到才走下一级（实现在 [js/localEngine.js](js/localEngine.js)，音乐库侧的同步逻辑在 [js/library.js](js/library.js)）：

1. **数据文件里的外链** —— `music-list.json` 的 `cover` / `lrc` 字段，或 `music-meta.json` 的专辑 `pic`
2. **音频内嵌标签** —— 用 `Range` 请求只读文件头尾，解析 FLAC 的 `VORBIS PICTURE` / `METADATA_BLOCK` 与 MP3 的 ID3v2 `APIC` / `USLT`；封面提取成功后会回写音乐库，专辑页、歌曲行、卡片和底栏一并刷新
3. **QQ 音乐接口识别** —— 按「歌名 + 歌手」搜索匹配，用命中的 `albummid` 拼封面图地址、用 `songmid` 取歌词（base64 解码后校验是否为合法 LRC）、用 `albumname` 加条目顶层的 `time_public` 得到专辑名与发行年份（拼成 `年份-专辑名` 作为专辑 key）

### 专辑 / 年份识别的细节

- **只补空缺**：`music-list.json` 里已填 `album` 的歌一律不动，识别只作用于留空的条目。结果写回内存中的曲库对象与 APlayer 的 audio 副本（系统媒体通知的专辑名取自后者），**不会改写 json 文件本身**（纯静态站点没有写文件的能力）；想把识别结果固化下来，就自己把 `album` 填进文件。
- **年份来源**：搜索接口条目顶层的 `time_public`（如 `1997-12-06`）。专辑详情类接口（`pf_album_detail` / `pf_song_detail`）被 QQ 网关的 module 白名单挡住，一律返回 `500003`，所以年份只能从搜索结果里取 —— 好处是一次搜索就同时拿到专辑名、年份、封面 mid，不需要额外请求。
- **版本降权**：同名曲目常有 live / 演唱会 / 精选辑版本，`qqPick` 先把专辑名含 `live|concert|演唱会|巡演|精选|greatest|伴奏` 等字样的候选降权，只在没有录音室候选时才接受。不降权的话《飞机场的10：30》会被挂到 2015 年的 Mini Concert 专辑上（它排在搜索结果前面）。
- **缓存与开销**：每首歌一次搜索请求，并发 2；结果按「歌名|歌手」存进 `localStorage` 的 `refrain.qqalbum`（查过但没匹配上的负结果也存，网络失败则不存以便下次重试），所以只有第一次打开音乐库会产生请求。想强制重查，清掉这个 key 即可。
- **识别时机**：打开音乐库时启动，全部识别完才开始提取专辑封面（专辑 key 定型后封面才有地方挂）。识别过程中列表页节流重渲染（600ms），专辑 / 艺术家详情页不动；结束时若当前详情页的 key 已失效（歌被搬去新专辑），会自动退回对应列表页。
- **识别错了怎么办**：同名多版本、翻唱、AI 曲目都可能挂错（例如 AI 翻唱会拿到原唱的专辑）。手动在 `music-list.json` 里填上 `album` 就能覆盖，显式值永远优先。

### 第三级依赖的接口代理

浏览器直连 `c.y.qq.com` 会被 CORS 拦住，且无法携带必需的 `Referer`，因此第三级通过一个腾讯云 EdgeOne 边缘函数代理转发，函数源码在 [edge-functions/qq/index.js](edge-functions/qq/index.js)，与整站同属一个项目：一次部署同时得到静态站点和 `/qq` 接口。

- **路由**：`/qq`，参数 `act=search&w=关键词`、`act=lyric&songmid=xxx`、`act=probe`（自诊断，返回两种签名前缀的上游响应）
- **附带查询工具**：[tools/qq-lookup.html](tools/qq-lookup.html)（部署后为 `https://你的域名/tools/qq-lookup.html`）—— 输入歌名与歌手，返回关联度最高的 5 条结果，含封面、歌词、专辑、发行年份，并可一键复制封面地址 / 歌词 / `music-list.json` 片段；支持 `?name=&artist=` 带参打开、`?api=` 改指其他代理。音乐库左下角「关于」弹窗里也有入口（弹窗另含项目地址与作者博客）
- **匹配策略**：歌名归一化后必须完全相等才采纳（歌手对不上时降级采纳同名结果），实现在 `localEngine.js` 的 `qqPick` / `qqNormName` 里。归一化会剥掉半角/全角括号后缀、把全角冒号转半角、去空白转小写；并按用途要求必需字段（封面 `albummid`、歌词 `songmid`、专辑 `albumname`），缺字段的 AI / 翻唱条目会被跳过，免得把后面真正带专辑的原版挡掉
- **部署**：装好 EdgeOne CLI 后在**仓库根目录**执行 `edgeone makers deploy . -n <项目名> --json`；函数必须放在根目录的 `edge-functions/<名>/index.js` 并导出 `onRequest`（放到子目录里不会被扫描到，构建产物就只有静态文件、没有函数），运行时是 V8（无 Node 内置模块、无 `btoa`/`escape`，`Response.json()` 也不可用）
- **必须绑定自定义域名**：EdgeOne 的默认域名带 3 小时 token 预览保护，播放器发出的跨站 `fetch` 携带不上校验 Cookie，会稳定返回 401；把自己的域名 CNAME 到部署域名后才是可用的程序接口
- **前端地址**：默认 `https://music.lololowe.com/qq`，见 [js/localEngine.js](js/localEngine.js) 的 `QQ_PROXY`；想改指自己的代理，在 `config.js` 里写 `window.qq_proxy = 'https://你的域名/qq'` 即可，并同步把函数里的 CORS 白名单正则 `TRUSTED` 改成你的站点来源

### 部署前必读的两个坑

- **`.edgeone/project.json` 会缓存项目名**：不带 `-n` 时 CLI 沿用它，于是「在哪个目录跑」和「推到哪个项目」这两件事会各自错一半 —— 实际踩过一次：在仓库根目录跑了 `edgeone makers deploy`，整个网站被推进了另一个（代理专用）项目，还把该项目里有函数的部署顶掉了。根目录的 `.edgeone/` 只是构建产物加缓存，删掉无损失。
- **构建不读 `.gitignore`**：它只排除 `.edgeone` / `.env` / `.git` / `.gitignore` 这四项，当前目录下其余文件一律当静态资源上传并公开可访问。不想被发布的目录（比如第三方参考代码）必须挪出仓库目录树，光写 `.gitignore` 挡不住部署。

部署完可以这样自检：`https://你的域名/qq?act=search&w=test` 应返回 JSON；`https://你的域名/qq` 若返回的是页面 HTML 而不是 `unknown act` 的错误 JSON，说明函数没被构建进去（检查目录约定）。未配置代理时第三级会自动失败并跳过，不影响前两级和本地播放。
