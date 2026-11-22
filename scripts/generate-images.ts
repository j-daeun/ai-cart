/**
 * scripts/generate-images.ts
 * sharp로 썸네일(200장) + 긴 상세(15장) 이미지를 로컬 임시 디렉토리에 생성.
 * seed.ts 내부에서 호출됨.
 *
 * 용량 목표:
 *   - 썸네일 800×800 JPEG 95%: 장당 수백 KB (노이즈로 JPEG 압축 차단)
 *   - 긴 상세 800×5000 JPEG 90%: 장당 수 MB
 *
 * 결정론 (SC-002): 모든 픽셀값은 seed + 이미지 인덱스 기반 xorshift32 PRNG로 생성.
 */

import sharp from "sharp";
import path from "path";
import fs from "fs";

export interface GeneratedImage {
  localPath: string;
  storagePath: string;
  type: "thumbnail" | "detail";
}

// ---------------------------------------------------------------------------
// 결정론적 PRNG — xorshift32
// ---------------------------------------------------------------------------
function makeRng(seed: number): () => number {
  // xorshift32: seed 0은 허용하지 않음
  let x = (seed ^ 0xdeadbeef) >>> 0;
  if (x === 0) x = 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 0x100000000;
  };
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

// 카테고리별 썸네일 베이스 색
const THUMBNAIL_BASE: [number, number, number][] = [
  [220, 160, 120], // tops — 테라코타
  [100, 150, 220], // bottoms — 인디고
  [80, 160, 100], // outerwear — 모스 그린
  [210, 100, 100], // shoes — 버건디
  [140, 100, 190], // bags — 머브
  [200, 180, 80], // accessories — 머스터드
];

// ---------------------------------------------------------------------------
// 썸네일 raw 버퍼 생성
// 그라디언트(위→아래 밝기 변화) + 고주파 노이즈 + 대각 스트라이프 패턴
// ---------------------------------------------------------------------------
function createThumbnailBuffer(
  width: number,
  height: number,
  base: [number, number, number],
  rng: () => number
): Buffer {
  const buf = Buffer.allocUnsafe(width * height * 3);
  for (let y = 0; y < height; y++) {
    // 그라디언트: 위(70%) → 아래(130%) 선형 변화
    const gradFactor = 0.7 + 0.6 * (y / (height - 1));
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      // 고주파 노이즈 ±60
      const noise = (rng() - 0.5) * 120;
      // 대각 스트라이프: 10px 주기로 ±15 명도 변화 (질감 효과)
      const stripe = Math.sin(((x + y) / 10) * Math.PI * 2) * 15;
      for (let c = 0; c < 3; c++) {
        buf[idx + c] = clamp(base[c] * gradFactor + noise + stripe);
      }
    }
  }
  return buf;
}

// ---------------------------------------------------------------------------
// 긴 상세 raw 버퍼 생성
// 여러 가로 색 밴드 + 각 밴드 내 고주파 노이즈 + 수직 패턴
// ---------------------------------------------------------------------------
function createDetailBuffer(
  width: number,
  height: number,
  rng: () => number
): Buffer {
  const buf = Buffer.allocUnsafe(width * height * 3);
  const NUM_BANDS = 10;
  const bandH = height / NUM_BANDS;

  // 밴드별 색상 결정 (rng으로 — 항상 같은 순서)
  const bandColors: [number, number, number][] = Array.from({ length: NUM_BANDS }, () => [
    clamp(rng() * 180 + 40),
    clamp(rng() * 180 + 40),
    clamp(rng() * 180 + 40),
  ]);

  for (let y = 0; y < height; y++) {
    const bandIdx = Math.min(Math.floor(y / bandH), NUM_BANDS - 1);
    const color = bandColors[bandIdx];
    // 밴드 내 위치 (0→1): 경계에서 부드러운 전환
    const posInBand = (y % bandH) / bandH;
    const edgeSoften = Math.sin(posInBand * Math.PI) * 0.3 + 0.7; // 0.7→1.0→0.7

    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      // 고주파 노이즈 ±70
      const noise = (rng() - 0.5) * 140;
      // 수직 패턴: 20px 주기 물결
      const wave = Math.sin((x / 20) * Math.PI * 2) * 20;
      for (let c = 0; c < 3; c++) {
        buf[idx + c] = clamp(color[c] * edgeSoften + noise + wave);
      }
    }
  }
  return buf;
}

// ---------------------------------------------------------------------------
// SVG 텍스트 오버레이 생성
// ---------------------------------------------------------------------------
function makeSvgLabel(
  width: number,
  height: number,
  label: string,
  yBottom: number
): Buffer {
  const rectH = 36;
  const rectY = yBottom - rectH;
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="${rectY}" width="${width}" height="${rectH}" fill="rgba(0,0,0,0.55)"/>
    <text x="${width / 2}" y="${rectY + 25}" text-anchor="middle"
          fill="white" font-size="18" font-family="monospace" font-weight="bold">${label}</text>
  </svg>`;
  return Buffer.from(svg);
}

function makeDetailSvgBands(width: number, height: number, imageIndex: number): Buffer {
  // 상세 이미지에 여러 텍스트 블록 추가 (상단/중단/하단)
  const sections = ["PRODUCT DETAIL", `IMAGE-${String(imageIndex).padStart(2, "0")}`, "AI CART"];
  const positions = [80, Math.floor(height / 2), height - 60];
  const rects = sections
    .map(
      (text, i) => `
    <rect x="20" y="${positions[i] - 30}" width="${width - 40}" height="40" fill="rgba(0,0,0,0.5)" rx="4"/>
    <text x="${width / 2}" y="${positions[i]}" text-anchor="middle"
          fill="white" font-size="20" font-family="monospace" font-weight="bold">${text}</text>`
    )
    .join("");
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
  return Buffer.from(svg);
}

// ---------------------------------------------------------------------------
// 메인 함수
// ---------------------------------------------------------------------------
export async function generateImages(
  tmpDir: string,
  seed: number = 42
): Promise<GeneratedImage[]> {
  fs.mkdirSync(path.join(tmpDir, "thumbnails"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "details"), { recursive: true });

  const results: GeneratedImage[] = [];

  // 썸네일 200장
  for (let i = 0; i < 200; i++) {
    const filename = `thumb-${String(i).padStart(3, "0")}.jpg`;
    const localPath = path.join(tmpDir, "thumbnails", filename);
    const storagePath = `thumbnails/${filename}`;
    const base = THUMBNAIL_BASE[i % THUMBNAIL_BASE.length];
    // 이미지별 독립 RNG (seed * 100000 + i)
    const rng = makeRng(seed * 100_000 + i);

    const rawBuf = createThumbnailBuffer(800, 800, base, rng);
    const svgBuf = makeSvgLabel(800, 800, `thumb-${String(i).padStart(3, "0")}`, 800);

    await sharp(rawBuf, { raw: { width: 800, height: 800, channels: 3 } })
      .composite([{ input: svgBuf }])
      .jpeg({ quality: 95 })
      .toFile(localPath);

    results.push({ localPath, storagePath, type: "thumbnail" });

    if ((i + 1) % 50 === 0 || i + 1 === 200) {
      process.stdout.write(`\r[images] Generating thumbnails: ${i + 1}/200`);
    }
  }
  console.log(" ✓");

  // 긴 상세 15장
  for (let i = 0; i < 15; i++) {
    const filename = `detail-${String(i).padStart(2, "0")}.jpg`;
    const localPath = path.join(tmpDir, "details", filename);
    const storagePath = `details/${filename}`;
    // 상세 이미지용 별도 RNG 범위 (seed * 100000 + 10000 + i)
    const rng = makeRng(seed * 100_000 + 10_000 + i);

    const rawBuf = createDetailBuffer(800, 5000, rng);
    const svgBuf = makeDetailSvgBands(800, 5000, i);

    await sharp(rawBuf, { raw: { width: 800, height: 5000, channels: 3 } })
      .composite([{ input: svgBuf }])
      .jpeg({ quality: 90 })
      .toFile(localPath);

    results.push({ localPath, storagePath, type: "detail" });
    process.stdout.write(`\r[images] Generating details: ${i + 1}/15`);
  }
  console.log(" ✓");

  return results;
}
