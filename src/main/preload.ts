/**
 * 预加载脚本 - 暴露 IPC 接口给渲染进程
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('woder', {
  task: {
    /** history 是当前会话里前面几轮的问答，规划时一起带上，「继续」这类需求才有依据；
        images 是用户随需求附的图片，主进程清洗后拼成多模态 content */
    plan: (request: string, workspaceId?: string, history?: unknown[], images?: unknown[]) =>
      ipcRenderer.invoke('task:plan', request, workspaceId, history, images),
    /** usageRecordId 是 task:plan 落的用量行，执行阶段的 token 并回同一行 */
    executePlan: (plan: unknown, workspaceId?: string, usageRecordId?: number) =>
      ipcRenderer.invoke('task:execute-plan', plan, workspaceId, usageRecordId)
  },

  usage: {
    query: (filter: { from?: number; to?: number; model?: string; limit?: number }) =>
      ipcRenderer.invoke('usage:query', filter)
  },

  context: {
    /** 当前会话的上下文占用明细（分区 token + 百分比） */
    stat: (payload: { history?: unknown[]; request?: string }, workspaceId?: string) =>
      ipcRenderer.invoke('context:stat', payload, workspaceId),
    /** 把早期问答压成一段摘要，返回摘要文本 */
    compact: (payload: { lines: string[] }, workspaceId?: string) =>
      ipcRenderer.invoke('context:compact', payload, workspaceId)
  },

  ai: {
    /** 整份模型列表提交：条目带 id 表示编辑，apiKey 留空表示沿用已存密钥 */
    setConfig: (config: { activeId?: string; profiles: unknown[] }) =>
      ipcRenderer.invoke('ai:set-config', config),
    setActive: (id: string) => ipcRenderer.invoke('ai:set-active', id),
    /** 管理模型窗口：只改思考强度 / 显示状态 / 上下文窗口，不碰密钥 */
    setPrefs: (prefs: unknown[]) => ipcRenderer.invoke('ai:set-prefs', { prefs }),
    getConfig: () => ipcRenderer.invoke('ai:get-config'),
    reset: () => ipcRenderer.invoke('ai:reset')
  },

  workspace: {
    list: () => ipcRenderer.invoke('workspace:list'),
    add: () => ipcRenderer.invoke('workspace:add'),
    update: (id: string, patch: { name?: string; pinned?: boolean }) => ipcRenderer.invoke('workspace:update', id, patch),
    remove: (id: string) => ipcRenderer.invoke('workspace:remove', id),
    tree: (workspaceId?: string) => ipcRenderer.invoke('workspace:tree', workspaceId),
    read: (relPath: string, workspaceId?: string) => ipcRenderer.invoke('workspace:read', relPath, workspaceId),
    /** baseMtime 传读取时拿到的修改时间，磁盘上更新过主进程会拒绝落盘 */
    write: (relPath: string, content: string, workspaceId?: string, baseMtime?: number) =>
      ipcRenderer.invoke('workspace:write', relPath, content, workspaceId, baseMtime)
  },

  sessions: {
    load: () => ipcRenderer.invoke('sessions:load'),
    save: (sessions: unknown[]) => ipcRenderer.invoke('sessions:save', sessions)
  },

  browser: {
    openExternal: (url: string) => ipcRenderer.invoke('browser:open-external', url),
    /** 本机在监听哪些端口，浏览器首页的 Local 分组用它 */
    localServices: () => ipcRenderer.invoke('browser:local-services'),
    /** 页签里点了 target=_blank / window.open：主进程拦下弹窗后推回来，渲染层在当前页打开 */
    onPopup: (callback: (payload: { guestId: number; url: string }) => void) => {
      const listener = (_e: unknown, payload: { guestId: number; url: string }) => callback(payload);
      ipcRenderer.on('browser:popup', listener);
      return () => ipcRenderer.removeListener('browser:popup', listener);
    },
    /** 执行器下发的浏览器动作，渲染层做完要按 reqId 回执 */
    onCommand: (callback: (payload: unknown) => void) => {
      const listener = (_e: unknown, payload: unknown) => callback(payload);
      ipcRenderer.on('browser:command', listener);
      return () => ipcRenderer.removeListener('browser:command', listener);
    },
    reply: (payload: unknown) => ipcRenderer.invoke('browser:reply', payload)
  },

  /** 内置终端：一个页签一条 pty 会话，输出走 term:event 推回来 */
  term: {
    create: (id: string, workspaceId?: string) => ipcRenderer.invoke('term:create', id, workspaceId),
    write: (id: string, data: string) => ipcRenderer.invoke('term:write', id, data),
    resize: (id: string, cols: number, rows: number) => ipcRenderer.invoke('term:resize', id, cols, rows),
    close: (id: string) => ipcRenderer.invoke('term:close', id),
    onEvent: (callback: (payload: unknown) => void) => {
      const listener = (_e: unknown, payload: unknown) => callback(payload);
      ipcRenderer.on('term:event', listener);
      return () => ipcRenderer.removeListener('term:event', listener);
    }
  },

  /**
   * 订阅执行事件，返回取消订阅函数
   */
  onTaskEvent: (callback: (event: unknown) => void) => {
    const listener = (_e: unknown, event: unknown) => callback(event);
    ipcRenderer.on('task:event', listener);
    return () => ipcRenderer.removeListener('task:event', listener);
  }
});
