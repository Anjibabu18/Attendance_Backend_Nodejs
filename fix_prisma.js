const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else { 
      if(file.endsWith('.ts')) results.push(file);
    }
  });
  return results;
}

const files = walk('./src');
files.forEach(f => {
  if (f.endsWith('prisma.ts') || f.endsWith('prisma.js')) return;
  let content = fs.readFileSync(f, 'utf8');
  if (content.includes('new PrismaClient(')) {
    // Determine relative path to src/prisma.ts
    // e.g., if file is src/controllers/auth.ts, depth is 1, so '../prisma'
    // Actually path.sep can be \\ on Windows.
    const parts = f.split(path.sep);
    const depth = parts.length - 2; 
    const relPath = depth === 0 ? './prisma' : '../'.repeat(depth) + 'prisma';
    
    // Replace const prisma = new PrismaClient();
    content = content.replace(/const\s+prisma\s*=\s*new\s+PrismaClient\(\s*\);/g, '');
    
    // Clean up PrismaClient from imports
    content = content.replace(/import\s+\{([^}]*)\} from '@prisma\/client';/g, (match, p1) => {
      const parts = p1.split(',').map(s => s.trim()).filter(s => s !== 'PrismaClient' && s.length > 0);
      if (parts.length === 0) return '';
      return `import { ${parts.join(', ')} } from '@prisma/client';`;
    });
    
    // Add import prisma from '...';
    content = `import prisma from '${relPath}';\n` + content;
    
    fs.writeFileSync(f, content);
    console.log('Fixed ' + f);
  }
});
