import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const protectedRoutes: Array<{
  file: string;
  method: "post" | "put" | "patch" | "delete";
  path: string;
}> = [
  { file: "agents.ts", method: "post", path: "/agents" },
  { file: "agents.ts", method: "patch", path: "/agents/:id" },
  { file: "agents.ts", method: "delete", path: "/agents/:id" },
  { file: "agents.ts", method: "post", path: "/agents/:id/deployment-token" },
  { file: "agents.ts", method: "patch", path: "/agents/:id/settings" },
  { file: "escalations.ts", method: "patch", path: "/agents/:id/escalation" },
  {
    file: "conversation-settings.ts",
    method: "patch",
    path: "/agents/:id/conversation-settings",
  },
  { file: "appearance.ts", method: "put", path: "/appearance" },
  { file: "appearance.ts", method: "post", path: "/appearance/import" },
  { file: "appearance.ts", method: "put", path: "/agents/:id/appearance" },
  {
    file: "appearance.ts",
    method: "post",
    path: "/agents/:id/appearance/import",
  },
  { file: "articles.ts", method: "post", path: "/articles" },
  { file: "articles.ts", method: "patch", path: "/articles/:id" },
  { file: "articles.ts", method: "delete", path: "/articles/:id" },
  { file: "articles.ts", method: "post", path: "/articles/:id/publish" },
  { file: "articles.ts", method: "post", path: "/articles/:id/archive" },
  { file: "articles.ts", method: "post", path: "/articles/:id/draft" },
  { file: "articles.ts", method: "post", path: "/articles/:id/assets" },
  { file: "articles.ts", method: "delete", path: "/articles/assets/:assetId" },
  { file: "targets.ts", method: "post", path: "/targets" },
  { file: "targets.ts", method: "patch", path: "/targets/:id" },
  { file: "targets.ts", method: "delete", path: "/targets/:id" },
  {
    file: "training-questions.ts",
    method: "post",
    path: "/training-questions",
  },
  {
    file: "training-questions.ts",
    method: "post",
    path: "/training-questions/bulk",
  },
  {
    file: "training-questions.ts",
    method: "patch",
    path: "/training-questions/:id",
  },
  {
    file: "training-questions.ts",
    method: "delete",
    path: "/training-questions/:id",
  },
  { file: "members.ts", method: "post", path: "/members" },
  { file: "members.ts", method: "post", path: "/members/:id/invitation-token" },
  { file: "members.ts", method: "patch", path: "/members/:id" },
  { file: "members.ts", method: "delete", path: "/members/:id" },
];

describe("agent mutation permissions", () => {
  it.each(protectedRoutes)(
    "$method $path requires editor access",
    async ({ file, method, path }) => {
      const source = await readFile(
        new URL(`./${file}`, import.meta.url),
        "utf8",
      );
      const routePattern = new RegExp(
        `router\\.${method}\\(\\s*"${path.replaceAll("/", "\\/")}"[\\s\\S]{0,120}requireEditor`,
      );

      expect(source).toMatch(routePattern);
    },
  );

  it("exposes invitation status without authentication", async () => {
    const source = await readFile(
      new URL("./members.ts", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/router\.get\(\s*"\/invitations\/:token"/);
    expect(source).not.toMatch(
      /router\.get\(\s*"\/invitations\/:token"[\s\S]{0,120}requireAuth/,
    );
  });

  it("lets any signed-in member redeem an invitation", async () => {
    const source = await readFile(
      new URL("./members.ts", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(
      /router\.post\(\s*"\/invitations\/redeem"[\s\S]{0,80}requireAuth/,
    );
    expect(source).not.toMatch(
      /router\.post\(\s*"\/invitations\/redeem"[\s\S]{0,120}requireEditor/,
    );
  });
});
