import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync } from "node:fs";
import { extname } from "node:path";
import { URL } from "node:url";

const assetsDirectory = new URL("../apps/web/dist/assets/", import.meta.url);
const limits = Object.freeze({
  maximumJavaScriptRawBytes: 400 * 1024,
  maximumJavaScriptGzipBytes: 120 * 1024,
  totalJavaScriptGzipBytes: 360 * 1024,
  totalCssGzipBytes: 24 * 1024,
});

const assets = readdirSync(assetsDirectory)
  .filter((name) => extname(name) === ".js" || extname(name) === ".css")
  .map((name) => {
    const contents = readFileSync(new URL(name, assetsDirectory));
    return {
      name,
      kind: extname(name).slice(1),
      rawBytes: contents.byteLength,
      gzipBytes: gzipSync(contents, { level: 9 }).byteLength,
    };
  })
  .sort(
    (left, right) =>
      right.gzipBytes - left.gzipBytes || left.name.localeCompare(right.name),
  );

if (assets.length === 0) {
  throw new Error("No built web assets were found; run the web production build first.");
}

const javascript = assets.filter((asset) => asset.kind === "js");
const styles = assets.filter((asset) => asset.kind === "css");
if (javascript.length === 0) {
  throw new Error("The production build did not emit any JavaScript assets.");
}
const total = (items, key) => items.reduce((sum, item) => sum + item[key], 0);
const largestRaw = javascript.reduce(
  (largest, asset) => (asset.rawBytes > largest.rawBytes ? asset : largest),
  javascript[0],
);
const largestGzip = javascript.reduce(
  (largest, asset) => (asset.gzipBytes > largest.gzipBytes ? asset : largest),
  javascript[0],
);
const result = {
  limits,
  measured: {
    javascriptFiles: javascript.length,
    largestJavaScriptRaw: largestRaw,
    largestJavaScriptGzip: largestGzip,
    totalJavaScriptRawBytes: total(javascript, "rawBytes"),
    totalJavaScriptGzipBytes: total(javascript, "gzipBytes"),
    totalCssRawBytes: total(styles, "rawBytes"),
    totalCssGzipBytes: total(styles, "gzipBytes"),
  },
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

const failures = [];
if (largestRaw.rawBytes > limits.maximumJavaScriptRawBytes) {
  failures.push(`${largestRaw.name} exceeds the raw JavaScript chunk budget.`);
}
if (largestGzip.gzipBytes > limits.maximumJavaScriptGzipBytes) {
  failures.push(`${largestGzip.name} exceeds the gzip JavaScript chunk budget.`);
}
if (result.measured.totalJavaScriptGzipBytes > limits.totalJavaScriptGzipBytes) {
  failures.push("The total gzip JavaScript budget was exceeded.");
}
if (result.measured.totalCssGzipBytes > limits.totalCssGzipBytes) {
  failures.push("The total gzip CSS budget was exceeded.");
}
if (failures.length > 0) {
  throw new Error(failures.join(" "));
}
