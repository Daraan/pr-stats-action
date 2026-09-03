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
  // Mirrors the real card: the label and count also appear in the `<desc>`
  // accessibility summary, and the value node spans several lines.
  const sourceSvg = `<svg><desc>Total Stars: 5, Contributed to (last year): 12</desc><text class="stat" x="25" y="12.5">Contributed to (last year):</text><text
        class="stat"
        x="224.01"
        y="12.5"
        data-testid="contribs"
      >12</text></svg>`;

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
    expect(result).toContain(">123</text>");
    expect(result).not.toContain("last year");
    expect(result).toContain("Contributed to (all time): 123");
    // Both the `<desc>` summary and the visible label must be relabelled.
    expect(result.match(/Contributed to \(all time\)/g)).toHaveLength(2);
    expect(result).not.toContain(">12</text>");
  });

  test("updates a localized card without matching English literals", () => {
    const germanSvg = `<svg><desc>Sterne insgesamt: 5, Beigetragen zu (letztes Jahr): 12</desc><text class="stat" x="25" y="12.5">Beigetragen zu (letztes Jahr):</text><text
        class="stat"
        x="224.01"
        y="12.5"
        data-testid="contribs"
      >12</text></svg>`;

    const result = updateContributedReposInStatsSvg(
      germanSvg,
      123,
      CONTRIBUTED_REPOS_SCOPE.ALL_TIME,
    );

    expect(result).not.toContain("letztes Jahr");
    expect(result).toContain(">123</text>");
    expect(result).toContain("Beigetragen zu (all time): 123");
    expect(result.match(/Beigetragen zu \(all time\)/g)).toHaveLength(2);
  });
});

describe("fetchAllTimeContributedRepositoryCount", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const repo = (nameWithOwner, extra = {}) => ({
    repository: {
      nameWithOwner,
      isPrivate: false,
      owner: { login: nameWithOwner.split("/")[0] },
      ...extra,
    },
  });

  const mockYears = (byYear) =>
    jest.fn(async (_url, options) => {
      const payload = JSON.parse(options.body);
      const ok = (data) => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ data }),
      });

      if (payload.query.includes("contributionYears")) {
        return ok({
          user: {
            contributionsCollection: {
              contributionYears: Object.keys(byYear).map(Number),
            },
          },
        });
      }

      const year = payload.variables.from.slice(0, 4);
      return ok({
        user: {
          contributionsCollection: {
            commitContributionsByRepository: [],
            issueContributionsByRepository: [],
            pullRequestContributionsByRepository: [],
            repositoryContributions: { nodes: [] },
            ...byYear[year],
          },
        },
      });
    });

  test("only queries fields that exist on ContributionsCollection", async () => {
    globalThis.fetch = mockYears({ 2025: {} });

    await fetchAllTimeContributedRepositoryCount("octocat", "token");

    const queries = globalThis.fetch.mock.calls.map(
      ([, options]) => JSON.parse(options.body).query,
    );
    const yearQuery = queries.find((query) =>
      query.includes("commitContributions"),
    );

    // `repositoryContributionsByRepository` does not exist in the GitHub schema
    // and made the whole request fail with a GraphQL error.
    expect(yearQuery).not.toContain("repositoryContributionsByRepository");
    expect(yearQuery).toContain("repositoryContributions(first: 100)");
    expect(yearQuery).not.toContain(
      "pullRequestReviewContributionsByRepository",
    );
  });

  test("collects unique repositories across years and contribution types", async () => {
    globalThis.fetch = mockYears({
      2025: {
        commitContributionsByRepository: [repo("org/repo-a")],
        issueContributionsByRepository: [repo("org/repo-b")],
        pullRequestContributionsByRepository: [repo("org/repo-a")],
      },
      2024: {
        issueContributionsByRepository: [repo("org/repo-c")],
        repositoryContributions: { nodes: [repo("org/repo-d")] },
      },
    });

    const count = await fetchAllTimeContributedRepositoryCount(
      "octocat",
      "token",
    );

    expect(count).toBe(4);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  test("ignores own and private repositories", async () => {
    globalThis.fetch = mockYears({
      2025: {
        commitContributionsByRepository: [
          repo("octocat/own-repo"),
          repo("OCTOCAT/own-repo-case"),
          repo("org/secret", { isPrivate: true }),
          repo("org/public"),
        ],
      },
    });

    await expect(
      fetchAllTimeContributedRepositoryCount("octocat", "token"),
    ).resolves.toBe(1);
  });
});
