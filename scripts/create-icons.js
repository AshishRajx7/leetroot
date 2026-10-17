const fs = require('fs');
const path = require('path');

// Simple 1x1 orange PNG base64 to ensure valid PNG file structure
// \x89PNG\r\n\x1a\n...
const png1x1Base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const iconBuffer = Buffer.from(png1x1Base64, 'base64');

const iconsDir = path.join(__dirname, '..', 'extension', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

fs.writeFileSync(path.join(iconsDir, 'icon16.png'), iconBuffer);
fs.writeFileSync(path.join(iconsDir, 'icon48.png'), iconBuffer);
fs.writeFileSync(path.join(iconsDir, 'icon128.png'), iconBuffer);

// Also create an SVG icon for crisp rendering
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#d97706" />
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="22" fill="#0f172a" />
  <path d="M 50 16 L 80 34 L 80 66 L 50 84 L 20 66 L 20 34 Z" fill="none" stroke="url(#grad)" stroke-width="5" />
  <circle cx="50" cy="35" r="7" fill="#f59e0b" />
  <circle cx="34" cy="62" r="6" fill="#10b981" />
  <circle cx="66" cy="62" r="6" fill="#3b82f6" />
  <line x1="50" y1="35" x2="34" y2="62" stroke="#64748b" stroke-width="3" />
  <line x1="50" y1="35" x2="66" y2="62" stroke="#64748b" stroke-width="3" />
  <line x1="34" y1="62" x2="66" y2="62" stroke="#64748b" stroke-width="3" />
</svg>`;
fs.writeFileSync(path.join(iconsDir, 'icon.svg'), svgContent);

console.log('Icons generated successfully in extension/icons/');
