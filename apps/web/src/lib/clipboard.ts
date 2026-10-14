/**
 * Shared copy-to-clipboard behaviour for every "copy" control on the site.
 *
 * Components render a button carrying `data-copy-value` (or `data-copy-target`
 * to copy another element's live text) plus `data-copy-done-label`. A single
 * delegated listener swaps the label, exposes the result to assistive tech via
 * the button's `[role="status"]` child, and reverts after a moment.
 */

const REVERT_MS = 2000;
const BOUND_FLAG = "copyBound";

async function writeClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through: insecure context, denied permission, or no user gesture.
    }
  }

  let helper: HTMLTextAreaElement | null = null;
  try {
    helper = document.createElement("textarea");
    helper.value = text;
    helper.setAttribute("readonly", "");
    helper.style.position = "fixed";
    helper.style.top = "0";
    helper.style.opacity = "0";
    document.body.appendChild(helper);
    helper.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    helper?.remove();
  }
}

function resolveValue(button: HTMLElement): string {
  const targetSelector = button.dataset.copyTarget;
  if (targetSelector) {
    const target = document.querySelector(targetSelector);
    return target?.textContent ?? "";
  }
  return button.dataset.copyValue ?? "";
}

function initCopyButtons(): void {
  const root = document.documentElement;
  if (root.dataset[BOUND_FLAG] === "true") {
    return;
  }
  root.dataset[BOUND_FLAG] = "true";

  document.addEventListener("click", (event) => {
    const element = event.target instanceof Element ? event.target : null;
    const button = element?.closest<HTMLButtonElement>("[data-copy-value], [data-copy-target]");
    if (!button) {
      return;
    }

    const label = button.querySelector<HTMLElement>(".copy-label");
    const status = button.querySelector<HTMLElement>('[role="status"]');
    const originalLabel = label?.textContent ?? "";
    const doneLabel = button.dataset.copyDoneLabel ?? originalLabel;

    void writeClipboard(resolveValue(button)).then((ok) => {
      if (!ok) {
        return;
      }
      button.classList.add("copied");
      if (label) {
        label.textContent = doneLabel;
      }
      if (status) {
        status.textContent = doneLabel;
      }
      window.setTimeout(() => {
        button.classList.remove("copied");
        if (label) {
          label.textContent = originalLabel;
        }
        if (status) {
          status.textContent = "";
        }
      }, REVERT_MS);
    });
  });
}

initCopyButtons();
