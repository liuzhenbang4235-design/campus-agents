#!/usr/bin/env bash
# =============================================================================
# 校集 Campus Agent — 备份脚本
#
# 备份 data/（知识库 + 互助数据）与 config.local.json（模型 API Key）。
# 归档默认写到 $HOME/campus-agent-backups，目录 700、文件 600。
# 不打印任何配置内容/密钥，只输出归档路径与 SHA-256。
#
# 用法：
#   ./deploy/backup.sh
#   CAMPUS_BACKUP_DIR=/mnt/secure/campus-agent ./deploy/backup.sh
# =============================================================================
set -euo pipefail
umask 077

say() { printf '%s\n' "$*"; }
die() { printf '错误：%s\n' "$*" >&2; exit 1; }

# 归档含密钥，拒绝 root：避免文件被 root 持有、也避免误操作范围扩大。
if [ "$(id -u)" -eq 0 ]; then
  die "请不要以 root 运行备份脚本。请用部署用户或 campus-agent 服务用户运行。"
fi

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
PROJECT_DIR=$(cd "$SCRIPT_DIR/.." && pwd -P)
BACKUP_DIR=${CAMPUS_BACKUP_DIR:-"$HOME/campus-agent-backups"}

[ -f "$PROJECT_DIR/server.cjs" ] || die "找不到 $PROJECT_DIR/server.cjs；请把本脚本放在项目的 deploy/ 目录下。"
case "$PROJECT_DIR" in
  /|"") die "项目路径异常：$PROJECT_DIR" ;;
esac

# 只备份确实存在的内容
items=()
if [ -d "$PROJECT_DIR/data" ]; then
  items+=("data")
fi
if [ -f "$PROJECT_DIR/config.local.json" ]; then
  items+=("config.local.json")
fi
if [ "${#items[@]}" -eq 0 ]; then
  die "data/ 与 config.local.json 都不存在，没有可备份的内容。"
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

timestamp=$(date +%Y%m%d-%H%M%S)
archive="$BACKUP_DIR/campus-agent-backup-$timestamp.tar.gz"
n=1
while [ -e "$archive" ]; do
  archive="$BACKUP_DIR/campus-agent-backup-$timestamp-$n.tar.gz"
  n=$((n + 1))
done

say "项目目录：$PROJECT_DIR"
say "备份内容：${items[*]}"
if [ -d "$PROJECT_DIR/data" ] && [ -f "$PROJECT_DIR/config.local.json" ]; then
  say "提示：若服务正在运行，data/ 与 config.local.json 可能不在同一时间点；"
  say "      需要严格一致时请先停止服务再执行本脚本。"
fi

# -C 保证归档内是相对路径（data/、config.local.json），恢复时不会写到系统目录
tar -czf "$archive" --exclude='*.tmp' -C "$PROJECT_DIR" "${items[@]}"
chmod 600 "$archive"

# 立即回读，确认归档可读且完整
tar -tzf "$archive" >/dev/null 2>&1 || die "归档写入后校验失败：$archive"

if command -v sha256sum >/dev/null 2>&1; then
  sum=$(sha256sum "$archive" | awk '{print $1}')
else
  sum=$(shasum -a 256 "$archive" | awk '{print $1}')
fi
printf '%s  %s\n' "$sum" "$(basename "$archive")" > "$archive.sha256"
chmod 600 "$archive.sha256"

size=$(du -h "$archive" | awk '{print $1}')

say ""
say "备份完成"
say "  归档：$archive"
say "  大小：$size"
say "  SHA-256：$sum"
say "  校验文件：$archive.sha256"
say ""
say "注意：归档包含 config.local.json（模型 API Key）和互助数据（可能含学生联系方式）。"
say "      请只保存在受控/加密介质，保持 600，不要提交 Git、不要发群或公开链接。"
say "      异地保存建议先加密：age -p <归档> 或 gpg -c <归档>。"
