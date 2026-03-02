const fs = require('fs');
const buffer = fs.readFileSync('public/assets/logo.jpg');
console.log('Magic bytes:', buffer.toString('hex', 0, 4));
