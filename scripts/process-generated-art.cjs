// Converts locally generated chroma-key concept art into compact transparent game assets.
const fs = require('node:fs');
const path = require('node:path');
let sharp;
try {
  sharp = require('sharp');
} catch {
  // Codex desktop ships Sharp outside the workspace dependency tree.
  sharp = require('C:/Users/jsh20/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
}

const ROOT = path.resolve(__dirname, '..');
const GENERATED = path.join(
  'C:',
  'Users',
  'jsh20',
  '.codex',
  'generated_images',
  '019feeae-450b-7943-834e-879e097fc78d',
);
const OUT = path.join(ROOT, 'public', 'assets', 'art');

const files = {
  weapons: 'exec-ed98e82d-c506-42dc-a19c-302bb222213f.png',
  secondaries: 'exec-394d3e0f-fb81-47c5-b123-b5780a299f54.png',
  kestrel: 'exec-7054e406-d74e-4fbb-a038-f89b11fa111b.png',
  vulcan: 'exec-434e8705-3d40-4311-b4c0-6f834b374135.png',
  helios: 'exec-c90b046e-0bf2-4e5b-bd22-01ed43693495.png',
  crimson: 'exec-7a44172b-67f4-440a-ae70-5e70ab04efe1.png',
  nova: 'exec-7c8dbf65-2fa4-4079-961f-e1fa92ce757f.png',
  snail: 'exec-d3ff6d3c-6336-49fa-9332-30c82cbe02c8.png',
  snailShell: 'exec-48f3a38d-475e-4aca-bcad-ab33b9632e55.png',
};

function source(name) {
  return path.join(GENERATED, files[name]);
}

async function chromaBuffer(input, extract) {
  let pipeline = sharp(input);
  if (extract) pipeline = pipeline.extract(extract);
  const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const dominance = g - Math.max(r, b);
    if (g > 70 && dominance > 22) {
      const edgeAlpha = Math.max(0, Math.min(1, (74 - dominance) / 52));
      data[i + 3] = Math.round(data[i + 3] * edgeAlpha);
      // Suppress the chroma fringe while retaining cyan/amber emissive edges.
      data[i + 1] = Math.min(g, Math.round(Math.max(r, b) * 1.08));
    }
  }
  return { data, info };
}

async function writeTransparent(input, output, width, height, extract) {
  const { data, info } = await chromaBuffer(input, extract);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const trimmed = await sharp(data, { raw: info })
    .png()
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 2 })
    .toBuffer();
  await sharp(trimmed)
    .resize(width, height, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .ensureAlpha()
    .linear([1, 1, 1, 1], [0, 0, 0, 0])
    .webp({ quality: 90, alphaQuality: 100, smartSubsample: true, effort: 6 })
    .toFile(output);
  const meta = await sharp(output).metadata();
  console.log(`${path.relative(ROOT, output)} ${meta.width}x${meta.height}`);
}

async function main() {
  const weaponMeta = await sharp(source('weapons')).metadata();
  const cellW = Math.floor(weaponMeta.width / 4);
  const cellH = Math.floor(weaponMeta.height / 2);
  const weaponNames = ['pulse', 'vulcan', 'missile', 'proton', 'laser', 'light', 'rail', 'scatter'];
  for (let index = 0; index < weaponNames.length; index++) {
    const col = index % 4;
    const row = Math.floor(index / 4);
    await writeTransparent(
      source('weapons'),
      path.join(OUT, 'equipment', `primary-${weaponNames[index]}.webp`),
      320,
      320,
      { left: col * cellW, top: row * cellH, width: cellW, height: cellH },
    );
  }

  const secondaryNames = [
    'secondary-microgun',
    'secondary-tail-cannon',
    'secondary-side-cutter',
    'secondary-seeker-rack',
    'secondary-arc-satellite',
    'secondary-plasma-pods',
    'secondary-mine-layer',
    'secondary-drone-swarm',
  ];
  const secondaryMeta = await sharp(source('secondaries')).metadata();
  const secondaryCellW = Math.floor(secondaryMeta.width / 4);
  const secondaryCellH = Math.floor(secondaryMeta.height / 2);
  for (let index = 0; index < secondaryNames.length; index++) {
    await writeTransparent(
      source('secondaries'),
      path.join(OUT, 'equipment', `${secondaryNames[index]}.webp`),
      320,
      320,
      {
        left: (index % 4) * secondaryCellW,
        top: Math.floor(index / 4) * secondaryCellH,
        width: secondaryCellW,
        height: secondaryCellH,
      },
    );
  }

  const bosses = [
    ['kestrel', 576, 860],
    ['vulcan', 652, 940],
    ['helios', 636, 920],
    ['crimson', 684, 1520],
    ['nova', 700, 1020],
    ['snail', 600, 900],
    ['snailShell', 492, 702],
  ];
  for (const [name, width, height] of bosses) {
    const filename =
      name === 'snailShell'
        ? 'boss-snail-shell-v2.webp'
        : name === 'snail'
          ? 'boss-snail-v2.webp'
          : `boss-warship-${name}.webp`;
    await writeTransparent(source(name), path.join(OUT, 'bosses', filename), width, height);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
