const fs = require('fs');
const s = fs.readFileSync('js/main.js', 'utf8');
const ids = [...new Set([...s.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]))];
const qs = [...new Set([...s.matchAll(/querySelector(?:All)?\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]))];
console.log('=== ids (' + ids.length + ') ===');
console.log(ids.join(' '));
console.log('=== querySelector (' + qs.length + ') ===');
console.log(qs.join(' | '));
