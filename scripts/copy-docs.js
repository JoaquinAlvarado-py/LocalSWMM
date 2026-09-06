const fs = require('fs');
const path = require('path');

const src = path.resolve('docs/.vitepress/dist');
const dest = path.resolve('public/docs');

if (fs.existsSync(src)) {
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log(`Successfully copied ${src} -> ${dest}`);
} else {
  console.warn(`Source directory ${src} does not exist.`);
}
