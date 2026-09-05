const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../apps/mobile/node_modules/image-size/dist/types');
// Each synthetic hostile parser case runs in a killable child, never on a server.
const cases = [
  ['icns', `const b=Buffer.alloc(24);b.write('icns');b.writeUInt32BE(24,4);b.write('ic07',8);return b;`],
  ['icns', `const b=Buffer.alloc(24);b.write('icns');b.writeUInt32BE(24,4);b.write('ic07',8);b.writeUInt32BE(0xffffffff,12);return b;`],
  ['jxl', `const b=Buffer.alloc(32);b.writeUInt32BE(12);b.write('JXL ',4);b.writeUInt32BE(12,12);b.write('ftyp',16);b.write('jxl ',20);b.write('jxlp',28);return b;`],
  ['heif', `const b=Buffer.alloc(24);b.writeUInt32BE(16);b.write('ftyp',4);b.write('heic',8);b.write('meta',20);return b;`],
];
for (const [name, make] of cases) {
  const script = `const parser=require(${JSON.stringify(path.join(root, name + '.js'))});const input=(()=>{${make}})();try{parser[Object.keys(parser)[0]].calculate(input);process.exit(2)}catch{process.exit(0)}`;
  const result = spawnSync(process.execPath, ['-e', script], { timeout: 2000, encoding: 'utf8' });
  assert.equal(result.error, undefined, name + ' parser must not hang');
  assert.equal(result.status, 0, name + ' malformed input must be rejected');
}
const imageSize = require('../apps/mobile/node_modules/image-size');
const png=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489','hex');
assert.equal(imageSize(png).width,1);
assert.equal(imageSize(png).height,1);
console.log('Four malicious image container cases rejected; normal PNG preserved.');
