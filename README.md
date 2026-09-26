# 词间 · Word Trails

适合 iPhone 的英文阅读应用第一版。通过百词斩截图或粘贴文本导入词表，从公开英文经典作品中匹配真实选段，再用原句填空和间隔复习巩固。**纯静态网站，可部署到 GitHub Pages，发布后无需电脑运行，也不需要后台服务器或 API Key。**

## GitHub Pages 部署

1. 在自己的 GitHub 账号下新建仓库，例如 `word-trails`（公开仓库可使用免费 Pages）。
2. 将本目录内容上传到仓库根目录，包含 `.github/workflows/pages.yml`、`public/`、`data/` 和 `test/`。主分支使用 `main`。
3. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
4. 在 **Actions → Deploy Word Trails to GitHub Pages → Run workflow** 运行部署。以后推送到 `main` 会自动检查并更新。
5. 部署成功后地址通常为 `https://你的用户名.github.io/word-trails/`，以 Pages 页面显示的链接为准。
6. 在 iPhone Safari 打开正式网址，选择 **分享 → 添加到主屏幕**。

部署内容仅为 `public/`。截图、词表和学习进度不上传到 GitHub；保存在访问者自己的浏览器。当前目录之外的个人图片和文件不属于项目，不应上传。代码中的 7 个词为演示词表。

原文库约 2 MB，OCR 组件及英文模型约 13 MB，识别首次启用时下载。浏览器会缓存已经访问的本地资源；离线能力取决于这些资源是否已下载及浏览器是否保留缓存。更换设备不会自动同步进度。

## 启动

需要 Node.js 20 或以上，无需 npm install。

```powershell
cd 'C:\Users\alici\Documents\ChatGPT\have fun\word-trails'
node server.mjs
```

打开 http://localhost:4317 。这只是本地预览；GitHub Pages 上不运行此服务器。

在 iPhone 上试用：电脑与手机连接同一 Wi-Fi，以局域网模式运行服务：

```powershell
$env:HOST = '0.0.0.0'
node server.mjs
```

用 Safari 打开终端打印的局域网网址。这种临时预览需要电脑保持运行；正式 GitHub Pages 网址独立运行。没有修改防火墙设置。

模拟 GitHub Pages 的仓库子目录（只提供静态文件，不包含任何 API）：

```powershell
node scripts/preview-static.mjs
```

打开 http://localhost:4320/word-trails/ 。

## 已实现

- 多张截图本地 OCR；组件和英文模型随项目保存，无需把截图发到第三方。竖屏截图采用百词斩左侧词列裁剪；模糊、残缺的识别结果必须人工核对。
- 文本输入、去重、删除、替换/合并词表，最多 100 个词；导入用途由用户指定。截图日期不自动视为新学日期。
- 在浏览器内对随网站提供的原文库进行目标词匹配、段落长度/主题筛选、覆盖率排序、换一组选段。只推荐真实包含匹配词的段落。
- 7 个示例词含手工列举的常见词形；其他输入词按完整单词匹配，暂未做完整词形还原。
- 原文阅读、目标词高亮、7 个示例词的常用中文释义及外部词典链接。释义不是自动语境翻译。
- 原句填空，保留原句的屈折词形作为答案；1、3、7、14、30 天间隔复习，错题次日再练。
- 浏览器 localStorage 保存词表、偏好、阅读和答题进度。无帐号、跨设备同步或通知。
- 移动端布局、Web App manifest、Service Worker 缓存已访问的页面、原文库与 OCR 资源。HTTPS 或 localhost 下启用；离线时仅能使用已完整缓存的资源。

## 管理词库

进入「我的词表 → 管理已输入的单词」，可以搜索、按学习状态筛选、修改拼写和移除单词，并撤销上次修改。点击「标为已掌握」后，该词保留在词库中，但不再作为阅读推荐、高亮、填空和到期复习的目标；可点击「恢复学习」继续使用原有复习进度。重复导入仍保留掌握状态。全部掌握后停止推荐，提示添加新词或恢复学习。为其他词选出的原文中仍可能自然出现已掌握词。

修改拼写会移除旧拼写的练习，避免答案错配；移除单词也会移除其练习。词库和掌握状态仅保存在当前设备的浏览器，不跨设备同步，请勿清除网站数据。

## 本机电子书与阅读记录

阅读状态默认为「未读选段」。点击「读完了」记录已读并保存在当前浏览器，关闭阅读后更新推荐；同书重叠段落也会被排除，其他段落仍可推荐。原有阅读记录自动沿用。「已读选段 · 主动重读」可重新阅读，重读不增加新阅读数量。当前条件全部读完时明确提示，不自动回填已读内容。单词复习继续使用原句。记录不跨设备同步，清除网站数据会丢失记录。

导入页支持 EPUB、TXT。EPUB 在浏览器内解压并按阅读顺序提取章节，内容存入当前设备 IndexedDB，不上传 GitHub；可在导入页删除本机书籍。GitHub Pages 只包含解析程序和开源 JSZip 组件，不包含用户电子书。普通受版权保护的期刊应通过本机导入使用，不加入公开原文库。

## 内容来源与当前边界

目前为 **3 部英文经典作品的本地原文检索**，不是全网新闻搜索。作品为 Arthur Conan Doyle《The Adventures of Sherlock Holmes》、Nathaniel Hawthorne《The Scarlet Letter》和 Bram Stoker《Dracula》。原文来自 Project Gutenberg，下载通过 GITenberg 的 jsDelivr 镜像；每条选段保留原作与镜像链接。完整下载文件（含 Gutenberg 许可说明）保存在 `data/originals/`。

段落仅合并排版换行，未用 AI 改写。未匹配词给出明确标记与外部搜索链接，不将未经核实的搜索结果计作阅读推荐。长度标签不是 CEFR 难度评估。后续扩展可加入新闻/科普内容源、授权全文抓取、语言难度评分、通用词形还原和语境词典服务。

书籍在美国属于公版作品，其他司法辖区需核对当地版权期限。Tesseract.js 与 core 为 Apache-2.0，许可副本位于 `public/vendor/`；英文识别模型来源见 `scripts/prepare-ocr.mjs`。

## 检查与数据更新

```powershell
node --test
node scripts/prepare-data.mjs
node scripts/prepare-ocr.mjs
```

已准备数据与 OCR 资源。更新脚本需要联网；更新原文时同时写入 `data/books.json` 和 `public/library.json`。静态前端不调用任何后台 API。原来的 `server.mjs` 仅供本地预览和兼容，不属于 Pages 部署内容。
