# 校集

面向南京邮电大学通达学院的校园 Agent 原型：生活查询、办事与学习资料问答、同学互助。仓库是公开源码。克隆下来能在本机跑起来的，是你检出的那一版，不是「已经全校上线的最新界面」。

核对日期：2026-11-15（Asia/Shanghai）。产品代码以各分支当时的提交为准，下面的 SHA 会过期，打开链接再看一次头。

## 四个地方，不要混

| | 是什么 | 2026-11-15 核对到的位置 | 登录和首页 |
| --- | --- | --- | --- |
| 正式站 | 若已按 [deploy/render.md](deploy/render.md) 把 **main** 部署出去，跑的是已经合并进 main 的版本。自定义域名当时仍在实名审核，本文不写具体域名，也没有去生产环境探活 | 部署说明在 `deploy/`、`render.yaml`。合并进 main 可能触发自动部署 | 与当时的 main 相同：学号登录弹框，没有海报首页，没有独立登录页 |
| `main` | Git 默认分支，也是本文件所在分支的基线 | [`53e64e93`](https://github.com/liuzhenbang4235-design/campus-agents/commit/53e64e93fb6cfe872b6d3c9db2bffe1003f87e27)（2026-11-10 14:00 +0800） | 学号登录。`node server.cjs` 可以跑 |
| [PR 26](https://github.com/liuzhenbang4235-design/campus-agents/pull/26) | 未合并的产品分支 [`cursor/cinematic-home-menu-84e7`](https://github.com/liuzhenbang4235-design/campus-agents/tree/cursor/cinematic-home-menu-84e7) | 头 [`2532c11`](https://github.com/liuzhenbang4235-design/campus-agents/commit/2532c1127077a3e50ecaec0a21e91b6189165cae)（2026-11-15 22:23 +0800）。同日更早的审计头是 `d717f5b7`，那一笔仍在分支里，但已经不是最新 | 海报首页约 5 秒自动翻页；点画面打开菜单；海报本身不能拖走或点开大图。新账号用登录账号和密码，已有 8 位学号账号仍按学号登录。这些都还没进 main，也还没出现在正式站 |
| 本机 | 你自己检出的目录，加上 `node server.cjs` | 浏览器地址是 http://127.0.0.1:4173 。维护者一台 Mac 上一次同步停在 [`9455785a`](https://github.com/liuzhenbang4235-design/campus-agents/commit/9455785ab87af101f50fb6298ff389daecf54a7d)（2026-11-13）：已有 5 秒首页，独立登录页还没装上 | 跟你检出的提交走。不要用那台 Mac 的旧截图证明新登录已经可用 |

这次只补充文档，不改运行代码，也不把 PR 26 合并进来。审核结束前不要为了让文档生效去合 main。

## 新成员先读

索引在 [docs/onboarding/README.md](docs/onboarding/README.md)。

- 从 `main` 克隆就能跑旧版（学号登录）。
- 要改海报首页或独立登录，从 PR 26 的分支另开功能分支，不要从 `main` 重做一遍，也不要在没有 remote、停在更老提交的本机目录上开干。
- 协作方式见 [CONTRIBUTING.md](CONTRIBUTING.md)：可以 fork 后提 pull request。本文不发邀请，也不改分支保护。

## 启动

仓库没有第三方依赖。`package.json` 只有名字和 `start` 脚本，没有 `dependencies`，也没有 `engines`。不要为了启动去跑 `npm install`。

```bash
node server.cjs
```

然后打开 http://127.0.0.1:4173 。页面来自 `dist/`，直接双击 `dist/index.html` 或仓库根目录的 `index.html` 都不是这套服务。Mac 上的 `打开原型.command` 只是执行 `node server.cjs --open`。

未设置 `HOST`、也不在 Render 上时，进程只听 `127.0.0.1`。端口默认 `4173`，可用环境变量 `PORT` 改。

2026-10-20 的旧迁移说明写过「Node.js 18 或更高版本」。那是旧提示，不是已经测过的最低版本。本文写作时在 Node `v22.23.4` 上跑过测试，见 [docs/onboarding/07-快速启动与测试.md](docs/onboarding/07-快速启动与测试.md)。

## 测试

在仓库根目录：

```bash
node --check server.cjs
node --test tests/*.test.cjs
```

2026-11-15，在本机这份 `main`（`53e64e93`）上，Node `v22.23.4`：`node --test tests/*.test.cjs` 为 142 项通过、0 项失败。同一天在 PR 26 的 `2532c11` 上用同一命令是 152 项通过、0 项失败；多出来的是该分支上的 `tests/homepage.test.cjs` 和 `tests/auth-username.test.cjs`。README 里早先写的「105 项」是 2026-10-28 的旧记录。

这些是仓库里的自动测试。桌面展开登记后的滚动遮挡，以及独立登录页在维护者那台 Mac 上的验收，当时都还没做完，不能写成已经通过。

## 不要提交

`config.local.json`、`data/`（知识库、互助登记、海报和登记图片）、真实学号、真实密码、密钥。示例只看 `config.example.json`。模型密钥放在本机未跟踪的配置或托管环境的环境变量里。
