# Refrain

![Refrain 播放界面](/img/screenshot.png)

预览地址：https://music.lololowe.com

一个基于 [APlayer](https://github.com/DIYgod/APlayer) 、 [MetingJS](https://github.com/metowolf/MetingJS)和 [zhheo/HeoMusic](https://github.com/zhheo/HeoMusic) 的静态音乐播放器，重新设计了播放界面与本地音乐库。

- **纯静态部署**：无需数据库与服务端，丢到 Nginx / GitHub Pages / EdgeOne 就能跑；在线解析走公共 Meting 接口，本地曲库只是一个 JSON 文件。
- **自动识别**：本地歌曲最少只需填 `url` / `artist` / `name`，封面、歌词、专辑与发行年份会自动补全（优先提取音频内嵌标签，缺失时经 QQ 音乐接口识别）。
- **更美观的播放器**：封面跟随鼠标 3D 倾斜、封面下方倒影、高斯模糊的歌词遮罩（悬停时变清晰）、以当前封面模糊取色作环境光背景、胶囊轮廓进度条与玻璃拟态面板；另有带歌曲 / 专辑 / 艺术家三个视图的音乐库，配套键盘快捷键。
- **两种模式**：在线歌单（URL 参数或 `config.js`）与本地音乐库（`music-list.json`），互不干扰。

## 基本操作

`Space空格键`：暂停/播放音乐

`上/下方向键`：增加/减少音量

`左/右方向键`：上一曲/下一曲

`ESC键`：在播放页与音乐库之间切换（仅本地音乐库模式支持）

## 在线模式

### 使用URL参数

Refrain 支持 URL 参数 `/?id=` + id + `&server=` + server（部署到你自己的域名后使用）

例如：

**示例歌单:** https://music.lololowe.com/?id=652135520&server=netease

在线音乐模式歌单 ID 的解析由 [js/Meting.js](js/Meting.js) 内置的默认Meting API接口完成： `https://music.zhheo.com/meting-api/`。

此外，在音乐库左下角的「在线」按钮（位于「关于」上方）中也可以直接填写 ID、选择服务商与类型，确认后会在**新标签页**打开对应在线歌单，当前页面（本地曲库 / 音乐库）保持不动。弹窗中的选项与 URL 参数会自动拼接，效果与手动拼 `?id=&server=&type=` 相同

### config.js

将`config.js.demo`文件重命名为`config.js`，并修改其中的配置，直接访问首页`index.html`即可，无需URL参数

**ID**：

播放列表的id，可以从音乐歌单分享的链接中获取，例如`https://y.qq.com/n/ryqq/playlist/9192285866`中，id为`9192285866`

**Server**：

播放列表的服务商。默认接口可用：`netease`（网易云音乐）、`tencent`（腾讯）

**Type（可选）**：

播放列表的类型。默认接口（`music.zhheo.com/meting-api`）支持 `playlist`（歌单，默认）与 `song`（单曲）

## 本地音乐模式

### 修改config.js

本地音乐模式只需配置`config.js`的这一项：让 `remoteMusic` 指向一个 JSON 文件（仓库内的相对路径或外链均可）。播放器启动时读取它，读到非空歌曲数组就进入本地音乐模式（带音乐库），否则走在线模式。

```js
var remoteMusic = './music-list.json';
```

维护曲库就是编辑这个 JSON 文件（增删条目即可，不需要动 `config.js` 或其他代码）；字段详细说明见下文「本地音乐库数据文件」一节。

> 代码里还有一个同名的 `localMusic` 变量，它是上述 JSON 读取后的**内部数据容器与模式开关**，不需要也不能在 `config.js` 里配置。

本地音乐模式（音乐库的歌曲 / 专辑 / 艺术家三个板块）依赖下面两个 JSON 数据文件。两者都已在 `.gitignore` 中，**不会随仓库发布**，需要自行创建。

### music-list.json

扁平的歌曲数组，通过 `config.js` 的 `remoteMusic` 指向（读取时会自动附加时间戳，避免浏览器缓存旧文件）：

```json
[
  {
      "name": "简单最浪漫",
      "artist": "方大同",
      "url": "/music/简单最浪漫.mp3",
      "cover": "/music/简单最浪漫.png",
      "lrc": "/music/简单最浪漫.lrc",
      "album": "2007-未来"
  },
  {
      "name": "普通朋友",
      "artist": "陶喆",
      "url": "https://pic.lololowe.com/music/%E9%99%B6%E5%96%86%E6%97%A0%E6%8D%9F%E5%90%88%E9%9B%86/1999-I'm%20OK/%E9%99%B6%E5%96%86%20-%20%E6%99%AE%E9%80%9A%E6%9C%8B%E5%8F%8B.flac",
      "cover": "https://pic.lololowe.com/music/%E9%99%B6%E5%96%86%E6%97%A0%E6%8D%9F%E5%90%88%E9%9B%86/1999-I'm%20OK/%E9%99%B6%E5%96%86%20-%20Amen%20(Vocals%20Featuring%20Tension).jpg",
      "lrc": "https://pic.lololowe.com/music/%E9%99%B6%E5%96%86%E6%97%A0%E6%8D%9F%E5%90%88%E9%9B%86/1999-I'm%20OK/%E9%99%B6%E5%96%86%20-%20%E6%99%AE%E9%80%9A%E6%9C%8B%E5%8F%8B.lrc",
      "album": "1999-I'm OK"
  },
]
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `name` | 是 | 歌名 |
| `artist` | 是 | 歌手；多位歌手用 `、` `，` `,` 分隔，音乐库会拆分成多个艺术家 |
| `url` | 是 | 音频地址，本地相对路径或外链均可 |
| `cover` | 否 | 封面图地址；留空则尝试提取音频内嵌封面或通过QQ音乐接口自动识别封面 |
| `lrc` | 否 | 歌词文件地址；留空则尝试提取音频内嵌歌词或通过QQ音乐接口自动识别歌词 |
| `album` | 否 | 专辑 key；留空则由QQ音乐接口自动识别，识别不到才退回 `url` 的父文件夹名，再退回「未知专辑」 |

专辑 key 建议写成 `年份-专辑名`（如 `1997-陶喆同名专辑`）：音乐库会把开头的四位年份解析出来单独显示，列表里只展示去掉年份后的专辑名。

所以新增一首歌最少只要填 `url` / `artist` / `name` 三项：歌词、封面、专辑、年份都会在打开音乐库时自动补全并按专辑归类（前提是第一级没填、且接口代理可用）。

### music-meta.json（可选）

为音乐库补充艺术家头像与专辑封面；文件缺失或请求失败时静默忽略，不影响播放：

```json
{
  "artists": {
    "陶喆": { "pic": "https://y.qq.com/music/photo_new/T001R300x300M000002cK0F12szD9T_8.jpg?max_age=2592000" }
  },
  "albums": {
    "1997-陶喆同名专辑": { "pic": "https://y.gtimg.cn/music/photo_new/T002R800x800M000003ROVwj4PqLPa.jpg" }
  }
}
```

- `albums` 的 key 必须与 `music-list.json` 里的 `album` 字段（或缺省推导出的父文件夹名）**完全一致**
- 专辑封面回退链：`music-meta.json` 的 `pic` → 自动取该专辑第一首歌内嵌的 `cover` → 留空
- 艺术家头像回退链：`music-meta.json` 的 `pic` → 其第一张专辑的封面 → 留空

### 自动识别接口（歌词 / 封面 / 专辑与发行年份）

这是本地音乐“自动补全”所依赖的接口：当一首歌的 `cover` / `lrc` / `album` 留空时，播放器会拿 `name` + `artist` 去 **QQ 音乐** 搜索，用返回结果自动识别并补上**封面、歌词、专辑名与发行年份**（即上表所说的“第三级”兑底：音频内嵌标签 → 手动填写 → 本接口）。它代理的上游是 `c.y.qq.com`，浏览器直连会被 CORS 拦住、且无法携带必需的 `Referer`，因此通过一个腾讯云 EdgeOne 边缘函数代理转发，函数源码在 [edge-functions/qq/index.js](edge-functions/qq/index.js)，与整站同属一个项目：一次部署同时得到静态站点和 `/qq` 接口。

- **路由**：`/qq`，参数 `act=search&w=关键词`、`act=lyric&songmid=xxx`、`act=probe`（自诊断，返回两种签名前缀的上游响应）
- **附带查询工具**：[tools/qq-lookup.html](tools/qq-lookup.html)（部署后为 `https://你的域名/tools/qq-lookup.html`）—— 输入歌名与歌手，返回关联度最高的 5 条结果，含封面、歌词、专辑、发行年份，并可一键复制封面地址 / 歌词 / `music-list.json` 片段；支持 `?name=&artist=` 带参打开、`?api=` 改指其他代理。音乐库左下角「关于」弹窗里也有入口（弹窗另含项目地址与作者博客）
- **匹配策略**：歌名归一化后必须完全相等才采纳（歌手对不上时降级采纳同名结果），实现在 `localEngine.js` 的 `qqPick` / `qqNormName` 里。归一化会剥掉半角/全角括号后缀、把全角冒号转半角、去空白转小写；并按用途要求必需字段（封面 `albummid`、歌词 `songmid`、专辑 `albumname`），缺字段的 AI / 翻唱条目会被跳过，免得把后面真正带专辑的原版挡掉
- **部署**：装好 EdgeOne CLI 后在**仓库根目录**执行 `edgeone makers deploy . -n <项目名> --json`；函数必须放在根目录的 `edge-functions/<名>/index.js` 并导出 `onRequest`（放到子目录里不会被扫描到，构建产物就只有静态文件、没有函数），运行时是 V8（无 Node 内置模块、无 `btoa`/`escape`，`Response.json()` 也不可用）
- **必须绑定自定义域名**：EdgeOne 的默认域名带 3 小时 token 预览保护，播放器发出的跨站 `fetch` 携带不上校验 Cookie，会稳定返回 401；把自己的域名 CNAME 到部署域名后才是可用的程序接口
- **前端地址**：默认 `https://music.lololowe.com/qq`，见 [js/localEngine.js](js/localEngine.js) 的 `QQ_PROXY`；想改指自己的代理，在 `config.js` 里写 `window.qq_proxy = 'https://你的域名/qq'` 即可，并同步把函数里的 CORS 白名单正则 `TRUSTED` 改成你的站点来源。部署完可以这样自检：`https://你的域名/qq?act=search&w=test` 应返回 JSON；`https://你的域名/qq` 若返回的是页面 HTML 而不是 `unknown act` 的错误 JSON，说明函数没被构建进去（检查目录约定）。未配置代理时第三级会自动失败并跳过，不影响前两级和本地播放。
