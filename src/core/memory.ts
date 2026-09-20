/**
 * 记忆管理系统 - 维护跨会话的用户偏好和工作习惯
 */

import Store from 'electron-store';

export interface UserPreference {
  id: string;
  key: string;
  value: any;
  updatedAt: Date;
}

export interface WorkContext {
  currentProject: string;
  recentFiles: string[];
  activeSkills: string[];
}

export class MemoryManager {
  private store: Store;
  
  constructor() {
    this.store = new Store({
      name: 'user-memory'
    });
  }
  
  /**
   * 保存用户偏好
   */
  savePreference(key: string, value: any): void {
    const preferences = this.getPreferences();
    const existingIndex = preferences.findIndex(p => p.key === key);
    
    const preference: UserPreference = {
      id: existingIndex >= 0 ? preferences[existingIndex].id : this.generateId(),
      key,
      value,
      updatedAt: new Date()
    };
    
    if (existingIndex >= 0) {
      preferences[existingIndex] = preference;
    } else {
      preferences.push(preference);
    }
    
    this.store.set('preferences', preferences);
  }
  
  /**
   * 获取用户偏好
   */
  getPreference(key: string): any {
    const preferences = this.getPreferences();
    const preference = preferences.find(p => p.key === key);
    return preference?.value;
  }
  
  /**
   * 获取所有偏好
   */
  getPreferences(): UserPreference[] {
    return this.store.get('preferences', []) as UserPreference[];
  }
  
  /**
   * 更新工作上下文
   */
  updateContext(context: Partial<WorkContext>): void {
    const currentContext = this.getContext();
    this.store.set('context', { ...currentContext, ...context });
  }
  
  /**
   * 获取工作上下文
   */
  getContext(): WorkContext {
    return this.store.get('context', {
      currentProject: '',
      recentFiles: [],
      activeSkills: []
    }) as WorkContext;
  }
  
  /**
   * 添加最近访问的文件
   */
  addRecentFile(filePath: string): void {
    const context = this.getContext();
    context.recentFiles.unshift(filePath);
    context.recentFiles = context.recentFiles.slice(0, 20); // 最多保留 20 个
    this.store.set('context', context);
  }
  
  /**
   * 学习用户行为模式
   */
  learnBehavior(pattern: string, frequency: number): void {
    const patterns = this.getBehaviorPatterns();
    const existing = patterns.find(p => p.pattern === pattern);
    
    if (existing) {
      existing.frequency = Math.max(existing.frequency, frequency);
    } else {
      patterns.push({
        id: this.generateId(),
        pattern,
        frequency,
        learnedAt: new Date()
      });
    }
    
    this.store.set('behaviorPatterns', patterns);
  }
  
  private getBehaviorPatterns() {
    return this.store.get('behaviorPatterns', []) as Array<{
      id: string;
      pattern: string;
      frequency: number;
      learnedAt: Date;
    }>;
  }
  
  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
