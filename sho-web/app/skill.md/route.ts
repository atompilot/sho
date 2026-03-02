import { readFileSync } from "fs";
import { join } from "path";

const DEFAULT_BASE_URL = "https://sho.splaz.cn";

export async function GET() {
  const templatePath = join(process.cwd(), "public", "skill.md.template");
  const template = readFileSync(templatePath, "utf-8");
  const baseUrl = (
    process.env.NEXT_PUBLIC_API_URL || DEFAULT_BASE_URL
  ).replace(/\/$/, "");
  const content = template.replaceAll("{{BASE_URL}}", baseUrl);

  return new Response(content, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
