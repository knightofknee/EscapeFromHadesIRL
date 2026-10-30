/**
 * Rewrites incoming deep links before the router sees them. The friend
 * invite web link (https://www.waldgrave.com/escapefromhadesirl/friend/CODE)
 * opens the app at the same path; send it to the /friend/[code] screen.
 * Every other link passes through untouched.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  const match = path.match(/\/escapefromhadesirl\/friend\/([A-Za-z0-9-]+)/);
  return match ? `/friend/${match[1]}` : path;
}
