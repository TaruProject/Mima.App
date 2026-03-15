const fs = require('fs');
const files = ['public/assets/logo.jpg', 'public/assets/mima-logo.jpg', 'public/assets/mima-logo.png'];
files.forEach(file => {
  try {
    const buf = fs.readFileSync(file);
    console.log(`${file}:`, buf.slice(0, 10).toString('hex'));
  } catch (e) {
    console.log(`${file}: Error`, e.message);
  }
});
