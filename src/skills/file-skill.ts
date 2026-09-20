/**
 * 文件处理技能 - 读写、转换、组织各类文档
 */

import * as fs from 'fs';
import * as path from 'path';

export interface FileOperationResult {
  success: boolean;
  message: string;
  data?: any;
}

export class FileSkill {
  private authorizedPaths: Set<string> = new Set();
  
  /**
   * 注册授权路径
   */
  authorizePath(path: string): void {
    this.authorizedPaths.add(path);
  }
  
  /**
   * 检查路径是否已授权
   */
  isAuthorized(filePath: string): boolean {
    const resolvedPath = path.resolve(filePath);
    return Array.from(this.authorizedPaths).some(authPath => 
      resolvedPath.startsWith(path.resolve(authPath))
    );
  }
  
  /**
   * 读取文件内容
   */
  readFile(filePath: string, encoding: BufferEncoding = 'utf-8'): FileOperationResult {
    try {
      if (!this.isAuthorized(filePath)) {
        return { success: false, message: 'Path not authorized' };
      }
      
      const content = fs.readFileSync(filePath, encoding);
      return { success: true, message: 'File read successfully', data: content };
    } catch (error) {
      return { success: false, message: `Failed to read file: ${error}` };
    }
  }
  
  /**
   * 写入文件
   */
  writeFile(filePath: string, content: string, encoding: BufferEncoding = 'utf-8'): FileOperationResult {
    try {
      if (!this.isAuthorized(filePath)) {
        return { success: false, message: 'Path not authorized' };
      }
      
      // 确保目录存在
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(filePath, content, encoding);
      return { success: true, message: 'File written successfully' };
    } catch (error) {
      return { success: false, message: `Failed to write file: ${error}` };
    }
  }
  
  /**
   * 列出目录内容
   */
  listDirectory(dirPath: string, recursive: boolean = false): FileOperationResult {
    try {
      if (!this.isAuthorized(dirPath)) {
        return { success: false, message: 'Path not authorized' };
      }
      
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const files = entries.map(entry => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        path: path.join(dirPath, entry.name)
      }));
      
      if (recursive) {
        const allFiles: any[] = [];
        const traverse = (currentPath: string) => {
          const items = fs.readdirSync(currentPath);
          items.forEach(item => {
            const itemPath = path.join(currentPath, item);
            const stats = fs.statSync(itemPath);
            allFiles.push({
              name: item,
              type: stats.isDirectory() ? 'directory' : 'file',
              path: itemPath
            });
            if (stats.isDirectory()) {
              traverse(itemPath);
            }
          });
        };
        traverse(dirPath);
        return { success: true, message: 'Directory listed recursively', data: allFiles };
      }
      
      return { success: true, message: 'Directory listed', data: files };
    } catch (error) {
      return { success: false, message: `Failed to list directory: ${error}` };
    }
  }
  
  /**
   * 按类型分类文件
   */
  classifyByType(dirPath: string): FileOperationResult {
    try {
      if (!this.isAuthorized(dirPath)) {
        return { success: false, message: 'Path not authorized' };
      }
      
      const files = fs.readdirSync(dirPath);
      const classified: Record<string, string[]> = {};
      
      files.forEach(file => {
        const ext = path.extname(file).toLowerCase();
        if (!classified[ext]) {
          classified[ext] = [];
        }
        classified[ext].push(file);
      });
      
      return { success: true, message: 'Files classified by type', data: classified };
    } catch (error) {
      return { success: false, message: `Failed to classify files: ${error}` };
    }
  }
  
  /**
   * 移动或重命名文件
   */
  moveFile(sourcePath: string, destPath: string): FileOperationResult {
    try {
      if (!this.isAuthorized(sourcePath) || !this.isAuthorized(destPath)) {
        return { success: false, message: 'Path not authorized' };
      }
      
      fs.renameSync(sourcePath, destPath);
      return { success: true, message: 'File moved successfully' };
    } catch (error) {
      return { success: false, message: `Failed to move file: ${error}` };
    }
  }
  
  /**
   * 删除文件
   */
  deleteFile(filePath: string): FileOperationResult {
    try {
      if (!this.isAuthorized(filePath)) {
        return { success: false, message: 'Path not authorized' };
      }
      
      fs.unlinkSync(filePath);
      return { success: true, message: 'File deleted successfully' };
    } catch (error) {
      return { success: false, message: `Failed to delete file: ${error}` };
    }
  }
  
  /**
   * 创建目录
   */
  createDirectory(dirPath: string): FileOperationResult {
    try {
      if (!this.isAuthorized(dirPath)) {
        return { success: false, message: 'Path not authorized' };
      }
      
      fs.mkdirSync(dirPath, { recursive: true });
      return { success: true, message: 'Directory created successfully' };
    } catch (error) {
      return { success: false, message: `Failed to create directory: ${error}` };
    }
  }
}
