/**
 * measure.ts — Constitution 원칙 II 기준 환경으로 Lighthouse 3회 측정 후 JSON 누적 + MD 재생성
 * per contracts/measure-cli.md
 *
 * Usage:
 *   npm run measure -- --url http://localhost:3000 --spec 000-foundation --page layout --force-prod
 *   npm run measure:compare -- --spec 000-foundation --before <measured_at> --after <measured_at>
 */

import * as fs from "fs";
import * as path from "path";
import { execSync, spawnSync } from "child_process";

// ---- Types ----------------------------------------------------------------

interface Config {
  cpu_slowdown_multiplier: number | null;
  device_model: string | null;
  browser_version_at_first_measurement: string | null;
}

interface RunResult {
  lcp: number; // seconds (3 decimal places)
  cls: number; // score (3 decimal places)
  tbt: number; // ms (integer)
  js_bytes: number; // bytes (integer)
}

interface MeasurementSet {
  spec_id: string;
  page: string;
  scenario: string;
  measured_at: string;
  commit: string;
  url: string;
  browser_version: string;
  cpu_slowdown_multiplier: number;
  network_profile: string;
  data_scale: string;
  cache: string;
  runs: RunResult[];
  median: RunResult;
}

interface MeasurementsFile {
  sets: MeasurementSet[];
}

/** lighthouse-runner.mjs stdout JSON 구조 */
interface LighthouseRunnerOutput {
  lcp: number;
  cls: number;
  tbt: number;
  js_bytes: number;
  browserVersion: string;
}

// ---- CLI arg parsing -------------------------------------------------------

interface ParsedArgs {
  subcommand: string | null;
  url: string | null;
  spec: string | null;
  page: string;
  scenario: string;
  runs: number;
  forceProd: boolean;
  before: string | null;
  after: string | null;
}

function parseArgs(argv: string[]): ParsedArgs {
  const raw: Record<string, string | boolean> = {};
  let subcommand: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        raw[key] = true;
      } else {
        raw[key] = next;
        i++;
      }
    } else if (!subcommand) {
      subcommand = arg;
    }
  }

  return {
    subcommand,
    url: (raw["url"] as string) ?? null,
    spec: (raw["spec"] as string) ?? null,
    page: (raw["page"] as string) ?? "",
    scenario: (raw["scenario"] as string) ?? "page-load",
    runs: parseInt((raw["runs"] as string) ?? "3", 10),
    forceProd: raw["force-prod"] === true || raw["force-prod"] === "true",
    before: (raw["before"] as string) ?? null,
    after: (raw["after"] as string) ?? null,
  };
}

// ---- Math ------------------------------------------------------------------

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function computeMedian(runs: RunResult[]): RunResult {
  return {
    lcp: parseFloat(medianOf(runs.map((r) => r.lcp)).toFixed(3)),
    cls: parseFloat(medianOf(runs.map((r) => r.cls)).toFixed(3)),
    tbt: Math.round(medianOf(runs.map((r) => r.tbt))),
    js_bytes: Math.round(medianOf(runs.map((r) => r.js_bytes))),
  };
}

// ---- Lighthouse ------------------------------------------------------------

/** scripts/lighthouse-runner.mjs 경로 (process.cwd() = 프로젝트 루트) */
const RUNNER_PATH = path.resolve(process.cwd(), "scripts/lighthouse-runner.mjs");

/**
 * Run Lighthouse once via a separate node process.
 *
 * tsx(esbuild)가 Lighthouse 내부 함수에 __name 보조 코드를 주입하면
 * CDP로 브라우저에 전달될 때 ReferenceError가 발생한다.
 * lighthouse-runner.mjs를 node(native)로 직접 스폰해 변환을 우회한다.
 */
function runLighthouseOnce(
  url: string,
  cpuSlowdownMultiplier: number
): { result: RunResult; browserVersion: string } {
  const params = JSON.stringify({ url, cpuSlowdownMultiplier });

  const proc = spawnSync(process.execPath, [RUNNER_PATH, params], {
    encoding: "utf-8",
    timeout: 180_000, // 3분 — Lighthouse 1회 실행 여유
    maxBuffer: 10 * 1024 * 1024, // 10MB
  });

  if (proc.error) throw proc.error;

  if (proc.status !== 0) {
    throw new Error(
      `Lighthouse runner failed (exit ${proc.status ?? "?"}): ${proc.stderr.trim()}`
    );
  }

  const parsed = JSON.parse(proc.stdout.trim()) as LighthouseRunnerOutput;

  return {
    result: {
      lcp: parsed.lcp,
      cls: parsed.cls,
      tbt: parsed.tbt,
      js_bytes: parsed.js_bytes,
    },
    browserVersion: parsed.browserVersion,
  };
}

// ---- File helpers ----------------------------------------------------------

const MEASUREMENTS_DIR = path.join(process.cwd(), "docs/measurements");
const CONFIG_PATH = path.join(MEASUREMENTS_DIR, "config.json");

function readConfig(): Config {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as Config;
}

function writeConfig(config: Config): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

function readMeasurementsFile(spec: string): MeasurementsFile {
  const filePath = path.join(MEASUREMENTS_DIR, `${spec}.json`);
  if (!fs.existsSync(filePath)) return { sets: [] };
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as MeasurementsFile;
}

function writeMeasurementsFile(spec: string, data: MeasurementsFile): void {
  const filePath = path.join(MEASUREMENTS_DIR, `${spec}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/**
 * FR-014 전체 항목(spec_id·page·scenario·measured_at·commit·url·browser_version·
 * cpu_slowdown_multiplier·network_profile·data_scale·cache·runs·median)을 모두 표시.
 * 표가 너무 넓어지는 것을 피하기 위해 세트마다 조건 블록 + 원값 표를 따로 렌더링.
 */
function regenerateMarkdown(spec: string, data: MeasurementsFile): void {
  const filePath = path.join(MEASUREMENTS_DIR, `${spec}.md`);

  const lines: string[] = [
    `# Measurements: ${spec}`,
    "",
    `> Auto-generated from \`${spec}.json\` — do not edit manually.`,
  ];

  data.sets.forEach((s, idx) => {
    const at = s.measured_at.replace("T", " ").replace("Z", " UTC");
    const jsKb = (s.median.js_bytes / 1024).toFixed(1);

    lines.push("", "---", "", `## Set ${idx + 1} — ${at}`, "");

    // 측정 조건 (FR-014 항목)
    lines.push(
      "| 항목 | 값 |",
      "|------|-----|",
      `| spec_id | ${s.spec_id} |`,
      `| page | ${s.page || "—"} |`,
      `| scenario | ${s.scenario} |`,
      `| commit | ${s.commit} |`,
      `| url | ${s.url} |`,
      `| browser_version | ${s.browser_version} |`,
      `| cpu_slowdown_multiplier | ${s.cpu_slowdown_multiplier} |`,
      `| network_profile | ${s.network_profile} |`,
      `| data_scale | ${s.data_scale} |`,
      `| cache | ${s.cache} |`,
      ""
    );

    // 측정 원값 + 중앙값
    lines.push(
      "| 회차 | LCP (s) | CLS | TBT (ms) | JS (KB) |",
      "|------|---------|-----|----------|---------|"
    );
    s.runs.forEach((r, ri) => {
      lines.push(
        `| ${ri + 1} | ${r.lcp} | ${r.cls} | ${r.tbt} | ${(r.js_bytes / 1024).toFixed(1)} |`
      );
    });
    lines.push(
      `| **중앙값** | **${s.median.lcp}** | **${s.median.cls}** | **${s.median.tbt}** | **${jsKb}** |`
    );
  });

  lines.push("");
  fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
}

// ---- spec_id helper --------------------------------------------------------

/** "000-foundation" → "S0", "001-product-list" → "S1" */
function toSpecId(spec: string): string {
  const match = spec.match(/^(\d+)/);
  return match ? `S${parseInt(match[1], 10)}` : spec;
}

// ---- Measure subcommand ----------------------------------------------------

async function cmdMeasure(args: ParsedArgs): Promise<void> {
  const { url, spec, page, scenario, runs: runCount, forceProd } = args;

  if (!url) {
    console.error("Error: --url is required");
    process.exit(1);
  }
  if (!spec) {
    console.error("Error: --spec is required");
    process.exit(1);
  }

  // FR-013: localhost URL without --force-prod → refuse
  if ((url.includes("localhost") || url.includes("127.0.0.1")) && !forceProd) {
    console.error("Error: Production build required.");
    console.error(`  Detected dev server at ${url}.`);
    console.error(
      "  Run `npm run build && npm start` first, then re-run with --force-prod."
    );
    process.exit(1);
  }

  // Load measurement config
  const config = readConfig();
  if (config.cpu_slowdown_multiplier === null) {
    console.error(
      "Error: docs/measurements/config.json의 cpu_slowdown_multiplier가 null입니다."
    );
    console.error(
      "  Chrome DevTools > Performance > 'Calibrate CPU throttle'로 보정 후 기입하세요."
    );
    process.exit(1);
  }

  const cpuMult = config.cpu_slowdown_multiplier;

  // Get commit hash
  let commit = "unknown";
  try {
    commit = execSync("git rev-parse HEAD", { encoding: "utf-8" })
      .trim()
      .slice(0, 7);
  } catch {
    // not a git repo or no commits yet — keep "unknown"
  }

  console.log(
    `[measure] url=${url}  spec=${spec}  page=${page}  scenario=${scenario}`
  );
  console.log(
    `[measure] CPU ×${cpuMult}  Slow 4G  cache cleared  ${runCount} runs`
  );

  const runResults: RunResult[] = [];
  let browserVersion = "Chrome (unknown)";

  for (let i = 0; i < runCount; i++) {
    console.log(`[measure] run ${i + 1}/${runCount}...`);
    const { result, browserVersion: bv } = runLighthouseOnce(url, cpuMult);
    runResults.push(result);
    if (i === 0) {
      browserVersion = bv;
      // 첫 측정 시 browser_version_at_first_measurement가 null이면 자동 기록
      if (config.browser_version_at_first_measurement === null) {
        config.browser_version_at_first_measurement = bv;
        writeConfig(config);
        console.log(`[measure] config.json browser_version_at_first_measurement → ${bv}`);
      }
    }
    console.log(
      `  LCP ${result.lcp}s  CLS ${result.cls}  TBT ${result.tbt}ms  JS ${(
        result.js_bytes / 1024
      ).toFixed(1)}KB`
    );
  }

  const med = computeMedian(runResults);
  console.log(
    `[measure] median → LCP ${med.lcp}s  CLS ${med.cls}  TBT ${med.tbt}ms  JS ${(
      med.js_bytes / 1024
    ).toFixed(1)}KB`
  );

  const newSet: MeasurementSet = {
    spec_id: toSpecId(spec),
    page,
    scenario,
    measured_at: new Date().toISOString(),
    commit,
    url,
    browser_version: browserVersion,
    cpu_slowdown_multiplier: cpuMult,
    network_profile: "Slow 4G",
    data_scale: "products:100000",
    cache: "cleared",
    runs: runResults,
    median: med,
  };

  const data = readMeasurementsFile(spec);
  data.sets.push(newSet);
  writeMeasurementsFile(spec, data);
  regenerateMarkdown(spec, data);

  console.log(
    `[measure] Done — ${spec}.json updated (${data.sets.length} sets), ${spec}.md regenerated ✓`
  );
}

// ---- Compare subcommand ----------------------------------------------------

function cmdCompare(args: ParsedArgs): void {
  const { spec, before, after } = args;

  if (!spec) {
    console.error("Error: --spec is required");
    process.exit(1);
  }

  const data = readMeasurementsFile(spec);
  if (data.sets.length === 0) {
    console.error(`Error: ${spec}.json에 측정 세트가 없습니다.`);
    process.exit(1);
  }

  let beforeSet: MeasurementSet;
  let afterSet: MeasurementSet;

  if (before && after) {
    const b = data.sets.find((s) => s.measured_at === before);
    const a = data.sets.find((s) => s.measured_at === after);
    if (!b) {
      console.error(`Error: --before 값 "${before}"에 해당하는 세트가 없습니다.`);
      process.exit(1);
    }
    if (!a) {
      console.error(`Error: --after 값 "${after}"에 해당하는 세트가 없습니다.`);
      process.exit(1);
    }
    beforeSet = b;
    afterSet = a;
  } else {
    // Default to last two sets
    if (data.sets.length < 2) {
      console.error("Error: 비교할 세트가 2개 이상 필요합니다. --before / --after 를 명시하거나 세트를 추가하세요.");
      process.exit(1);
    }
    beforeSet = data.sets[data.sets.length - 2];
    afterSet = data.sets[data.sets.length - 1];
  }

  const diffPct = (a: number, b: number): string => {
    if (a === 0) return "N/A";
    const pct = ((b - a) / a) * 100;
    return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
  };

  console.log(
    `\n## ${spec} 비교: ${beforeSet.measured_at} → ${afterSet.measured_at}\n`
  );
  console.log("| 지표 | Before | After | 변화 |");
  console.log("|------|--------|-------|------|");
  console.log(
    `| LCP (s) | ${beforeSet.median.lcp} | ${afterSet.median.lcp} | ${diffPct(beforeSet.median.lcp, afterSet.median.lcp)} |`
  );
  console.log(
    `| CLS | ${beforeSet.median.cls} | ${afterSet.median.cls} | ${diffPct(beforeSet.median.cls, afterSet.median.cls)} |`
  );
  console.log(
    `| TBT (ms) | ${beforeSet.median.tbt} | ${afterSet.median.tbt} | ${diffPct(beforeSet.median.tbt, afterSet.median.tbt)} |`
  );
  console.log(
    `| JS (KB) | ${(beforeSet.median.js_bytes / 1024).toFixed(1)} | ${(afterSet.median.js_bytes / 1024).toFixed(1)} | ${diffPct(beforeSet.median.js_bytes, afterSet.median.js_bytes)} |`
  );
}

// ---- Entry point -----------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.subcommand === "compare") {
    cmdCompare(args);
  } else {
    await cmdMeasure(args);
  }
}

main().catch((err: unknown) => {
  if (err instanceof Error) {
    console.error(`[measure] Error: ${err.message}`);
  } else {
    console.error("[measure] Unknown error:", err);
  }
  process.exit(1);
});
