import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const OUT = path.resolve(outIndex >= 0 && args[outIndex + 1] ? args[outIndex + 1] : path.join(ROOT, 'dist-cpanel'));

if (OUT === ROOT || ROOT.startsWith(OUT + path.sep)) {
  console.error(`Refusing to empty ${OUT}`);
  process.exit(1);
}

const build = spawnSync('npm run build', { cwd: ROOT, shell: true, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

fs.copyFileSync(path.join(ROOT, 'app.cjs'), path.join(OUT, 'app.cjs'));
fs.cpSync(path.join(ROOT, 'server', 'src'), path.join(OUT, 'server', 'src'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'server', 'package.json'), path.join(OUT, 'server', 'package.json'));

const sample = path.join(ROOT, 'server', 'fixtures', 'sample.mp4');
if (fs.existsSync(sample)) {
  fs.mkdirSync(path.join(OUT, 'server', 'fixtures'), { recursive: true });
  fs.copyFileSync(sample, path.join(OUT, 'server', 'fixtures', 'sample.mp4'));
}

fs.cpSync(path.join(ROOT, 'web', 'dist'), path.join(OUT, 'web', 'dist'), { recursive: true });

const serverPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'package.json'), 'utf8'));
const pkg = {
  name: 'dramora',
  version: serverPkg.version,
  private: true,
  main: 'app.cjs',
  scripts: { start: 'node app.cjs' },
  engines: { node: '>=22' },
  dependencies: serverPkg.dependencies,
};
fs.writeFileSync(path.join(OUT, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

fs.writeFileSync(
  path.join(OUT, 'README-cpanel.txt'),
  [
    'Dramora on cPanel (Setup Node.js App)',
    '',
    '1. Upload this folder to /home/<user>/dramora (not inside public_html), or upload a zip and extract it there.',
    '2. cPanel > Setup Node.js App > Create Application:',
    '   Node.js version: 22',
    '   Application mode: Production',
    '   Application root: dramora',
    '   Application URL: your domain or subdomain',
    '   Application startup file: app.cjs',
    '3. Environment variables:',
    '   DATA_DIR=/home/<user>/dramora-data',
    '   PUBLIC_URL=https://your.domain',
    '   NODE_ENV=production',
    '4. Click "Run NPM Install" (better-sqlite3 downloads a prebuilt binary for linux x64).',
    '5. Click Start (or Restart), then open the application URL and complete setup.',
    '',
    'Updating: upload the new files over this folder, click "Run NPM Install" if dependencies changed, then Restart.',
    '',
  ].join('\n')
);

console.log(`cPanel bundle written to ${OUT}`);
