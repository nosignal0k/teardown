# Teardown

用图示说明各种对象：系统、技术、工具、概念。每篇都是独立说明，不是官方页面，也不表示获得原作者或厂商的认可。

研究核查、变更纪律、验证和隐私见 [AGENTS.md](AGENTS.md)。

## 架构

站点是静态文件，发布到 GitHub Pages 的 `/teardown/`。没有服务端、账号、CMS、分析或外部托管。

构建器是少量 TypeScript，而不是 Astro，也不是统一的文章模板。目录页由主题元数据生成。每个主题是自包含的 HTML、CSS 和脚本，构建时按目录复制，不进入共享打包。

这样可以用产物字节检查隔离。限度也写在这里：

- 只改一个主题的页面、样式或脚本，不会改写另一个主题目录里的文件，也不会改目录页。
- 改 `topic.json` 会重新生成目录页。`platform.css`、`404.html` 和 `.nojekyll` 属于整站。
- 可选的 `shared/` 会被引用它的主题共用。当前没有共享文件。
- 构建器不编译主题里的 TypeScript 或 Markdown，只复制允许的静态文件。
- 检查器识别字面量 URL，包括 `style` 元素、`style` 属性和内联脚本里的静态引用。它不执行脚本，也看不到拼接出来的地址。
- 发布后页面在同一站点源下。平台不做浏览器沙箱，不能说运行时没有相互影响。
- GitHub Pages 的缓存和整站发布是站点范围的。

### 目录

```
src/          构建、目录页、开发服务器
topics/       已发布主题，当前为空
shared/       可选共享文件，当前没有
tests/        契约、路径和隔离测试
dist/         构建输出，不提交
```

稳定链接：目录是 `/teardown/`，主题是 `/teardown/topics/<slug>/`。

## 主题契约

一个主题一个目录 `topics/<slug>/`。`slug` 只由目录名决定：小写字母、数字、连字符。不要在 `topic.json` 里再写一份。

`topic.json` 只有这些字段：

```json
{
  "title": "标题",
  "summary": "一句摘要",
  "category": "分类",
  "tags": ["标签"]
}
```

`index.html` 是完整页面，版式自由。其中要有返回目录的链接：

```html
<a href="/teardown/" data-teardown-catalog>返回目录</a>
```

- 主题资源用相对路径，并放在该目录内。
- 不要引用其他主题。主题文件中不要出现 `/teardown/topics/`。
- 绝对路径只允许 `/teardown/`，以及已经存在的 `/teardown/shared/...`。
- `https` 链接可以用于引用。样式、脚本和图片不要指向远程地址。
- 允许的文件：`.html` `.css` `.js` `.mjs` `.svg` `.png` `.jpg` `.jpeg` `.webp` `.gif` `.txt` `.json` `.woff2`
- 不使用符号链接和隐藏文件。
- `topic.json` 不会复制到发布目录。
- 目录卡片来自上述元数据。不要手改 `dist/index.html` 来添加主题。

阅读上，图示负责结构和关系，流程和受控动画负责数据、状态与控制如何变化。短标签应能说明目的和整体运作。较长文字只在更适合抽象理由或深层细节时使用，并逐步展开。有过程的动画要能暂停、单步和重放，遵守系统的减少动态设置，并可用键盘操作。中文优先，手机和桌面都要能读。装饰不能冒充说明。

## 命令

需要 Node.js 22。

```bash
npm ci
npm run dev
npm run check
npm test
npm run build
```

`npm run dev` 在 <http://127.0.0.1:4173/teardown/> 预览，路径与 Pages 一致。`npm run build` 写入 `dist/`。

## 发布

`dist/` 就是项目站点的站点根，其中包含 `.nojekyll`。页面里的资源使用 `/teardown/` 前缀。

当前没有开启 GitHub Pages，本仓库也不包含会部署的工作流。要发布时再改仓库设置：Settings → Pages → Build and deployment → GitHub Actions，工作流只上传 `dist/`。站点地址将是 <https://nosignal0k.github.io/teardown/>。不要把输出目录改到别的基路径，除非同时改构建里的 `BASE_PATH`。

## 贡献

- 新主题只增加自己的目录，让检查通过。不要改其他主题，也不要手改生成的目录页。
- 不提交密钥、试验夹具或未准备好的主题。隔离测试用的样例只存在于临时目录。
- 不在此仓库选择许可证。
- 提交身份、私人信息和引用规范见 [AGENTS.md](AGENTS.md)。
