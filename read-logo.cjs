const fs = require('fs');
console.log('logo.jpg:', fs.readFileSync('public/assets/logo.jpg', 'utf8').substring(0, 50));
