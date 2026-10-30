# 校集 Campus Agent 部署指南（TLS 反向代理）

> 核对日期：2026-10-27 · 适用：零依赖 Node.js 18+ 版本
> 本目录只放部署示例，不改应用代码。示例域名 `campus.example.com`、Linux 目录 `/opt/campus-agent`、macOS 目录 `/Users/Shared/campus-agent`，请全局替换成你的实际值。

---

## ⚠️ 先读：当前版本不能直接暴露公网

**演示身份切换没有真实认证。** `POST /api/session` 可以在 `student` / `team` / `admin` 之间任意切换，无密码、无会话绑定。任何能打开页面的人都可以：

- 切换成管理员：审核、驳回、下架、重新上架资料，重置演示数据；
- 修改模型/地图配置（API Key 不会回显，但可以被替换）、消耗每日模型额度；
- 以学生身份注册演示账号、发布互助信息、给他人发私信。

因此：**只允许内网访问，或放在 SSO / VPN / 零信任网关之后。** 在接入真实认证与权限之前，不要做公网端口映射、不要挂公网域名做“先上线再说”。本指南余下内容默认你已接受“仅内网 / 受控访问”的前提。

---

## 1. 架构

```
浏览器 ──HTTPS 443──▶ nginx / Caddy ──HTTP 127.0.0.1:4173──▶ node server.cjs
                        （TLS 终止）        仅回环，不对外
```

- `server.cjs` 固定监听 `127.0.0.1`，**不要改成 `0.0.0.0`**，否则绕过代理直接暴露明文端口。
- 应用对每个请求做 Host 白名单校验：默认只接受 `127.0.0.1:4173`、`localhost:4173`。
- 启动时设置 `CAMPUS_ORIGINS=https://<域名>` 后：该 origin 的 Host / Origin 被接受，会话 Cookie 追加 `Secure`。
- 代理必须**原样转发浏览器 Host**（nginx `$host`、Caddy `{host}`），并设置 `X-Forwarded-Proto: https`。代理若把 Host 改成 `127.0.0.1:4173`，应用会返回 403。
- 单域名同源部署：页面与 `/api/*` 必须同一 origin。CSP 是 `connect-src 'self'`，Cookie 是 `SameSite=Strict`，拆子域会导致接口被 CSP 拦截、Cookie 不发送。

---

## 2. 前置检查

1. **Node 18+**：`node -v`（本项目实测 v24）。
2. **代码包含 `CAMPUS_ORIGINS` 支持**：`grep -n CAMPUS_ORIGINS lib/backend.cjs`。本工作区（2026-10-27）已包含；若部署副本没有输出，先合并该改动，否则公网 Host 一律 403。
3. **DNS**：`campus.example.com` 的 A/AAAA 记录指向服务器公网地址。
4. **端口**：80、443 对客户端可达（HTTP→HTTPS 跳转、证书签发/续期需要）。
5. **证书**：Caddy 自动申请；nginx 用 certbot 或已有证书。
6. **专用用户**：`campus-agent`，只拥有项目目录，不用 root 跑 Node。

---

## 3. Linux 目录与权限

```bash
sudo useradd --system --home /opt/campus-agent --shell /usr/sbin/nologin campus-agent
sudo install -d -o campus-agent -g campus-agent -m 0750 /opt/campus-agent
sudo git clone <仓库地址> /opt/campus-agent
sudo chown -R campus-agent:campus-agent /opt/campus-agent
sudo install -d -o campus-agent -g campus-agent -m 0700 /opt/campus-agent/data
sudo chmod 600 /opt/campus-agent/config.local.json   # 若文件已存在
```

- `config.local.json` 含模型 API Key，权限必须是 `0600`、属主为服务用户。
- 首次配置 Key：启动后在本机页面用管理员身份填写，或从安全介质复制；**不要写进命令行、脚本、Git、工单**（shell history 也会留痕）。
- `data/` 是学生互助数据（可能含联系方式），设为 `0700`。
- `data/` 与 `config.local.json` 都在 `.gitignore` 里；升级章节会强调不要用 `git clean -xdf`。

---

## 4. 启动与自检

前台试运行（确认配置无误后再交给 systemd / launchd）：

```bash
cd /opt/campus-agent
CAMPUS_ORIGINS=https://campus.example.com PORT=4173 node server.cjs
```

正常输出：`Campus Agent v2 ready: http://127.0.0.1:4173`。

```bash
# 直连健康检查（Host=127.0.0.1，走本机白名单）
curl -fsS http://127.0.0.1:4173/api/health
# => {"version":2,"app":"campus-agent"}

# 经代理的健康检查（验证 Host 透传与证书）
curl -fsS https://campus.example.com/api/health

# 反向验证 Host 白名单：伪造 Host 应为 403
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H 'Host: evil.example.com' http://127.0.0.1:4173/api/health
```

`CAMPUS_ORIGINS` 规则（按当前实现）：

- 必须是完整 origin：`https://campus.example.com`。建议只写 scheme + host（+ 非默认端口），不要带尾斜杠、路径、查询串、账号密码或通配符。当前实现会用 `URL.origin` 规范化（尾斜杠/路径会被丢弃，查询串/账号密码会直接拒绝），但不要依赖这种容错。
- 多个域名用英文逗号分隔：`https://campus.example.com,https://campus.internal.example.com`。
- 非默认端口必须写进 origin（`https://campus.example.com:8443`）；此时反向代理要用 `$http_host` 转发带端口的 Host，否则 403。**建议只用 443。**
- 不要混用 `http://` 与 `https://`：只要列表里有 https，所有会话 Cookie 都会加 `Secure`，http 入口会表现为“登录状态一直丢失”。

`/api/health` 不需要登录、不写数据，但同样经过 Host 校验，适合做代理层与外部探活。

---

## 5. systemd（Linux）

```bash
sudo cp deploy/campus-agent.service /etc/systemd/system/campus-agent.service
sudoedit /etc/systemd/system/campus-agent.service   # 改 User/WorkingDirectory/CAMPUS_ORIGINS
sudo systemctl daemon-reload
sudo systemctl enable --now campus-agent
systemctl status campus-agent
journalctl -u campus-agent -f
```

`deploy/campus-agent.service` 的关键点：

- `User=campus-agent`、`WorkingDirectory=/opt/campus-agent`、`ExecStart=/usr/bin/env node server.cjs`。
- `Environment=PORT=4173`、`Environment=CAMPUS_ORIGINS=https://campus.example.com`。
- 可选：`Environment=BOARD_REVIEW=1` 开启互助登记发布前审核（默认关闭，登记即时生效；审核入口在「审核管理」）。
- 内容安全检查默认开启：本地词表 + 云端模型语义判断；`BOARD_BLOCK_KEYWORDS` 追加词表，`BOARD_MODERATION=0` 关闭。
- `Restart=on-failure`、`RestartSec=5`，崩溃自动拉起；手动 `systemctl stop` 不会被拉起。
- `ProtectSystem=strict` + `ReadWritePaths=/opt/campus-agent`：整个文件系统只读，仅项目目录可写。之所以放开整个项目目录，是因为配置保存采用 `config.local.json.tmp` 写入后 `rename` 的原子替换，需要对**项目根目录**有写权限；只放开 `data/` 会导致保存模型配置失败。
- `ProtectHome=yes`：若你把项目放在 `/home` 下，服务会读不到文件；请改到 `/opt`、`/srv`，或把 `ProtectHome` 改为 `read-only`。
- `SystemCallFilter=@system-service` 等加固若导致启动失败，先看 `journalctl -u campus-agent`，再逐项放宽；不要为了“能跑”直接清空全部加固。
- `ExecStart` 用 `/usr/bin/env node`，要求 node 在 systemd 的 PATH 中。用 nvm / n 安装的 Node 请改成绝对路径（如 `/usr/local/bin/node`）。
- 日志走 journald（`StandardOutput=journal`），不额外写文件，避免权限与轮转问题。journald 自身轮转由 `/etc/systemd/journald.conf` 的 `SystemMaxUse` 控制。

---

## 6. macOS launchd

```bash
mkdir -p /Users/Shared/campus-agent/logs
cp deploy/com.campusagent.preview.plist ~/Library/LaunchAgents/com.campusagent.preview.plist
# 编辑 plist：替换 /Users/Shared/campus-agent 与域名
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.campusagent.preview.plist
launchctl kickstart -k gui/$(id -u)/com.campusagent.preview
tail -f /Users/Shared/campus-agent/logs/preview.out.log
```

- 卸载 / 停止：`launchctl bootout gui/$(id -u)/com.campusagent.preview`。
- `launchd` **不会创建日志父目录**，`logs/` 必须先 `mkdir -p`，否则任务起不来。
- 这是**用户级**代理：登录后运行，注销即停止；不是系统守护进程。服务器场景请用 Linux systemd。
- 默认 `ProgramArguments` 是 `/usr/bin/env node server.cjs`，`EnvironmentVariables.PATH` 已包含 Homebrew 路径（`/opt/homebrew/bin`）。更稳妥的做法是把第二个参数改成 Node 绝对路径（`which node` 的结果）。
- launchd 日志是普通文件，会一直增长；macOS 用 `newsyslog`（见 §10），不要套用 Linux 的 logrotate。

---

## 7. 反向代理

### 7.1 nginx

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/conf.d/campus-agent.conf
sudoedit /etc/nginx/conf.d/campus-agent.conf   # 改域名、证书路径
sudo nginx -t && sudo systemctl reload nginx
```

- 证书示例路径为 Let's Encrypt：`/etc/letsencrypt/live/campus.example.com/{fullchain,privkey}.pem`。
- 签发：先 `sudo mkdir -p /var/www/certbot`，再 `sudo certbot certonly --webroot -w /var/www/certbot -d campus.example.com`；续期后 `systemctl reload nginx`（certbot 包通常自带 deploy hook）。
- `listen 443 ssl http2;` 在 nginx ≥ 1.25.1 会有弃用警告，可改为 `listen 443 ssl;` + `http2 on;`。
- `client_max_body_size 128k`：应用自身把 JSON 上限卡在 100000 字节；设 128k 让 100k–128k 的请求由应用返回结构化 413，而不是 nginx 的 HTML 错误页。上传只保存文件名，不需要更大。
- `proxy_read_timeout 75s`：模型回答可能较慢（应用接收请求的超时是 70s，响应耗时另计）；不要压到 30s。
- HTTP 80 只做 301 跳转并保留 ACME 校验路径。

### 7.2 Caddy

```bash
sudo cp deploy/Caddyfile.example /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

- Caddy 自动申请/续期证书，前提是 80/443 可达、DNS 已生效。
- 日志文件目录 `/var/log/caddy` 需属于 caddy 用户：`sudo install -d -o caddy -g caddy -m 0750 /var/log/caddy`。
- `request_body { max_size 128KB }` 需要 Caddy 2.10+；旧版本删掉该块（应用仍会在 100000 字节处拒绝）。
- 若用 Caddy 自己的 `roll_size` 轮转，可不再用 logrotate 管 Caddy 日志。

### 7.3 两条铁律

1. **必须透传 Host**：nginx `proxy_set_header Host $host;`，Caddy `header_up Host {host}`。改成 `127.0.0.1:4173` 会让所有请求 403。
2. **不要重复添加安全响应头**：CSP、`X-Frame-Options`、`X-Content-Type-Options`、`Referrer-Policy` 都由应用下发。代理再加一份会形成策略叠加/冲突（例如两条 CSP 取交集），可能把页面样式或脚本打挂。代理层唯一可考虑额外加的是 HSTS，示例中默认注释，确认 HTTPS 长期稳定后再开。

其他注意：

- 不要缓存 `/api/*`，不要改写 `Set-Cookie`；应用已发 `Cache-Control: no-store`。
- 不要在代理上终止 Cookie 或加 `Domain`；应用 Cookie 是 host-only + `SameSite=Strict`。
- 不要启用 `proxy_protocol`：应用不解析 PROXY protocol，开启后 HTTP 解析会坏。
- 反向代理后，应用看到的 TCP 对端都是 `127.0.0.1`。当前版本的部分防滥用限流按 TCP 对端地址计数（登录 10 次/10 分钟、注册 20 次/小时、发帖 15 次/小时等），**多人经代理访问时会变成全站共享额度**。小范围内网可接受；面向较多用户前，需要在应用层改为信任 `X-Real-IP`（属于代码改动，不在本部署包范围）。不要用 nginx `real_ip` 来“修”，应用读的是 socket 地址，不是 `X-Forwarded-For`。

---

## 8. Cookie、CSP 与“为什么必须 TLS”

### Cookie

- 名称 `campus_session`，`HttpOnly; SameSite=Strict; Path=/`；设置 `CAMPUS_ORIGINS`（或请求带 `X-Forwarded-Proto: https`）后追加 `Secure`。
- `Secure` 意味着浏览器只在 HTTPS 下保存/发送它。用 `http://` 打开页面，每个请求都会新建会话，表现为“刚切换的身份/登录状态一直丢”。
- 因此 **HTTP→HTTPS 跳转必须保留**，且不要在代理后面再用 HTTP 直连页面。
- 会话保存在 Node 内存里（12 小时过期）：**重启进程 = 所有人会话失效**。当前版本这是演示身份，影响可接受；升级/重启请安排在低峰。
- 反向代理不要拆分域名：Cookie 是 host-only，换域名就要重新登录，且 Origin 白名单也要同步加。

### CSP（应用下发，无需配置）

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; connect-src 'self'; frame-ancestors 'none';
form-action 'self'; base-uri 'none'
```

- `connect-src 'self'`：页面只能调同源 `/api/*`。
- `frame-ancestors 'none'` + `X-Frame-Options: DENY`：**不能嵌进学校门户的 iframe**，请用跳转/新窗口。
- 代理加头会冲突；如果页面白屏/样式丢失，先查是不是代理重复加了 CSP。

### 为什么必须 TLS

1. 会话 token、互助私信、学生登记信息在明文 HTTP 下可被同网段嗅探/篡改。
2. `Secure` Cookie 只在 HTTPS 生效，HTTP 下登录态不可用。
3. 浏览器对非安全上下文有功能限制，且无法防御中间人注入。
4. 应用本身没有传输层加密，TLS 完全依赖反向代理。

自签证书只建议内网测试，且客户端必须信任该证书；否则浏览器拦截、Cookie 行为也不稳定。

---

## 9. 健康检查与监控

- 端点：`GET /api/health`，返回 `{"version":2,"app":"campus-agent"}`，HTTP 200；无需登录，不触碰数据文件。
- 直连：`curl -fsS http://127.0.0.1:4173/api/health`（systemd 场景可做本地探活）。
- 经代理：`curl -fsS https://campus.example.com/api/health`（同时验证证书、Host 透传、上游存活）。
- 注意：健康检查也走 Host 白名单。用 `curl -H 'Host: ...'` 直连时，Host 必须是 `127.0.0.1:4173` 或 `CAMPUS_ORIGINS` 中的域名。
- systemd 未配置 `WatchdogSec`；需要进程级自愈用 `Restart=on-failure`，需要业务级监控请用外部探针打 `/api/health`。
- 不要用首页 `/` 做唯一探针：它只证明静态文件可读，不证明 API 正常。

---

## 10. 日志与轮转

| 运行方式 | 日志位置 | 轮转 |
| --- | --- | --- |
| systemd | `journalctl -u campus-agent` | journald（`SystemMaxUse`） |
| nginx | `/var/log/nginx/campus-agent.{access,error}.log` | `deploy/logrotate.conf`（weekly） |
| Caddy | `/var/log/caddy/campus-agent.access.log` | Caddy 内置 `roll_size`，或 logrotate |
| macOS launchd | `<项目>/logs/preview.{out,err}.log` | macOS `newsyslog`（logrotate 默认不存在） |

- 应用只在启动时打印一行地址，不打印请求体、Cookie 或 API Key；不要为了排障在代理日志里加 `$request_body`。
- nginx access log 会记录客户端 IP、路径、UA；如涉个人隐私，控制保留天数与访问权限。
- logrotate 安装：

```bash
sudo cp deploy/logrotate.conf /etc/logrotate.d/campus-agent
sudo logrotate -d /etc/logrotate.d/campus-agent   # 先 dry-run
```

- Debian/Ubuntu 的 nginx 日志属主通常是 `www-data:adm`，RHEL 系是 `nginx:nginx`；请按发行版修改 `create` 行的属主/属组。
- macOS 若确实要轮转 launchd 日志，用 `/etc/newsyslog.d/campus-agent.conf`（示例不在本包内，避免误用到 Linux）。

---

## 11. 备份与恢复

脚本：`deploy/backup.sh`、`deploy/restore.sh`（bash 3.2+，macOS/Linux 通用）。

```bash
# 备份：默认写到 $HOME/campus-agent-backups，目录 700、归档 600
./deploy/backup.sh

# 指定备份目录（推荐放到加密盘/受控目录）
CAMPUS_BACKUP_DIR=/mnt/secure/campus-agent ./deploy/backup.sh

# 恢复（目标已存在时必须 --force）
./deploy/restore.sh /path/to/campus-agent-backup-20261027-120000.tar.gz
./deploy/restore.sh /path/to/campus-agent-backup-20261027-120000.tar.gz --force
```

备份内容：`data/`（`store.json`、`campus-board.json`）+ `config.local.json`。**归档里有 API Key 和学生联系方式**，脚本会打印路径与 SHA-256，但绝不打印文件内容。请离线/加密保管，不要提交 Git、不要发群、不要放公开网盘。

- 一致性：应用单文件写入是 `tmp + rename` 原子的，但 `store.json` 与 `campus-board.json` 不是跨文件事务。**严格一致请先停服务再备份**；脚本不会自动停服务，运行中备份可能落在两个时间点。
- `restore.sh` 行为：拒绝 root 运行 → 校验 `.sha256`（存在时）→ 拒绝绝对路径/`..`/未知顶层条目 → 目标已存在时要求 `--force` → 覆盖前自动生成 `campus-agent-pre-restore-<时间>.tar.gz` 快照 → 恢复到临时目录后替换 → 重新收紧权限。
- 恢复前必须停服务：

```bash
sudo systemctl stop campus-agent        # Linux
launchctl bootout gui/$(id -u)/com.campusagent.preview   # macOS
```

- 若恢复时使用的账号不是 `campus-agent`，恢复后修正属主：

```bash
sudo chown -R campus-agent:campus-agent data config.local.json
sudo chmod 700 data && sudo chmod 600 config.local.json
```

- 恢复后：启动服务 → `curl /api/health` → 打开页面 → 检查互助列表与审核后台 → 再对外恢复访问。
- 建议额外做“异地 + 加密”副本：`age -p` 或 `gpg -c` 加密后再传输；密钥与归档分开保管。

---

## 12. 升级与回滚

```bash
sudo systemctl stop campus-agent
cd /opt/campus-agent
sudo -u campus-agent git pull --ff-only
node --test tests/*.test.cjs          # 可选，测试用临时数据，不动现有知识库
sudo systemctl start campus-agent
```

- `dist/` 是静态资源，随 Git 更新；**不要手工改 dist/**，下次 pull 会冲突。
- 升级前先 `./deploy/backup.sh`；重启会使所有会话失效（演示身份需重新选择）。
- **绝对不要执行 `git clean -xdf`**：`data/`、`config.local.json` 都在 `.gitignore` 中，会被直接删掉（含 API Key 与全部知识库）。
- `git pull` 若提示 `data/` 或 `config.local.json` 冲突，说明有人把运行数据提交进了仓库；停下人工核对，不要用 `checkout --theirs` 覆盖线上数据。
- 只改代理配置时：`nginx -t && systemctl reload nginx` 或 `caddy validate && systemctl reload caddy`，无需重启 Node。
- 回滚：`git checkout <上一个已知良好 commit>` + `sudo systemctl restart campus-agent`；数据回滚用上一节的 restore。
- 依赖为零，无需 `npm install`；Node 大版本升级（18→20/22）先在预发验证，再动生产。

---

## 13. 防火墙与网络

- **只开放 80/443**。4173 绝不能出现在公网安全组/防火墙里：应用只监听 `127.0.0.1`，这是第二道保险。
- 验证监听地址：`ss -ltnp | grep 4173` 应显示 `127.0.0.1:4173`，不是 `0.0.0.0:4173` 或 `[::]:4173`。
- ufw 示例：

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

- 云服务器安全组同样只放 80/443；SSH 限制来源 IP。
- 出站：Node 需要访问模型服务（通常 443）。如安全要求高，可限制出站到所用 provider 域名；否则至少保证 DNS 与 443 出站可用。
- macOS：系统设置 → 网络 → 防火墙，不要给 4173 开“允许传入”；本机预览不需要入站规则。
- 若前面还有负载均衡/WAF：仍要把原始 Host 和 `X-Forwarded-Proto` 传到本机 nginx/Caddy，并确保 `CAMPUS_ORIGINS` 与用户地址栏一致。

---

## 14. 上线前检查清单

- [ ] `CAMPUS_ORIGINS` 精确匹配用户访问的 origin（https、无尾斜杠、443）
- [ ] 代理转发原始 Host（`$host` / `{host}`），未改成 127.0.0.1
- [ ] 代理设置 `X-Forwarded-Proto: https`
- [ ] HTTP 自动 301 到 HTTPS，ACME 路径可达
- [ ] 浏览器 DevTools 中 `campus_session` 带 `Secure; HttpOnly; SameSite=Strict`
- [ ] `curl https://<域名>/api/health` 返回 200
- [ ] `4173` 只监听 `127.0.0.1`，安全组未开放
- [ ] 代理层没有重复添加 CSP / X-Frame-Options
- [ ] **访问受 SSO/VPN/内网限制；演示身份切换未暴露给无关人员**
- [ ] 备份可执行、权限 600、已做一次恢复演练
- [ ] 日志轮转生效；磁盘余量足够
- [ ] 证书自动续期已测试（`certbot renew --dry-run` 或 Caddy 自动）
- [ ] 已告知使用者：重启会掉线、当前不是真实统一身份认证

---

## 15. 常见故障

| 现象 | 大概率原因 | 处理 |
| --- | --- | --- |
| 403 `无效的访问地址。` | 代理没透传 Host，或 `CAMPUS_ORIGINS` 与 Host 不一致（端口/大小写/尾斜杠） | 查 nginx `proxy_set_header Host`；核对 origin；非 443 端口用 `$http_host` |
| 403 `不允许跨站访问本地接口。` | Origin 不在白名单，或代理改写了 Origin | 浏览器地址栏 origin 必须与 `CAMPUS_ORIGINS` 完全一致 |
| 身份/登录状态反复丢失 | 用 HTTP 访问导致 Secure Cookie 不保存；或代理丢了 `Set-Cookie` | 强制 HTTPS；检查响应头 |
| 502 Bad Gateway | Node 没起、端口不对、`WorkingDirectory` 错 | `journalctl -u campus-agent`；`curl 127.0.0.1:4173/api/health` |
| 413 | 请求体超过 100000 字节 | 正常保护；不要盲目调大 |
| 504 / 超时 | 模型响应慢，代理超时过短 | `proxy_read_timeout` / Caddy `response_header_timeout` ≥ 75s |
| 保存模型配置失败 | `ProtectSystem=strict` 但没放开项目根目录写权限 | 保持 `ReadWritePaths=/opt/campus-agent` |
| 页面能开但接口全挂 | 代理重复加 CSP，`connect-src` 取交集 | 删除代理层 CSP |
| Caddy 证书失败 | 80/443 被占、DNS 未生效、云安全组未放行 | `journalctl -u caddy`；检查 DNS 与端口 |
| launchd 起不来 | `logs/` 不存在、Node 不在 PATH、路径含空格 | 先手动运行同一条命令；改用 Node 绝对路径 |
| 多人登录频繁 429 | 代理后所有请求同源 IP，限流全站共享 | 小范围内网使用；或改应用信任 `X-Real-IP` |

---

## 16. 本目录文件

| 文件 | 用途 |
| --- | --- |
| `README.md` | 本文档 |
| `nginx.conf.example` | nginx TLS 站点（80 跳转 + 443 反代） |
| `Caddyfile.example` | Caddy 等价配置（自动 HTTPS） |
| `campus-agent.service` | Linux systemd 单元（journald + 加固） |
| `com.campusagent.preview.plist` | macOS launchd 用户代理 |
| `backup.sh` | 备份 `data/` + `config.local.json`，输出路径与 SHA-256 |
| `restore.sh` | 校验并恢复，覆盖需 `--force` |
| `logrotate.conf` | nginx/Caddy 日志每周轮转（Linux） |

所有示例都含占位符（域名、项目路径、证书路径），复制后必须逐项替换。
