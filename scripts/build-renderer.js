/* 构建渲染层产物：src/renderer 整体拷过去，再把 xterm 的三个浏览器文件放进 vendor/。
   它们是 UMD，在渲染进程里没有 module/exports，会自己挂到 globalThis 上（window.Terminal、window.FitAddon）。 */
const fs = require('fs');

fs.mkdirSync('dist/renderer', { recursive: true });
fs.cpSync('src/renderer', 'dist/renderer', { recursive: true });

const vendor = 'dist/renderer/vendor';
fs.mkdirSync(vendor, { recursive: true });
fs.copyFileSync('node_modules/@xterm/xterm/lib/xterm.js', `${vendor}/xterm.js`);
fs.copyFileSync('node_modules/@xterm/xterm/css/xterm.css', `${vendor}/xterm.css`);
fs.copyFileSync('node_modules/@xterm/addon-fit/lib/addon-fit.js', `${vendor}/addon-fit.js`);
