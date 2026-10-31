/**
 * The web edition (program/web) runs these same pages in browser frames; its
 * frame bootstrap marks the document with data-edition="web" before any page
 * script runs. Features that need this PC (subscription programs, the agent
 * window, links to local coding agents) stay out of the web edition's screens.
 */
export function isWebEdition(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.edition === 'web'
}
