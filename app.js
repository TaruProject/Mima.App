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

  const getBuiltServer = () => resolveCandidate(path.join('dist-server', 'server.js'));
  const getBuiltClient = () =>
    resolveCandidate(path.join('dist', 'index.html')) ||
    resolveCandidate(path.join('public_html', 'index.html'));
  const getSourceServer = () => resolveCandidate('server.ts');
  const getProjectRoot = () => resolveCandidate('package.json');
  const getNodeModules = () => resolveCandidate('node_modules');

  const runCommand = (command, args, cwd, label) =>
    new Promise((resolve, reject) => {
      console.log(`${label}: ${command} ${args.join(' ')}`);

      const child = childProcess.spawn(command, args, {
        cwd,
        stdio: 'inherit',
        shell: true,
        env: {
          ...process.env,
          NODE_ENV: process.env.NODE_ENV || 'production',
        },
      });

      child.on('error', (error) => {
        reject(error);
      });

      child.on('exit', (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(`${label} failed with exit code ${code ?? 0}`));
      });
    });

  const ensureRuntimeArtifacts = async () => {
    const projectRoot = getProjectRoot();

    if (!projectRoot) {
      console.warn('package.json not found. Skipping dependency/build checks.');
      return;
    }

    if (!getNodeModules()) {
      console.warn('node_modules not found. Installing dependencies before startup.');
      await runCommand('npm', ['install'], projectRoot.root, 'Dependency install');
    }

    if (getBuiltServer() && getBuiltClient()) {
      return;
    }

    console.warn('Production artifacts are missing. Running npm run build before startup.');
    await runCommand('npm', ['run', 'build'], projectRoot.root, 'Project build');
  };

  const startSourceServer = (candidate) => {
    console.warn('Starting source server with tsx fallback.');
    process.chdir(candidate.root);

    const child = childProcess.spawn('npx', ['tsx', 'server.ts'], {
      cwd: candidate.root,
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
  };

  await ensureRuntimeArtifacts();

  const builtServer = getBuiltServer();
  const sourceServer = getSourceServer();

  if (builtServer) {
    console.log(`Starting compiled server from ${builtServer.absolutePath}`);

    try {
      process.chdir(builtServer.root);
      await import(url.pathToFileURL(builtServer.absolutePath).href);
      return;
    } catch (error) {
      console.error('Compiled server failed to start:', error);

      if (!sourceServer) {
        throw error;
      }

      console.warn('Compiled server failed. Falling back to server.ts.');
    }
  }

  if (sourceServer) {
    startSourceServer(sourceServer);
    return;
  }

  console.error('No compiled server or server.ts entrypoint could be found.');
  process.exit(1);
})().catch((error) => {
  console.error('Bootstrap failure:', error);
  process.exit(1);
});
