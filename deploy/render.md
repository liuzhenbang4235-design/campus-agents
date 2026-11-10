# Render 部署（临时共享密码）

核对对象：零依赖 Node 应用 `node server.cjs`。这是买到自定义域名、改用 Cloudflare Access 之前的过渡，不是正式登录。

演示身份切换（`POST /api/session`）仍然没有真实权限。共享密码只挡住「谁都能打开页面」，挡不住已经知道密码的人切换管理员。上线前把密码只发给需要试用的人。域名和 Cloudflare Access 就绪后，清空 `ACCESS_USER` 和 `ACCESS_PASSWORD` 再部署，避免两道门叠在一起，并把 `CAMPUS_ORIGINS` 改成 `https://你的域名`。

TLS 在 Render 边缘终止，进程只收 HTTP。不要在应用里再开 HTTPS。

## 监听地址

| 条件 | 绑定 |
| --- | --- |
| 设置了 `HOST` | 用 `HOST`（Blueprint 写 `0.0.0.0`） |
| 没设 `HOST`，且 `RENDER=true` | `0.0.0.0` |
| 其他情况（本机预览、systemd） | `127.0.0.1` |

只设置 `PORT` **不会**改成 `0.0.0.0`。本机和 `deploy/campus-agent.service` 继续只监听回环。自建 nginx/Caddy 不要设 `HOST=0.0.0.0`。

Render 会注入 `PORT`（常见默认 10000）。Blueprint 不写死 `PORT`。

## 操作者要填的环境变量

`render.yaml` 里这三项是 `sync: false`，只在第一次用 Blueprint 创建时向 Dashboard 要值，之后同步不会覆盖。不要把值写进仓库。

| 变量 | 填什么 |
| --- | --- |
| `CAMPUS_ORIGINS` | 完整 origin：`https://<服务名>.onrender.com`。只要 scheme + 主机，不要路径、尾斜杠、查询串。以后有自定义域名就改成那个 `https://` 地址，多个用英文逗号隔开。 |
| `ACCESS_USER` | 共享账号 |
| `ACCESS_PASSWORD` | 共享密码。两者都非空才启用门；只填一个时门保持关闭，并在日志里警告。 |

另外 Blueprint 已经用字面量写好这些非机密项。同步 Blueprint 时会把它们写成下表的值（和上面的 `sync: false` 不同，之后的同步也会改已有值）。

| 变量 | 值 | 说明 |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | 见上文「监听地址」 |
| `SKIP_INSTALL_DEPS` | `true` | 没有 npm 依赖，跳过 install |
| `PUBLIC_MODE` | `1` | 正式共享站点关闭演示身份切换，见下 |

`PORT` 由 Render 注入，不用自己设。

`PUBLIC_MODE` 去掉首尾空白、不区分大小写后，等于 `1`、`true`、`yes`、`on` 之一，就打开公开模式：`demoIdentitiesEnabled()` 为 false，页面没有演示身份下拉，`POST /api/session` 被拒绝，访问固定在同学端。未设置，或设成 `0`、`false`、`no`、`off` 以及其他值时，这个环境变量本身不关演示身份。正式共享站点应保持 `1`。Mac 本机预览（http://127.0.0.1:4173）不要设置 `PUBLIC_MODE`，或设为 `0`，演示身份仍可切换。已经在 Dashboard 里写过同名变量的服务仍然兼容，进程读的就是这个环境变量。某个私有预览可以在 Dashboard 改成 `0`；下次同步这份 Blueprint 会再写成 `1`，所以正式站点不会停在可切换演示身份。不要把 `publicMode` 写进仓库里的 `config.local.json`。

应用还会接受平台注入的 `RENDER_EXTERNAL_URL`（同样是 `https://<服务名>.onrender.com`）。因此健康检查用的 Host（无自定义域名时就是 `onrender.com` 主机名）在你还没把同一地址写进 `CAMPUS_ORIGINS` 时也能通过。浏览器要稳定使用，仍请把 `CAMPUS_ORIGINS` 设成地址栏里的 origin。一旦验证了自定义域名，Render 的 HTTP 健康检查会改用该域名做 Host，这时 `CAMPUS_ORIGINS` 必须包含它，否则探针收到 403，部署失败。

## 共享密码的范围

`ACCESS_USER` 和 `ACCESS_PASSWORD` 都设置后，除 `GET /api/health` 以外的请求都要 HTTP Basic Auth。比对是定长、timing-safe 的。密码里可以有冒号（只按第一个冒号拆用户名和密码）。

- 未带或错误的 `Authorization`：401，并带 `WWW-Authenticate: Basic realm="Campus Agent"`
- `GET /api/health`：不要求密码，供 Render 探针。仍走 Host 白名单
- 其他方法打到 `/api/health`：不豁免

健康检查路径在 Blueprint 里是 `/api/health`。探针要在 5 秒内拿到 2xx。

## 频率限制

注册、登录、互助提问和举报按调用方分桶。顺序是：已登录学号，Cloudflare Access 身份（`Cf-Access-Authenticated-User-Email`，否则是 `Cf-Access-Jwt-Assertion` 里能直接解出的 email 或 sub），然后是这次请求已经带上的 `campus_session`。这几项都没有时，才用来源地址：直连对端是回环或内网，或者 `RENDER=true`，才取 `X-Forwarded-For` / `X-Real-IP` 里第一个公网地址。计数在进程内存里。免费实例是单进程；多实例时要换成共享存储，否则各进程各计各的。

## 数据

Free 实例不能挂持久磁盘，本 Blueprint 也不挂。磁盘只在付费实例上可用，而且会变成单实例、没有零停机部署。

`data/` 和 `config.local.json` 不在 Git 里。云上第一次启动用仓库里的 `lib/seed.json`，不是你电脑上的完整知识库。运行中写入的互助数据、上传，以及写进 `config.local.json` 的内容，会在重新部署、重启或实例替换时丢失。云端模型 Key 用下一节的环境变量，免费实例重启后仍然在。需要完整资料时再单独同步，不要把 `config.local.json`、`data/` 或 `imports/` 提交上来。

## 云端模型

免费实例没有持久磁盘。只把 Key 写进 `config.local.json` 的话，休眠或重启后文件没了，管理页还得再贴一次。进程每次解析配置时，用下面的环境变量覆盖内存里的服务商设置（盖在 `config.local.json` 上面；文件不存在也可以）。环境变量里的 Key 优先于磁盘上过期或空的 Key。

在 Dashboard → 该 Web Service → Environment 填写。`render.yaml` 里这几项是 `sync: false`：第一次用 Blueprint 创建时会问，之后只改 Dashboard，同步不会覆盖。改完会触发重新部署，新进程直接读到这些值。

```
CAMPUS_AI_ENABLED=true
CAMPUS_AI_PROVIDER=doubao
CAMPUS_AI_API_KEY=在 Dashboard 填写，不要写入仓库
CAMPUS_AI_MODEL=控制台示例里的 model
CAMPUS_AI_DAILY_LIMIT=
```

| 变量 | 说明 |
| --- | --- |
| `CAMPUS_AI_ENABLED` | `true` 才启用云端模型。也接受 `1`、`yes`、`on`（大小写不限）。`false`、`0`、`no`、`off` 关闭。 |
| `CAMPUS_AI_PROVIDER` | `doubao`、`deepseek` 或 `qwen` |
| `CAMPUS_AI_API_KEY` | 上面这家服务商的 API Key |
| `CAMPUS_AI_MODEL` | 模型 ID。填控制台调用示例里的 model，不要填 `apikey-` 开头的名称 |
| `CAMPUS_AI_DAILY_LIMIT` | 可选。正整数。不填、留空或不是正整数时，沿用原来的每日 50 次 |

密钥只放在这些环境变量里，或开发者自己电脑上未跟踪的 `config.local.json`。不要把真实 Key、`config.local.json`、`data/`、`imports/` 提交到 Git，也不要写进测试。管理接口只返回 `hasKey` 布尔值，响应和日志都不包含原始 Key。保存配置也不会把环境变量里的 Key 写回磁盘文件。

## Free 计划

`plan: free` 会在一段时间没有请求后休眠，下一次访问要冷启动。这是刻意的，不为了「一直开着」去改付费计划。区域默认 Oregon；创建后不能改。若要新加坡等更近的区域，在第一次同步前自己写上 `region`。

## 创建后自检

把 `<服务名>` 换成 Dashboard 里的 onrender 主机名。

```bash
curl -fsS "https://<服务名>.onrender.com/api/health"
# => {"version":2,"app":"campus-agent"}

curl -sS -o /dev/null -w '%{http_code}\n' "https://<服务名>.onrender.com/"
# => 401

curl -fsS -u '<ACCESS_USER>:<ACCESS_PASSWORD>' -o /dev/null -w '%{http_code}\n' \
  "https://<服务名>.onrender.com/"
# => 200
```

浏览器打开首页时应弹出基本认证框。通过之后，页面里的接口请求会带上同一组凭据。

## 本目录其他文件

自建 TLS 反向代理、systemd 和备份仍以 [README.md](README.md) 为准。那条路径默认监听 `127.0.0.1`，与这里的 `HOST=0.0.0.0` 不要混用。
