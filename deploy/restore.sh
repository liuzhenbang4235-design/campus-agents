#!/usr/bin/env bash
# =============================================================================
# 校集 Campus Agent — 恢复脚本
#
# 从 deploy/backup.sh 生成的归档恢复 data/ 与 config.local.json。
# 安全策略：
#   - 拒绝 root 运行
#   - 有 .sha256 时先校验
#   - 拒绝绝对路径、..、符号链接、未知顶层条目
#   - 目标已存在时必须显式 --force
#   - 覆盖前自动生成 pre-restore 快照（存到备份目录）
#   - 不打印任何文件内容/密钥
#
# 用法：
#   ./deploy/restore.sh ARCHIVE.tar.gz
#   ./deploy/restore.sh ARCHIVE.tar.gz --force
# =============================================================================
set -euo pipefail
umask 077

say() { printf '%s\n' "$*"; }
die() { printf '错误：%s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
用法：restore.sh ARCHIVE [--force]

  ARCHIVE   由 deploy/backup.sh 生成的 .tar.gz
  --force   目标 data/ 或 config.local.json 已存在时，允许覆盖

恢复前请先停止 campus-agent 服务。
EOF
}

if [ "$(id -u)" -eq 0 ]; then
  die "请不要以 root 运行恢复脚本。请用部署用户或 campus-agent 服务用户运行。"
fi

FORCE=0
ARCHIVE=""
for arg in "$@"; do
  case "$arg" in
    --force)
      FORCE=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      usage >&2
      die "未知参数：$arg"
      ;;
    *)
      if [ -n "$ARCHIVE" ]; then
        die "只能指定一个归档文件。"
      fi
      ARCHIVE=$arg
      ;;
  esac
done

if [ -z "$ARCHIVE" ]; then
  usage >&2
  die "缺少归档路径。"
fi

[ -f "$ARCHIVE" ] || die "归档不存在或不是普通文件：$ARCHIVE"
ARCHIVE_DIR=$(cd "$(dirname "$ARCHIVE")" && pwd -P)
ARCHIVE="$ARCHIVE_DIR/$(basename "$ARCHIVE")"

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
PROJECT_DIR=$(cd "$SCRIPT_DIR/.." && pwd -P)
[ -f "$PROJECT_DIR/server.cjs" ] || die "找不到 $PROJECT_DIR/server.cjs；请把本脚本放在项目的 deploy/ 目录下。"
case "$PROJECT_DIR" in
  /|"") die "项目路径异常：$PROJECT_DIR" ;;
esac

# ---- 完整性校验 -------------------------------------------------------------
sidecar="$ARCHIVE.sha256"
if [ -f "$sidecar" ]; then
  expected=$(awk 'NR==1{print $1; exit}' "$sidecar")
  [ -n "$expected" ] || die "校验文件为空：$sidecar"
  if command -v sha256sum >/dev/null 2>&1; then
    actual=$(sha256sum "$ARCHIVE" | awk '{print $1}')
  else
    actual=$(shasum -a 256 "$ARCHIVE" | awk '{print $1}')
  fi
  if [ "$expected" != "$actual" ]; then
    die "SHA-256 不匹配，归档可能损坏或被篡改：
  期望：$expected
  实际：$actual"
  fi
  say "SHA-256 校验通过。"
else
  say "警告：未找到 $sidecar，跳过完整性校验。"
fi

# ---- 归档内容安全检查 -------------------------------------------------------
entries=$(tar -tzf "$ARCHIVE") || die "无法读取归档（不是有效的 tar.gz？）"
if printf '%s\n' "$entries" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  die "归档包含绝对路径或 ..，已拒绝恢复。"
fi
if tar -tvzf "$ARCHIVE" | grep -Eq '^[lh]'; then
  die "归档包含符号链接/硬链接，已拒绝恢复。"
fi
unknown=$(printf '%s\n' "$entries" | grep -Ev '^(data/|data$|config\.local\.json$)' | head -n 5 || true)
if [ -n "$unknown" ]; then
  die "归档包含未知顶层条目，已拒绝恢复：
$unknown"
fi
printf '%s\n' "$entries" | grep -Eq '^(data/|config\.local\.json$)' || die "归档里没有 data/ 或 config.local.json。"

# ---- 覆盖策略 ---------------------------------------------------------------
targets_exist=0
if [ -e "$PROJECT_DIR/data" ] || [ -e "$PROJECT_DIR/config.local.json" ]; then
  targets_exist=1
fi
if [ "$targets_exist" -eq 1 ] && [ "$FORCE" -ne 1 ]; then
  die "目标已存在（$PROJECT_DIR/data 或 config.local.json）。确认覆盖请加 --force。"
fi

say ""
say "重要：请先停止 campus-agent 服务，恢复期间不要启动或写入。"
say "  Linux: sudo systemctl stop campus-agent"
say "  macOS: launchctl bootout gui/\$(id -u)/com.campusagent.preview"
say ""

# ---- 覆盖前快照 -------------------------------------------------------------
BACKUP_DIR=${CAMPUS_BACKUP_DIR:-"$HOME/campus-agent-backups"}
if [ "$targets_exist" -eq 1 ]; then
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  pre_items=()
  if [ -d "$PROJECT_DIR/data" ]; then
    pre_items+=("data")
  fi
  if [ -f "$PROJECT_DIR/config.local.json" ]; then
    pre_items+=("config.local.json")
  fi
  pre_archive="$BACKUP_DIR/campus-agent-pre-restore-$(date +%Y%m%d-%H%M%S)-$$.tar.gz"
  if [ "${#pre_items[@]}" -gt 0 ]; then
    tar -czf "$pre_archive" --exclude='*.tmp' -C "$PROJECT_DIR" "${pre_items[@]}" \
      || die "生成覆盖前快照失败，已中止恢复（未改动现有数据）。"
    chmod 600 "$pre_archive"
    if command -v sha256sum >/dev/null 2>&1; then
      pre_sum=$(sha256sum "$pre_archive" | awk '{print $1}')
    else
      pre_sum=$(shasum -a 256 "$pre_archive" | awk '{print $1}')
    fi
    say "覆盖前快照：$pre_archive"
    say "  SHA-256：$pre_sum"
  fi
fi

# ---- 解包到临时目录（不直接解到项目里）--------------------------------------
staging=$(mktemp -d "${TMPDIR:-/tmp}/campus-agent-restore.XXXXXX")
cleanup() { rm -rf "$staging"; }
trap cleanup EXIT
tar -xzf "$ARCHIVE" -C "$staging" || die "解包失败。"

# ---- 安装 -------------------------------------------------------------------
if [ -d "$staging/data" ]; then
  rm -rf "$PROJECT_DIR/data"
  cp -R "$staging/data" "$PROJECT_DIR/data"
  chmod 700 "$PROJECT_DIR/data"
  find "$PROJECT_DIR/data" -type f -exec chmod 600 {} +
  say "已恢复 data/（目录 700，文件 600）。"
else
  say "归档不含 data/，保留现有数据。"
fi

if [ -f "$staging/config.local.json" ]; then
  cp "$staging/config.local.json" "$PROJECT_DIR/config.local.json"
  chmod 600 "$PROJECT_DIR/config.local.json"
  say "已恢复 config.local.json（600）。"
else
  say "归档不含 config.local.json，保留现有模型配置。"
fi

current_user=$(id -un)
if [ "$current_user" != "campus-agent" ]; then
  say ""
  say "提示：当前用户是 $current_user；若服务以 campus-agent 运行，请修正属主："
  say "  sudo chown -R campus-agent:campus-agent \"$PROJECT_DIR/data\" \"$PROJECT_DIR/config.local.json\""
fi

say ""
say "恢复完成：$ARCHIVE"
say "下一步：启动服务 -> curl -fsS http://127.0.0.1:4173/api/health -> 打开页面检查互助与审核数据。"
