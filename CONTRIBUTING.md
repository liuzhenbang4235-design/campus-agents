# 参与修改

公开仓：[liuzhenbang4235-design/campus-agents](https://github.com/liuzhenbang4235-design/campus-agents)。可以 fork 之后提 pull request。维护者审核前不要合并。合并进 `main` 可能触发正式站自动部署，所以产品改动和文档改动都等审核。

## 从哪条分支开

- 只改文档，或只改已经在 `main` 上的行为：从最新的 `main` 开分支。
- 改海报首页、菜单或独立登录：从 [PR 26](https://github.com/liuzhenbang4235-design/campus-agents/pull/26) 的分支 `cursor/cinematic-home-menu-84e7` 再开一条功能分支。2026-11-15 22:23（+0800）的头是 `2532c11`，之后以 PR 页面上的 head 为准，不要把更早的 `d717f5b7` 当成永远最新。
- 不要把 PR 26 整分支合并进 `main` 来「顺便」带上文档。

## 提交前

仓库没有 npm 依赖，不需要 `npm install`。

```bash
node --check server.cjs
node --test tests/*.test.cjs
```

说明你跑的是 `main` 还是 PR 26 的哪一个提交。Node 版本写进说明。旧迁移材料里的「Node.js 18+」不能写成已经测过的支持范围。

不要提交 `config.local.json`、`data/`、真实学号或密码、密钥、用户海报、互助登记数据、实名材料。登录会话在进程内存里，重启 `node server.cjs` 后需要重新登录；「忘记密码」不能自助重置。这两点保持现状，不要在未讨论的改动里做成新功能。

本仓库目前没有 LICENSE，也没有自动 CI。添加许可证或工作流需要单独决定，不要夹在功能或文档改动里。
