// Bounded operator readiness check. Uses the same budgeted analyst client; never enables or submits trades.
import "./status.mjs";
import { execFileSync } from "node:child_process";
import { response, validateNews } from "../../functions/mainnet/analyst.js";
process.env.OPENAI_API_KEY = execFileSync(
  "gcloud",
  [
    "secrets",
    "versions",
    "access",
    "1",
    "--secret=OPENAI_API_KEY",
    "--project=irobotxsite",
  ],
  { encoding: "utf8" },
).trim();
try {
  const { value, raw } = await response(
    `Find up to three material XRP, XRPL or RLUSD news articles published within 72 hours of ${new Date().toISOString()}. Include verified publication dates and source URLs. Empty list if none.`,
    true,
  );
  const urls = new Set(
    (raw.output || [])
      .flatMap((o) => [
        ...(o.action?.sources || []).map((s) => s.url),
        ...(o.content || []).flatMap((x) =>
          (x.annotations || []).map((a) => a.url),
        ),
      ])
      .filter(Boolean),
  );
  const articles = validateNews(value.articles, urls);
  console.log(
    JSON.stringify({
      status: raw.status,
      verifiedArticles: articles.length,
      sourceCount: urls.size,
      inputTokens: raw.usage?.input_tokens,
      outputTokens: raw.usage?.output_tokens,
    }),
  );
} finally {
  delete process.env.OPENAI_API_KEY;
}
