const fs = require('fs');
console.log('mima-logo.jpg:', fs.readFileSync('public/assets/mima-logo.jpg', 'utf8').substring(0, 50));
console.log('mima-logo.png:', fs.readFileSync('public/assets/mima-logo.png', 'utf8').substring(0, 50));
