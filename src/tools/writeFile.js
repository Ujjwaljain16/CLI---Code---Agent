import { writeFile as fsWrite, mkdir } from 'fs/promises';
import path from 'path';

const OUTPUT_DIR = path.resolve('output');

export async function writeFile(args) {
  const filePath = args.path || args.file_path || args.filename || args.file;
  const content = args.content;
  if (!filePath) throw new Error('path is required');
  if (content === undefined || content === null) throw new Error('content is required');

  const abs = path.resolve(OUTPUT_DIR, filePath);

  // Security check: prevent path traversal
  if (!abs.startsWith(OUTPUT_DIR)) {
    throw new Error('Access denied: path outside output directory');
  }

  const dir = path.dirname(abs);

  // Ensure directory exists
  await mkdir(dir, { recursive: true });

  // Write file
  await fsWrite(abs, content, 'utf-8');

  return `Written: output/${filePath} (${content.length} characters)`;
}
