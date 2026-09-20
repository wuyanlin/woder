/* 出 Windows x64 包。
   坑在这里：node_modules 里那颗 better_sqlite3.node 是本机 darwin/arm64 的，electron-builder 会照原样打进去，
   Windows 上一 require 就崩。所以构建期间临时换成 native/win32-x64/ 里那颗（Electron 28 = ABI 119 预编译），
   不管构建成败都换回来——留着 Windows 二进制在本地，dev 起来就是 SIGSEGV。 */
const fs = require('fs');
const { spawnSync } = require('child_process');

const REL = 'node_modules/better-sqlite3/build/Release/better_sqlite3.node';
const WIN = 'native/win32-x64/better_sqlite3.node';
const BACKUP = `${REL}.darwin`;

const PREBUILD =
  'https://github.com/WiseLibs/better-sqlite3/releases/download/v11.10.0/better-sqlite3-v11.10.0-electron-v119-win32-x64.tar.gz';

if (!fs.existsSync(WIN)) {
  console.error(`缺少 ${WIN}
先取一颗 win32-x64 / Electron-ABI 119 的预编译产物：
  curl -L ${PREBUILD} | tar xz -C /tmp build/Release/better_sqlite3.node
  cp /tmp/build/Release/better_sqlite3.node ${WIN}`);
  process.exit(1);
}

fs.renameSync(REL, BACKUP);
fs.copyFileSync(WIN, REL);
console.log('已换成 win32-x64 的 better_sqlite3.node');

let code = 1;
try {
  code = spawnSync('npx', ['electron-builder', '--win', '--x64', ...process.argv.slice(2)], { stdio: 'inherit' }).status;
} finally {
  fs.rmSync(REL, { force: true });
  fs.renameSync(BACKUP, REL);
  console.log('已还原本机的 better_sqlite3.node');
}
process.exit(code == null ? 1 : code);
