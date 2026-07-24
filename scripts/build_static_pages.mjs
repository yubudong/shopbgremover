import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '.pages-dist');

const rootFiles = [
  '404.html',
  'admin-vouchers.html',
  'admin-referrals.html',
  'amazon-ebay-product-images.html',
  'contact.html',
  'favicon.svg',
  'index.html',
  'local-cleaner.css',
  'local-cleaner.js',
  'local-cleaner-worker.js',
  'local-inpaint-core.mjs',
  'pricing.html',
  'privacy.html',
  'redeem.html',
  'referrals-localized.css',
  'referrals-localized.js',
  'referrals.html',
  'robots.txt',
  'shopify-background-remover.html',
  'sitemap.xml',
  'terms.html',
];

const publicAssets = [
  'Logo256.png',
  'android-chrome-192x192.png',
  'android-chrome-512x512.png',
  'apple-touch-icon.png',
  'favicon-16x16.png',
  'favicon-32x32.png',
  'favicon.ico',
  'logo1200.png',
  'logo32.png',
  'site.webmanifest',
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of rootFiles) {
  await cp(path.join(root, file), path.join(output, file));
}

for (const locale of ['de', 'es', 'fr', 'pt-br']) {
  await cp(path.join(root, locale), path.join(output, locale), {
    recursive: true,
  });
}

for (const asset of publicAssets) {
  await cp(path.join(root, 'public', asset), path.join(output, asset));
}

await cp(path.join(root, 'public', 'photo'), path.join(output, 'photo'), {
  recursive: true,
});

async function countFiles(directory) {
  let count = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      count += await countFiles(path.join(directory, entry.name));
    } else {
      count += 1;
    }
  }
  return count;
}

console.log(`Built ${await countFiles(output)} static files in ${output}`);
