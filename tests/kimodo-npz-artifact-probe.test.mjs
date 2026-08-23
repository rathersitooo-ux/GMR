import assert from 'node:assert/strict';
import test from 'node:test';
import { gitBlobSha, inspectNpz, parseNpyHeader } from '../tools/kimodo-npz-artifact-probe.mjs';

function makeNpy(shape, descr = '<f4') {
  const dict = `{'descr': '${descr}', 'fortran_order': False, 'shape': (${shape.join(', ')}${shape.length === 1 ? ',' : ''}), }`;
  const preambleLength = 10;
  const padding = (16 - ((preambleLength + dict.length + 1) % 16)) % 16;
  const header = `${dict}${' '.repeat(padding)}\n`;
  const bytesPerElement = 4;
  const elements = shape.reduce((product, value) => product * value, 1);
  const result = Buffer.alloc(preambleLength + header.length + elements * bytesPerElement);
  result[0] = 0x93;
  result.write('NUMPY', 1, 'ascii');
  result[6] = 1;
  result[7] = 0;
  result.writeUInt16LE(header.length, 8);
  result.write(header, 10, 'latin1');
  return result;
}

function makeStoredZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, payload] of entries) {
    const fileName = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(payload.length, 22);
    local.writeUInt16LE(fileName.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, fileName, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(payload.length, 24);
    central.writeUInt16LE(fileName.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, fileName);
    offset += local.length + fileName.length + payload.length;
  }
  const centralBytes = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBytes, eocd]);
}

test('gitBlobSha matches Git empty-blob identity', () => {
  assert.equal(gitBlobSha(Buffer.alloc(0)), 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
});

test('parseNpyHeader reads dtype, order, and shape', () => {
  const parsed = parseNpyHeader(makeNpy([2, 3, 4]));
  assert.equal(parsed.descr, '<f4');
  assert.equal(parsed.fortranOrder, false);
  assert.deepEqual(parsed.shape, [2, 3, 4]);
});

test('inspectNpz proves required Kimodo arrays are present', () => {
  const archive = makeStoredZip([
    ['posed_joints.npy', makeNpy([10, 52, 3])],
    ['global_rot_mats.npy', makeNpy([10, 52, 3, 3])],
    ['local_rot_mats.npy', makeNpy([10, 52, 3, 3])],
    ['foot_contacts.npy', makeNpy([10, 4])],
    ['root_positions.npy', makeNpy([10, 3])],
    ['global_root_heading.npy', makeNpy([10])],
  ]);
  const inspected = inspectNpz(archive);
  assert.deepEqual(inspected.missingKeys, []);
  assert.deepEqual(inspected.arrays.posed_joints.shape, [10, 52, 3]);
});
