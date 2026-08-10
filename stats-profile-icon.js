import { Buffer } from "node:buffer";

/**
 * Fetch a GitHub user's avatar and return it as a Base64 data URI.
 * @param {string} username GitHub username.
 * @returns {Promise<string>} Data URI of the avatar image.
 */
export const fetchAvatarDataUri = async (username) => {
  const url = `https://github.com/${username}.png?size=150`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch avatar for ${username}: ${response.status}`,
    );
  }
  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  const contentType = response.headers.get("content-type") || "image/png";
  return `data:${contentType};base64,${base64}`;
};

/**
 * Build an SVG snippet that renders a circular profile image inside the rank
 * circle. The coordinates match those used by the upstream "github" rank icon.
 * @param {string} dataUri Base64-encoded data URI of the avatar.
 * @param {string} username GitHub username, used to create a unique clipPath ID.
 * @returns {string} SVG markup.
 */
export const profileRankIcon = (dataUri, username) => {
  const clipId = `profile-clip-${username}`;
  return (
    `<svg x="-38" y="-30" width="66" height="66" data-testid="profile-rank-icon">` +
    `<defs><clipPath id="${clipId}"><circle cx="33" cy="33" r="33"/></clipPath></defs>` +
    `<image width="66" height="66" href="${dataUri}" clip-path="url(#${clipId})"/>` +
    `</svg>`
  );
};

/**
 * Replace the upstream "github" rank icon SVG element with a profile image.
 *
 * This relies on the upstream stats card emitting an element with
 * `data-testid="github-rank-icon"`. If the upstream markup changes the
 * replacement will be a no-op and the original SVG is returned unmodified.
 *
 * @param {string} svg Full SVG string produced by the stats card renderer.
 * @param {string} dataUri Base64-encoded data URI of the avatar.
 * @param {string} username GitHub username for a unique clipPath ID.
 * @returns {string} Modified SVG string.
 */
export const injectProfileIcon = (svg, dataUri, username) => {
  return svg.replace(
    /<svg[^>]*data-testid="github-rank-icon"[^>]*>[\s\S]*?<\/svg>/,
    profileRankIcon(dataUri, username),
  );
};
