/* image-size 1.2.1 has no published advisory-free compatible release.
 * Fail closed on malformed ICNS/ISO boxes; keep this reproducible after npm ci.
 * GHSA-w3rx-r6r6-pgpr, GHSA-5p2g-fcmc-qvqq. Remove after an upstream fix. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.dirname(require.resolve('image-size/package.json'));
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
if (version !== '1.2.1') throw new Error('Review image-size security patch for version ' + version);

function patch(file, marker, transform) {
  const location = path.join(root, 'dist/types', file);
  const original = fs.readFileSync(location, 'utf8');
  if (original.includes(marker)) return;
  const fixed = transform(original);
  if (fixed === original || !fixed.includes(marker)) throw new Error('Unexpected image-size source: ' + file);
  fs.writeFileSync(location, fixed);
}
patch('utils.js', 'LOGIVYA_IMAGE_BOX_BOUNDS', source => source
  .replace('if (input.length - offset < 4)', 'if (!Number.isSafeInteger(offset) || offset < 0 || input.length - offset < 8)')
  .replace('if (input.length - offset < boxSize)', '// LOGIVYA_IMAGE_BOX_BOUNDS: a matched zero-sized box can otherwise loop in JXL.\n    if (!Number.isSafeInteger(boxSize) || boxSize < 8 || input.length - offset < boxSize)'));
patch('icns.js', 'LOGIVYA_ICNS_ENTRY_BOUNDS', source => source.replace(
  'const imageLengthOffset = imageOffset + ENTRY_LENGTH_OFFSET;',
  `// LOGIVYA_ICNS_ENTRY_BOUNDS: every entry must make bounded forward progress.
    if (!Number.isSafeInteger(imageOffset) || imageOffset < 8 || imageOffset + 8 > input.length)
        throw new TypeError('Invalid ICNS entry header');
    const imageLengthOffset = imageOffset + ENTRY_LENGTH_OFFSET;
    const entrySize = (0, utils_1.readUInt32BE)(input, imageLengthOffset);
    if (!Number.isSafeInteger(entrySize) || entrySize < 8 || entrySize > input.length - imageOffset)
        throw new TypeError('Invalid ICNS entry length');`));
console.log('image-size malformed container guards verified (1.2.1).');
