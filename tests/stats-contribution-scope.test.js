import { afterEach, describe, expect, jest, test } from "@jest/globals";
import {
  CONTRIBUTED_REPOS_SCOPE,
  normalizeContributionScope,
  fetchAllTimeContributedRepositoryCount,
  updateContributedReposInStatsSvg,
} from "../stats-contribution-scope.js";

describe("normalizeContributionScope", () => {
  test("defaults to last-year when unset", () => {
    expect(normalizeContributionScope(undefined)).toBe(
      CONTRIBUTED_REPOS_SCOPE.LAST_YEAR,
    );
  });

  test("accepts last-year and all-time", () => {
    expect(normalizeContributionScope("last-year")).toBe(
      CONTRIBUTED_REPOS_SCOPE.LAST_YEAR,
    );
    expect(normalizeContributionScope("all-time")).toBe(
      CONTRIBUTED_REPOS_SCOPE.ALL_TIME,
    );
  });

  test("rejects unsupported values", () => {
    expect(() => normalizeContributionScope("yearly")).toThrow(
      /Invalid repositories_contributed_to_scope/,
    );
  });
});

describe("updateContributedReposInStatsSvg", () => {
  const sourceSvg = `<svg><text>Contributed to (last year):</text><text data-testid="contribs">12</text></svg>`;

  test("keeps SVG unchanged in last-year mode", () => {
    expect(
      updateContributedReposInStatsSvg(
        sourceSvg,
        99,
        CONTRIBUTED_REPOS_SCOPE.LAST_YEAR,
      ),
    ).toBe(sourceSvg);
  });

  test("updates contributed count and label in all-time mode", () => {
    const result = updateContributedReposInStatsSvg(
      sourceSvg,
      123,
      CONTRIBUTED_REPOS_SCOPE.ALL_TIME,
    );
    expect(result).toContain("Contributed to (all time)");
    expect(result).toContain('data-testid="contribs">123</text>');
  });
});

describe("fetchAllTimeContributedRepositoryCount", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("collects unique repositories across years and contribution types", async () => {
    globalThis.fetch = jest.fn(async (_url, options) => {
      const payload = JSON.parse(options.body);

      if (payload.query.includes("contributionYears")) {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({
            data: {
              user: {
                contributionsCollection: {
                  contributionYears: [2025, 2024],
                },
              },
            },
          }),
        };
      }

      if (payload.variables.from.startsWith("2025")) {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({
            data: {
              user: {
                contributionsCollection: {
                  commitContributionsByRepository: [
                    { repository: { nameWithOwner: "org/repo-a" } },
                  ],
                  issueContributionsByRepository: [
                    { repository: { nameWithOwner: "org/repo-b" } },
                  ],
                  pullRequestContributionsByRepository: [
                    { repository: { nameWithOwner: "org/repo-a" } },
                  ],
                  pullRequestReviewContributionsByRepository: [],
                  repositoryContributionsByRepository: [],
                },
              },
            },
          }),
        };
      }

      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          data: {
            user: {
              contributionsCollection: {
                commitContributionsByRepository: [],
                issueContributionsByRepository: [
                  { repository: { nameWithOwner: "org/repo-c" } },
                ],
                pullRequestContributionsByRepository: [],
                pullRequestReviewContributionsByRepository: [
                  { repository: { nameWithOwner: "org/repo-b" } },
                ],
                repositoryContributionsByRepository: [
                  { repository: { nameWithOwner: "org/repo-d" } },
                ],
              },
            },
          },
        }),
      };
    });

    const count = await fetchAllTimeContributedRepositoryCount(
      "octocat",
      "token",
    );

    expect(count).toBe(4);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });
});
