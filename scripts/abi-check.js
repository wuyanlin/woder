/* 打包前自检：node_modules 里那颗 better_sqlite3.node 必须是 Electron ABI 的产物。
   普通 npm ci 会把它换成 Node ABI 的，打进包里主进程一 require 就 SIGSEGV —— 所以在这里当场失败。 */
const Database = require('better-sqlite3');
const row = new Database(':memory:').prepare('select 1 as ok').get();
console.log(`better-sqlite3 可用，Electron ABI = ${process.versions.modules}`, row);
process.exit(0);
