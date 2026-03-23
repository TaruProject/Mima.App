(async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const childProcess = await import('node:child_process');
  const url = await import('node:url');

  console.log('===========================================');
  console.log('MIMA HOSTINGER BOOTSTRAP');
  console.log('===========================================');
  console.log(`Node Version: ${process.version}`);
  console.log(`Initial CWD: ${process.cwd()}`);

  const roots = Array.from(
    new Set([
      process.cwd(),
      path.resolve(process.cwd(), '..'),
    ]),
  );

  const resolveCandidate = (relativePath) =>
    roots
      .map((root) => ({
        root,
        absolutePath: path.join(root, relativePath),
      }))
      .find((candidate) => fs.existsSync(candidate.absolutePath));

  const builtServer = resolveCandidate(path.join('dist-server', 'server.js'));
  const sourceServer = resolveCandidate('server.ts');

  if (builtServer) {
    console.log(`Starting compiled server from ${builtServer.absolutePath}`);
    process.chdir(builtServer.root);
    await import(url.pathToFileURL(builtServer.absolutePath).href);
    return;
  }

  if (sourceServer) {
    console.warn('Compiled server not found. Falling back to tsx server.ts.');
    process.chdir(sourceServer.root);

    const child = childProcess.spawn('npx', ['tsx', 'server.ts'], {
      cwd: sourceServer.root,
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        NODE_ENV: process.env.NODE_ENV || 'production',
      },
    });

    child.on('error', (error) => {
      console.error('Failed to start fallback tsx process:', error);
      process.exit(1);
    });

    child.on('exit', (code) => {
      console.log(`Server process exited with code ${code ?? 0}`);
      process.exit(code ?? 0);
    });
    return;
  }

  console.error('No compiled server or server.ts entrypoint could be found.');
  process.exit(1);
})().catch((error) => {
  console.error('Bootstrap failure:', error);
  process.exit(1);
});
