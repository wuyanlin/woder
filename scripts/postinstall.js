/* node-pty 的 darwin spawn-helper 解包后没有执行位，补上。
   原来是 package.json 里的一行 shell，但 Windows 上 npm 用 cmd 跑脚本，那行会直接把 npm ci 弄失败。 */
const fs = require('fs');
const path = require('path');

if (process.platform === 'win32') process.exit(0);

const dir = path.join(__dirname, '..', 'node_modules', 'node-pty', 'prebuilds');
for (const target of fs.readdirSync(dir)) {
  const helper = path.join(dir, target, 'spawn-helper');
  if (fs.existsSync(helper)) fs.chmodSync(helper, 0o755);
}
