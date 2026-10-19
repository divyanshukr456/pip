import sharp from 'sharp';

async function createCutout() {
  const { data, info } = await sharp('src/assets/pip.jpg').raw().toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;
  const channels = info.channels;

  const out = Buffer.alloc(width * height * 4);
  const bgR = 249, bgG = 240, bgB = 223;

  function colorDist(idx) {
    const r = data[idx], g = data[idx + 1], b = data[idx + 2];
    const dr = r - bgR, dg = g - bgG, db = b - bgB;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0, tail = 0;

  // Background threshold: pure background is dist < 4.0. We use 8.0 so it never breaches cap or cloud.
  const threshold = 8.0;

  // Push border pixels
  for (let x = 0; x < width; x++) {
    let topIdx = x * channels;
    if (colorDist(topIdx) <= threshold) {
      visited[x] = 1;
      queue[tail++] = x;
    }
    let bIdx = ((height - 1) * width + x);
    if (colorDist(bIdx * channels) <= threshold) {
      visited[bIdx] = 1;
      queue[tail++] = bIdx;
    }
  }

  for (let y = 0; y < height; y++) {
    let lIdx = y * width;
    if (visited[lIdx] === 0 && colorDist(lIdx * channels) <= threshold) {
      visited[lIdx] = 1;
      queue[tail++] = lIdx;
    }
    let rIdx = y * width + (width - 1);
    if (visited[rIdx] === 0 && colorDist(rIdx * channels) <= threshold) {
      visited[rIdx] = 1;
      queue[tail++] = rIdx;
    }
  }

  // BFS
  while (head < tail) {
    const cur = queue[head++];
    const cx = cur % width;
    const cy = Math.floor(cur / width);

    const neighbors = [
      cy > 0 ? cur - width : -1,
      cy < height - 1 ? cur + width : -1,
      cx > 0 ? cur - 1 : -1,
      cx < width - 1 ? cur + 1 : -1
    ];

    for (const n of neighbors) {
      if (n !== -1 && visited[n] === 0) {
        if (colorDist(n * channels) <= threshold) {
          visited[n] = 1;
          queue[tail++] = n;
        }
      }
    }
  }

  // Build RGBA output with smooth edge transition
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pIdx = y * width + x;
      const srcIdx = pIdx * channels;
      const dstIdx = pIdx * 4;

      out[dstIdx] = data[srcIdx];
      out[dstIdx + 1] = data[srcIdx + 1];
      out[dstIdx + 2] = data[srcIdx + 2];

      if (visited[pIdx] === 1) {
        out[dstIdx + 3] = 0;
      } else {
        // Check if on border with background
        let isBorder = false;
        for (let dy = -1; dy <= 1 && !isBorder; dy++) {
          for (let dx = -1; dx <= 1 && !isBorder; dx++) {
            const ny = y + dy, nx = x + dx;
            if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
              if (visited[ny * width + nx] === 1) {
                isBorder = true;
              }
            }
          }
        }

        if (isBorder) {
          const d = colorDist(srcIdx);
          // Transition alpha smoothly between threshold (8.0) and 18.0
          const alpha = Math.min(1, Math.max(0.15, (d - 6.0) / 10.0));
          out[dstIdx + 3] = Math.round(255 * alpha);
        } else {
          out[dstIdx + 3] = 255;
        }
      }
    }
  }

  await sharp(out, { raw: { width, height, channels: 4 } })
    .png()
    .toFile('src/assets/pip-transparent.png');

  await sharp(out, { raw: { width, height, channels: 4 } })
    .png()
    .toFile('public/pip-transparent.png');

  console.log('Successfully regenerated pip-transparent.png with clean edges!');
}

createCutout().catch(console.error);
