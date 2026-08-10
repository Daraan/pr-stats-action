import { describe, expect, jest, test } from "@jest/globals";
import {
  fetchAvatarDataUri,
  injectProfileIcon,
  profileRankIcon,
} from "../stats-profile-icon.js";

describe("fetchAvatarDataUri", () => {
  test("uses the GitHub profile image URL for the provided username", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "image/png" },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }));

    try {
      await fetchAvatarDataUri("octocat");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://github.com/octocat.png?size=150",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("profile rank icon helpers", () => {
  test("replaces the github rank icon with a profile icon", () => {
    const sourceSvg =
      '<svg xmlns="http://www.w3.org/2000/svg"><g><svg data-testid="github-rank-icon"><path/></svg></g></svg>';
    const result = injectProfileIcon(
      sourceSvg,
      "data:image/png;base64,AAAA",
      "octocat",
    );
    expect(result).toContain('data-testid="profile-rank-icon"');
    expect(result).toContain('clip-path="url(#profile-clip-octocat)"');
    expect(result).not.toContain("github-rank-icon");
  });

  test("keeps default rank/octocat icon when profile override is not applied", () => {
    const sourceSvg =
      '<svg xmlns="http://www.w3.org/2000/svg"><g><svg data-testid="github-rank-icon"><path/></svg></g></svg>';
    expect(sourceSvg).toContain("github-rank-icon");
    expect(sourceSvg).not.toContain("profile-rank-icon");
  });

  test("profile icon dimensions match upstream github icon placement", () => {
    const result = profileRankIcon("data:image/png;base64,AAAA", "octocat");
    expect(result).toContain('x="-38"');
    expect(result).toContain('y="-30"');
    expect(result).toContain('width="66"');
    expect(result).toContain('height="66"');
  });
});
