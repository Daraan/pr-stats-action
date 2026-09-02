const CONTRIBUTED_REPOS_SCOPE = {
  LAST_YEAR: "last-year",
  ALL_TIME: "all-time",
};

const CONTRIBUTION_YEARS_QUERY = `
  query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionYears
      }
    }
  }
`;

const CONTRIBUTIONS_BY_YEAR_QUERY = `
  query($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        commitContributionsByRepository(maxRepositories: 100) {
          repository { nameWithOwner }
        }
        issueContributionsByRepository(maxRepositories: 100) {
          repository { nameWithOwner }
        }
        pullRequestContributionsByRepository(maxRepositories: 100) {
          repository { nameWithOwner }
        }
        pullRequestReviewContributionsByRepository(maxRepositories: 100) {
          repository { nameWithOwner }
        }
        repositoryContributionsByRepository(maxRepositories: 100) {
          repository { nameWithOwner }
        }
      }
    }
  }
`;

const postGraphql = async (token, query, variables) => {
  const headers = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `bearer ${token}`;
  }

  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(
      `GitHub API error: ${response.status} ${response.statusText}`,
    );
  }

  const json = await response.json();
  if (json.errors) {
    throw new Error(`GitHub GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data;
};

const normalizeContributionScope = (scope) => {
  if (!scope) return CONTRIBUTED_REPOS_SCOPE.LAST_YEAR;
  const normalized = scope.trim().toLowerCase();

  if (normalized === CONTRIBUTED_REPOS_SCOPE.LAST_YEAR) {
    return CONTRIBUTED_REPOS_SCOPE.LAST_YEAR;
  }

  if (normalized === CONTRIBUTED_REPOS_SCOPE.ALL_TIME) {
    return CONTRIBUTED_REPOS_SCOPE.ALL_TIME;
  }

  throw new Error(
    `Invalid repositories_contributed_to_scope: ${scope}. Supported values are "${CONTRIBUTED_REPOS_SCOPE.LAST_YEAR}" and "${CONTRIBUTED_REPOS_SCOPE.ALL_TIME}".`,
  );
};

const collectRepoNames = (bucket = []) => {
  return bucket
    .map((entry) => entry?.repository?.nameWithOwner)
    .filter(Boolean);
};

const fetchAllTimeContributedRepositoryCount = async (username, token) => {
  const yearsData = await postGraphql(token, CONTRIBUTION_YEARS_QUERY, {
    login: username,
  });
  const years =
    yearsData?.user?.contributionsCollection?.contributionYears ?? [];

  if (!years.length) {
    return 0;
  }

  const repositories = new Set();

  for (const year of years) {
    const from = `${year}-01-01T00:00:00Z`;
    const to = `${year}-12-31T23:59:59Z`;
    const yearData = await postGraphql(token, CONTRIBUTIONS_BY_YEAR_QUERY, {
      login: username,
      from,
      to,
    });

    const collection = yearData?.user?.contributionsCollection;
    const buckets = [
      collection?.commitContributionsByRepository,
      collection?.issueContributionsByRepository,
      collection?.pullRequestContributionsByRepository,
      collection?.pullRequestReviewContributionsByRepository,
      collection?.repositoryContributionsByRepository,
    ];

    for (const bucket of buckets) {
      for (const name of collectRepoNames(bucket)) {
        repositories.add(name);
      }
    }
  }

  return repositories.size;
};

const updateContributedReposInStatsSvg = (svg, count, scope) => {
  if (scope !== CONTRIBUTED_REPOS_SCOPE.ALL_TIME) {
    return svg;
  }

  const updatedCount = svg.replace(
    /(<text[^>]*data-testid="contribs"[^>]*>)([^<]*)(<\/text>)/,
    `$1${count}$3`,
  );

  return updatedCount.replace(
    /(Contributed to) \(last year\)/,
    "$1 (all time)",
  );
};

export {
  CONTRIBUTED_REPOS_SCOPE,
  normalizeContributionScope,
  fetchAllTimeContributedRepositoryCount,
  updateContributedReposInStatsSvg,
};
