import open from 'open';
import path from 'path';
import { access } from 'fs/promises';

const OUTPUT_DIR = path.resolve('output');

export async function openBrowser({ path: filePath }) {
  if (!filePath) throw new Error('path is required');

  const abs = path.resolve(OUTPUT_DIR, filePath);

  // Security check
  if (!abs.startsWith(OUTPUT_DIR)) {
    throw new Error('Access denied: path outside output directory');
  }

  // Verify file exists
  try {
    await access(abs);
  } catch {
    throw new Error(`File not found: ${filePath}`);
  }

  // Open in browser
  const fileUrl = `file:///${abs.replace(/\\/g, '/')}`;
  await open(fileUrl);

  return `Opened ${fileUrl} in your default browser`;
}
