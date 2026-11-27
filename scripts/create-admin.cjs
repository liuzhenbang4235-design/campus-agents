'use strict';
// 创建或提升一个超级管理员。密码只以 scrypt 哈希写入，不写明文。
// 用法：
//   node scripts/create-admin.cjs --username admin --name 管理员
//   node scripts/create-admin.cjs --student-id 20210001 --name 管理员 --password '自定义密码'
// 不传 --password 时会生成一次性初始密码并在终端显示；首次登录必须改密。
const path = require('node:path');
const { createBoard } = require('../lib/campus-board.cjs');

function arg(name) {
  const index = process.argv.indexOf('--' + name);
  return index >= 0 ? String(process.argv[index + 1] || '') : '';
}

const file = arg('file') || path.join(__dirname, '..', 'data', 'campus-board.json');
const username = arg('username').trim().toLowerCase();
const studentId = arg('student-id').trim();
const password = arg('password');
const displayName = arg('name') || '超级管理员';

if (!username && !studentId) {
  console.error('用法: node scripts/create-admin.cjs --username admin --name 管理员 [--password ...]');
  console.error('   或: node scripts/create-admin.cjs --student-id 20210001 --name 管理员 [--password ...]');
  process.exit(1);
}

try {
  const board = createBoard({ file });
  const existing = board.listAccounts().find(item =>
    (username && item.username === username) || (studentId && item.studentId === studentId)
  );
  if (existing) {
    const account = board.setAccountRole(existing.studentId, 'super_admin');
    console.log('已设为超级管理员：' + (account.username || account.studentId) + '（' + account.displayName + '）');
    if (password || arg('reset-password') === '1') {
      const reset = board.resetAccountPassword(account.studentId, password || '');
      console.log('新初始密码（只显示一次）：' + reset.initialPassword);
      console.log('该账号下次登录必须先修改密码。');
    }
  } else {
    const created = board.createAccountByAdmin({
      username,
      studentId,
      displayName,
      password: password || '',
      role: 'super_admin'
    });
    console.log('已创建超级管理员：' + (created.username || created.studentId) + '（' + created.displayName + '）');
    console.log('初始密码（只显示一次）：' + created.initialPassword);
    console.log('首次登录后必须修改密码。');
  }
} catch (error) {
  console.error('创建失败：' + (error && error.message || error));
  process.exit(1);
}
