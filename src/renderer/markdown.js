/* ===== Markdown → DOM =====
   渲染工作区里的 .md 预览。只用 createElement + textContent 建节点，
   文档里混进来的 <script>、<img onerror=...> 只会成为字面文本，所以不需要再引 sanitizer
   （CSP 的 script-src 'self' 本来也不允许加载第三方解析器）。

   覆盖：标题 / 段落 / 有序无序列表（可嵌套、可任务项）/ 围栏代码块 / 引用 / 表格 / 分隔线，
   行内 code、**粗体**、*斜体*、~~删除线~~、[链接]()、![]()。
   下划线式强调（_x_）故意不支持：文档里 usage_records、node_modules 这类标识符太多，
   认成斜体会把整行吃掉。 */

const MD = (() => {
  const node = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  const COPY_SVG = '<svg viewBox="0 0 24 24" class="i"><rect x="9" y="9" width="10" height="10" rx="2"/><path d="M15 5.5H6a1.5 1.5 0 00-1.5 1.5v9"/></svg>';
  const LINK_OK = /^(https?:|mailto:|#)/i;
  const SCHEMA = /^[a-z][a-z0-9+.-]*:/i;

  /** 相对路径的图片按「工作区根 / 当前文件所在目录」补成 file:// ，带协议的 URL 原样交给 CSP 判断 */
  const imgUrl = (base, src) => {
    if (SCHEMA.test(src) || src.startsWith('//')) return src;
    if (!base) return src;
    const rel = src.replace(/^\.?\/+/, '');
    return encodeURI(`file://${base.replace(/\/+$/, '')}/${rel}`);
  };

  const PAT = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(~~[^~\n]+~~)|(!?)\[([^\]]*)\]\(\s*([^)\s]*)(?:\s+[^)]*)?\)/g;

  function inline(target, text, base) {
    let last = 0;
    let m;
    PAT.lastIndex = 0;
    while ((m = PAT.exec(text))) {
      if (m.index > last) target.appendChild(document.createTextNode(text.slice(last, m.index)));
      if (m[1]) target.appendChild(node('code', 'md-code', m[1].slice(1, -1)));
      else if (m[2]) target.appendChild(node('strong', 'md-strong', m[2].slice(2, -2)));
      else if (m[3]) target.appendChild(node('em', 'md-em', m[3].slice(1, -1)));
      else if (m[4]) target.appendChild(node('s', 'md-del', m[4].slice(2, -2)));
      else if (m[5] !== undefined) {
        const label = m[6];
        const url = m[7] || '';
        if (m[5] === '!') {
          const img = node('img', 'md-img');
          img.alt = label;
          img.src = imgUrl(base, url);
          img.loading = 'lazy';
          target.appendChild(img);
        } else if (LINK_OK.test(url)) {
          const a = node('a', 'md-link', label || url);
          a.href = url;
          target.appendChild(a);
        } else {
          target.appendChild(document.createTextNode(label));
        }
      }
      last = PAT.lastIndex;
    }
    if (last < text.length) target.appendChild(document.createTextNode(text.slice(last)));
    return target;
  }

  /** 段内换行：行尾两个空格或反斜杠是硬换行，其余按普通空白折叠 */
  function inlineLines(target, text, base) {
    String(text).split('\n').forEach((seg, idx, all) => {
      if (idx && /(?: {2,}|\\)$/.test(all[idx - 1])) target.appendChild(node('br', 'md-br'));
      inline(target, seg.replace(/\\$/, '').replace(/\s+$/, ''), base);
    });
    return target;
  }

  function codeBlock(lang, body) {
    const wrap = node('div', 'md-pre-wrap');
    const head = node('div', 'md-pre-head');
    head.appendChild(node('span', 'md-lang', lang || 'code'));
    const btn = node('button', 'md-copy');
    btn.type = 'button';
    btn.title = '复制代码';
    btn.innerHTML = COPY_SVG;
    btn.addEventListener('click', async () => {
      await copyText(body);
      btn.classList.add('done');
      setTimeout(() => btn.classList.remove('done'), 1200);
    });
    head.appendChild(btn);
    wrap.appendChild(head);
    const pre = node('pre', 'md-pre');
    pre.appendChild(node('code', null, body));
    wrap.appendChild(pre);
    return wrap;
  }

  const cellsOf = row => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(s => s.trim());

  function table(rows, base) {
    const wrap = node('div', 'md-table-wrap');
    const table_ = node('table', 'md-table');
    const thead = node('thead');
    const headRow = node('tr');
    cellsOf(rows[0]).forEach(c => {
      const th = node('th');
      inline(th, c, base);
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table_.appendChild(thead);
    const tbody = node('tbody');
    rows.slice(2).forEach(r => {
      const tr = node('tr');
      cellsOf(r).forEach(c => {
        const td = node('td');
        inline(td, c, base);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table_.appendChild(tbody);
    wrap.appendChild(table_);
    return wrap;
  }

  const ITEM = /^([ \t]*)([-*+]|\d{1,9}[.)])[ \t]+(.*)$/;
  const isItem = s => ITEM.test(s);
  const indentOf = s => s.match(/^([ \t]*)/)[1].replace(/\t/g, '  ').length;

  /** 从 start 起把这一段列表摘出来，返回根节点和下一行下标 */
  function list(lines, start, base) {
    const items = [];
    let i = start;
    while (i < lines.length) {
      const m = lines[i].match(ITEM);
      if (m) {
        items.push({ indent: indentOf(lines[i]), ordered: /\d/.test(m[2]), text: m[3], children: [] });
        i++;
        continue;
      }
      if (!lines[i].trim()) {
        // 空行后面还接着列表项才算同一个列表（松散列表），否则到此为止
        let j = i;
        while (j < lines.length && !lines[j].trim()) j++;
        if (j < lines.length && isItem(lines[j]) && indentOf(lines[j]) >= items[items.length - 1].indent) { i = j; continue; }
        break;
      }
      if (indentOf(lines[i]) > 0 && items.length) {
        // 缩进的续行并进上一条，跟常见渲染器一致
        items[items.length - 1].text += ' ' + lines[i].trim();
        i++;
        continue;
      }
      break;
    }

    const root = { children: [], indent: -1 };
    const stack = [root];
    items.forEach(it => {
      while (stack.length > 1 && it.indent <= stack[stack.length - 1].indent) stack.pop();
      stack[stack.length - 1].children.push(it);
      stack.push(it);
    });

    const build = list_ => {
      const ul = node(list_[0].ordered ? 'ol' : 'ul', 'md-list');
      list_.forEach(it => {
        const li = node('li', 'md-li');
        const task = it.text.match(/^\[([ xX])\]\s*(.*)$/);
        if (task) {
          const box = node('span', `md-task${task[1] === ' ' ? '' : ' on'}`);
          box.textContent = task[1] === ' ' ? '' : '✓';
          li.appendChild(box);
          inline(li, task[2], base);
        } else {
          inline(li, it.text, base);
        }
        if (it.children.length) li.appendChild(build(it.children));
        ul.appendChild(li);
      });
      return ul;
    };
    return { el: build(root.children), next: i };
  }

  const FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*([\w.+-]*)[ \t]*$/;
  const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;
  const HR = /^ {0,3}([-*_])[ \t]*(?:\1[ \t]*){2,}$/;
  const QUOTE = /^ {0,3}>/;
  const SEPARATOR = /^\s*\|?[ \t]*:?-{1,}:?[ \t]*(\|[ \t]*:?-{1,}:?[ \t]*)*\|?\s*$/;

  const startsBlock = s =>
    FENCE.test(s) || HEADING.test(s) || HR.test(s) || QUOTE.test(s) || isItem(s);

  function render(host, src, base) {
    host.innerHTML = '';
    const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }

      const fence = line.match(FENCE);
      if (fence) {
        const closeRe = new RegExp(`^ {0,3}${fence[1][0]}{${fence[1].length},}[ \\t]*$`);
        const buf = [];
        i++;
        while (i < lines.length && !closeRe.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        host.appendChild(codeBlock(fence[2], buf.join('\n')));
        continue;
      }

      const h = line.match(HEADING);
      if (h) {
        const tag = node(`h${h[1].length}`, 'md-h');
        inline(tag, h[2], base);
        host.appendChild(tag);
        i++;
        continue;
      }

      if (HR.test(line)) { host.appendChild(node('hr', 'md-hr')); i++; continue; }

      if (QUOTE.test(line)) {
        const buf = [];
        while (i < lines.length && (QUOTE.test(lines[i]) || (buf.length && lines[i].trim() && !startsBlock(lines[i])))) {
          buf.push(lines[i].replace(/^ {0,3}>[ \t]?/, ''));
          i++;
        }
        const q = node('blockquote', 'md-quote');
        render(q, buf.join('\n'), base);
        host.appendChild(q);
        continue;
      }

      if (line.includes('|') && i + 1 < lines.length && SEPARATOR.test(lines[i + 1])) {
        const rows = [];
        while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { rows.push(lines[i]); i++; }
        host.appendChild(rows.length > 1 ? table(rows, base) : paragraph(rows[0], base));
        continue;
      }

      if (isItem(line)) {
        const r = list(lines, i, base);
        host.appendChild(r.el);
        i = r.next;
        continue;
      }

      const buf = [];
      while (i < lines.length && lines[i].trim() && !startsBlock(lines[i])) { buf.push(lines[i]); i++; }
      host.appendChild(paragraph(buf.join('\n'), base));
    }
    return host;
  }

  function paragraph(text, base) {
    const p = node('p', 'md-p');
    return inlineLines(p, text, base);
  }

  return { render, inline };
})();
