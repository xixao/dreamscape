/** Close a tab opened by Play; a directly opened tab may refuse to close. */
export function exitPreview(closeHref: string, closeTab: boolean) {
  if (closeTab) {
    window.close();
    if (window.closed) return;
  }
  window.location.assign(closeHref);
}
