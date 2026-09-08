import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { isPublicPath } from "./public-paths";

it("lets configured internal workflow URLs reach their own worker authentication", () => {
  const directory = path.resolve(".github/workflows");
  const urls = readdirSync(directory).filter(name => /\.ya?ml$/.test(name)).flatMap(name =>
    [...readFileSync(path.join(directory, name), "utf8").matchAll(/https:\/\/opensdoors\.bidlow\.co\.uk(\/api\/internal\/[A-Za-z0-9/_-]+)/g)].map(match => match[1]),
  );
  const paths = [...new Set(urls)];
  expect(paths).toEqual(expect.arrayContaining(["/api/internal/company-name-sheets/v1", "/api/internal/scheduled-outreach/v1"]));
  expect(paths.filter(url => !isPublicPath(url)), "Workflow requests cannot use an interactive staff sign-in").toEqual([]);
});
