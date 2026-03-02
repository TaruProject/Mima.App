const fs = require('fs');
const stats = fs.statSync('public/assets/logo.jpg');
console.log('Size:', stats.size);
