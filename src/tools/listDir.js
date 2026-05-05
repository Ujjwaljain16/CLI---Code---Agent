import { readdir, stat } from 'fs/promises';
import path from 'path';

const OUTPUT_DIR = path.resolve('output');

export async function listDir({ path: subPath = '' } = {}) {
  const abs = path.resolve(OUTPUT_DIR, subPath);

  // Security check
  if (!abs.startsWith(OUTPUT_DIR)) {
    throw new Error('Access denied: path outside output directory');
  }

  try {
    const files = await readdir(abs);
    const detailed = await Promise.all(
      files.map(async (name) => {
        const filePath = path.join(abs, name);
        const stats = await stat(filePath);
        return {
          name,
          type: stats.isDirectory() ? 'dir' : 'file',
          size: stats.size,
        };
      })
    );
    return detailed;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}
