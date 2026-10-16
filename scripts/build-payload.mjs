// Maintainer tool: source must be a reviewed, isolated upstream working tree.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/build-payload.mjs <reviewed-upstream-working-tree>');
const output = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../payload');
const git = (...args) => {
  const result = spawnSync('git', args, { cwd: source, maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr.toString());
  return result.stdout;
};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const baseline = '66a24ea7df2435ef897c48c147deb7ec572c01c2';
if (git('rev-parse', 'HEAD').toString().trim() !== baseline) throw new Error('Unexpected upstream baseline');
const files = git('diff', '--name-only', '-z', 'HEAD').toString().split('\0').filter(Boolean)
  .filter(name => name !== 'package.json' && !/(?:^|\/)(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/.test(name));
if (!files.length) throw new Error('No reviewed tracked/intent-to-add changes');
for (const name of files) {
  if (!/^(?:src\/|server\/|public\/|index\.html$|\.gitignore$|\.env\.example$)/.test(name) || /(?:sqlite|vapid\.json|^\.tmp\/)/i.test(name)) throw new Error(`Unexpected payload file: ${name}`);
}
const patch = git('diff', '--binary', '--full-index', 'HEAD', '--', ...files);
const manifest = {
  schema: 1, id: 'claw-mobile-remote', version: '1.0.0',
  upstream: { repository: 'https://github.com/GreenSheep01201/claw-empire', commit: baseline, version: '2.0.4' },
  patch: 'mobile-remote.patch', patch_sha256: sha(patch),
  files: files.map(name => {
    const previous = spawnSync('git', ['show', `${baseline}:${name}`], { cwd: source, maxBuffer: 8 * 1024 * 1024 });
    return { path: name, before: previous.status === 0 ? sha(previous.stdout) : null,
      after: fs.existsSync(path.join(source, name)) ? sha(fs.readFileSync(path.join(source, name))) : null };
  }),
  dependencies: { runtime: { 'web-push': '^3.6.7', qrcode: '^1.5.4' },
    dev: { '@types/web-push': '^3.6.4', '@types/qrcode': '^1.5.6' } }
};
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, manifest.patch), patch);
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Built ${files.length}-file payload (${patch.length} bytes)`);
