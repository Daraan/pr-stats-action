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

const REPO_FIELDS = `
  repository {
    nameWithOwner
    isPrivate
    owner { login }
  }
`;

// Mirrors the contribution types used by the core card's
// `repositoriesContributedTo(contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, REPOSITORY])`,
// but evaluated year by year so the result covers the full account history.
const CONTRIBUTIONS_BY_YEAR_QUERY = `
  query($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        commitContributionsByRepository(maxRepositories: 100) {
          ${REPO_FIELDS}
        }
        issueContributionsByRepository(maxRepositories: 100) {
          ${REPO_FIELDS}
        }
        pullRequestContributionsByRepository(maxRepositories: 100) {
          ${REPO_FIELDS}
        }
        repositoryContributions(first: 100) {
          nodes {
            ${REPO_FIELDS}
          }
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

/**
 * Collect repository names from a contributions bucket, applying the same
 * exclusions as the core card's `repositoriesContributedTo` field: repositories
 * owned by the user and private repositories do not count.
 */
const collectRepoNames = (bucket, username) => {
  const entries = Array.isArray(bucket) ? bucket : [];
  const login = username?.toLowerCase();

  return entries
    .map((entry) => entry?.repository)
    .filter(Boolean)
    .filter((repo) => !repo.isPrivate)
    .filter((repo) => repo.owner?.login?.toLowerCase() !== login)
    .map((repo) => repo.nameWithOwner)
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
    const to = `${year}-12-31T23:59:59.999Z`;
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
      collection?.repositoryContributions?.nodes,
    ];

    for (const bucket of buckets) {
      for (const name of collectRepoNames(bucket, username)) {
        repositories.add(name);
      }
    }
  }

  return repositories.size;
};

const CONTRIBS_VALUE_PATTERN =
  /(<text[^>]*data-testid="contribs"[^>]*>)([^<]*)(<\/text>)/;

// The label `<text>` node sits directly before the value node in the same
// group, so it gives us the localized label without hard-coding English.
const CONTRIBS_LABEL_PATTERN =
  /<text[^>]*>([^<]*)<\/text>\s*(?:<\/a>\s*<a[^>]*>\s*)?<text[^>]*data-testid="contribs"/;

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const ALL_TIME_LABEL_SUFFIX = "(all time)";

const relabelAllTime = (label) => {
  if (/\([^()]*\)/.test(label)) {
    return label.replace(/\([^()]*\)/, ALL_TIME_LABEL_SUFFIX);
  }
  return `${label} ${ALL_TIME_LABEL_SUFFIX}`;
};

const updateContributedReposInStatsSvg = (svg, count, scope) => {
  if (scope !== CONTRIBUTED_REPOS_SCOPE.ALL_TIME) {
    return svg;
  }

  // The visible value node is locale independent; patch it first.
  let updated = svg.replace(CONTRIBS_VALUE_PATTERN, `$1${count}$3`);

  // The same label and count appear once more in the `<desc>` accessibility
  // summary ("Contributed to (last year): 12"). The label is localized, so it
  // is read back off the card instead of being matched as an English literal.
  const label = svg.match(CONTRIBS_LABEL_PATTERN)?.[1]?.replace(/:\s*$/, "");

  if (!label) {
    return updated;
  }

  const escaped = escapeRegExp(label);

  updated = updated.replace(
    new RegExp(`(${escaped}:\\s*)\\d+`, "g"),
    `$1${count}`,
  );

  const allTimeLabel = relabelAllTime(label);

  return updated.replace(new RegExp(escaped, "g"), () => allTimeLabel);
};

export {
  CONTRIBUTED_REPOS_SCOPE,
  normalizeContributionScope,
  fetchAllTimeContributedRepositoryCount,
  updateContributedReposInStatsSvg,
};
