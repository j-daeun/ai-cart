/**
 * lighthouse-runner.mjs — Node.js ES 모듈로 직접 실행 (esbuild/tsx 변환 없음)
 *
 * tsx가 Lighthouse 내부 함수에 __name 보조 코드를 주입하면
 * 그 코드가 CDP 경유로 브라우저에 전달될 때 "ReferenceError: __name is not defined"가 발생한다.
 * 이 파일은 node(native)로 직접 실행되므로 Lighthouse 코드가 변환되지 않는다.
 *
 * 호출 방식:
 *   node scripts/lighthouse-runner.mjs '{"url":"...","cpuSlowdownMultiplier":1.8}'
 *
 * 성공 시 stdout에 JSON 한 줄, 실패 시 exit 1.
 */

import lighthouse from "lighthouse";
import { launch } from "chrome-launcher";

const params = JSON.parse(process.argv[2]);
const { url, cpuSlowdownMultiplier } = params;

const chrome = await launch({
  chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"],
});

try {
  const lhResult = await lighthouse(url, {
    port: chrome.port,
    logLevel: "error",
    output: "json",
    throttlingMethod: "devtools",
    throttling: {
      rttMs: 150,
      throughputKbps: 1638.4,
      requestLatencyMs: 562.5,
      downloadThroughputKbps: 1474.56,
      uploadThroughputKbps: 675,
      cpuSlowdownMultiplier,
    },
    disableStorageReset: false,
  });

  if (!lhResult) {
    process.stderr.write("Lighthouse returned no result\n");
    process.exit(1);
  }

  const { audits, environment } = lhResult.lhr;

  const lcp = (audits["largest-contentful-paint"]?.numericValue ?? 0) / 1000;
  const cls = audits["cumulative-layout-shift"]?.numericValue ?? 0;
  const tbt = audits["total-blocking-time"]?.numericValue ?? 0;

  const summaryItems = audits["resource-summary"]?.details?.items ?? [];
  const jsBytes =
    summaryItems.find((i) => i.resourceType === "script")?.transferSize ?? 0;

  const ua = environment?.hostUserAgent ?? "";
  const chromeMatch = ua.match(/Chrome\/([\d.]+)/);
  const browserVersion = chromeMatch
    ? `Chrome ${chromeMatch[1]}`
    : "Chrome (unknown)";

  const output = {
    lcp: parseFloat(lcp.toFixed(3)),
    cls: parseFloat(cls.toFixed(3)),
    tbt: Math.round(tbt),
    js_bytes: Math.round(jsBytes),
    browserVersion,
  };

  // stdout에 JSON 한 줄만 출력 (measure.ts가 파싱)
  process.stdout.write(JSON.stringify(output) + "\n");
} finally {
  await chrome.kill();
}
