const http = require('http');

console.log('--- DIAGNOSTIC START ---');
console.log('Node Version:', process.version);
console.log('CWD:', process.cwd());
console.log('Env:', JSON.stringify(process.env, (key, value) => {
  if (key.includes('KEY') || key.includes('SECRET')) return '***';
  return value;
}, 2));

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(`Mima App Diagnostic\nNode: ${process.version}\nCWD: ${process.cwd()}\n`);
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Diagnostic server running on ${port}`);
});
