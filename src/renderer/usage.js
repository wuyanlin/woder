/* 用量管理：主窗口里的全屏弹出层。数据全部来自主进程 SQLite（woder.usage.query），这里只管筛选和画。
   整体包在 IIFE 里：app.js 已经占了全局 $ 等名字，同名 const 会直接炸掉脚本。 */

(() => {
  const $u = s => document.querySelector(s);

  const fmtNum = n => Number(n ?? 0).toLocaleString('en-US');

  const pad = n => String(n).padStart(2, '0');

  function fmtTime(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}  ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function dayStart(offsetDays = 0) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime() - offsetDays * 86400000;
  }

  /* days: 1/7/30 = 快捷区间；0 = 用日期框里的自定义区间 */
  let days = 1;

  function rangeMs() {
    const now = Date.now();
    if (days === 1) return [dayStart(0), now];
    if (days) return [now - days * 86400000, now];
    const from = $u('#fromDate').value ? new Date(`${$u('#fromDate').value}T00:00:00`).getTime() : 0;
    const to = $u('#toDate').value ? new Date(`${$u('#toDate').value}T23:59:59`).getTime() : now;
    return [from, to];
  }

  function renderModels(models, selected) {
    const sel = $u('#modelSel');
    sel.innerHTML = '';
    const all = document.createElement('option');
    all.value = '';
    all.textContent = '全部模型';
    sel.appendChild(all);
    models.forEach(m => {
      const o = document.createElement('option');
      o.value = m;
      o.textContent = m;
      sel.appendChild(o);
    });
    sel.value = models.includes(selected) ? selected : '';
  }

  function renderRows(rows) {
    const body = $u('#rows');
    body.innerHTML = '';
    rows.forEach(r => {
      const tr = document.createElement('tr');
      const td = (cls, text) => {
        const cell = document.createElement('td');
        if (cls) cell.className = cls;
        cell.textContent = text;
        return cell;
      };
      tr.appendChild(td('c-time', fmtTime(r.ts)));
      const rec = td(null, r.text);
      rec.title = r.text;
      tr.appendChild(rec);
      tr.appendChild(td('c-model', r.model));
      tr.appendChild(td('c-product', r.product));
      const numCell = (v, cls) => {
        const cell = td(cls ? `c-num ${cls}` : 'c-num', fmtNum(v));
        // 没配模型时三项都是 0，压成灰色免得跟真实用量一样抢眼
        if (!v) cell.classList.add('zero');
        return cell;
      };
      tr.appendChild(numCell(r.prompt));
      tr.appendChild(numCell(r.completion));
      const total = numCell(r.total, 'c-total');
      total.title = `输入 ${fmtNum(r.prompt)} · 输出 ${fmtNum(r.completion)}`;
      tr.appendChild(total);
      body.appendChild(tr);
    });
    $u('#empty').hidden = rows.length > 0;
  }

  async function refresh() {
    const [from, to] = rangeMs();
    const model = $u('#modelSel').value;
    const res = await woder.usage.query({ from, to, model });
    if (!res.success) return;
    renderModels(res.models, model);
    $u('#statTotal').textContent = fmtNum(res.totals.total);
    $u('#statPrompt').textContent = fmtNum(res.totals.prompt);
    $u('#statCompletion').textContent = fmtNum(res.totals.completion);
    renderRows(res.rows);
  }

  const overlay = $u('#usageOverlay');

  window.openUsagePage = () => {
    overlay.hidden = false;
    // 右上角那三个布局开关是给主界面用的，盖在用量层上会误导点击
    document.body.classList.add('usage-open');
    refresh();
  };

  $u('#rangeSeg').addEventListener('click', e => {
    const btn = e.target.closest('button[data-days]');
    if (!btn) return;
    days = Number(btn.dataset.days);
    [...$u('#rangeSeg').children].forEach(b => b.classList.toggle('active', b === btn));
    refresh();
  });

  const pickCustom = () => {
    days = 0;
    [...$u('#rangeSeg').children].forEach(b => b.classList.remove('active'));
    refresh();
  };
  $u('#fromDate').addEventListener('change', pickCustom);
  $u('#toDate').addEventListener('change', pickCustom);

  $u('#modelSel').addEventListener('change', refresh);

  $u('#btnBack').addEventListener('click', () => {
    overlay.hidden = true;
    document.body.classList.remove('usage-open');
  });
})();
