/**
 * Shared copy-to-clipboard behaviour for every "copy" control on the site.
 *
 * Components render a button carrying `data-copy-value` (or `data-copy-target`
 * to copy another element's live text) plus `data-copy-done-label`. A single
 * delegated listener swaps the label, exposes the result to assistive tech via
 * the button's `[role="status"]` child, and reverts after a moment.
 */

const REVERT_MS = 2000;
const FAILED_REVERT_MS = 3000;
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
    // Capture the resting label once: a later click may happen while the failure
    // (or success) label is still displayed, and the revert must not adopt it.
    if (!button.dataset.copyOriginalLabel) {
      button.dataset.copyOriginalLabel = label?.textContent ?? "";
    }
    const originalLabel = button.dataset.copyOriginalLabel ?? "";
    const doneLabel = button.dataset.copyDoneLabel ?? originalLabel;
    const failedLabel = button.dataset.copyFailedLabel ?? "";

    // Each click takes a sequence number: an older clipboard promise that settles
    // after a newer click must not overwrite the newer label or announcement.
    const attempt = Number(button.dataset.copyAttempt ?? "0") + 1;
    button.dataset.copyAttempt = String(attempt);

    void writeClipboard(resolveValue(button)).then((ok) => {
      if (Number(button.dataset.copyAttempt) !== attempt) {
        return;
      }
      // A denied clipboard must not leave a dead-looking button: both outcomes
      // swap the label and announce through the status region. Only the most
      // recent click owns the state, so drop the opposite class and any pending
      // revert — otherwise a retry inside the revert window shows both states.
      const stateClass = ok ? "copied" : "copy-failed";
      const nextLabel = ok ? doneLabel : failedLabel;
      const pendingRevert = Number(button.dataset.copyRevert ?? 0);

      if (pendingRevert) {
        window.clearTimeout(pendingRevert);
      }

      button.classList.remove(ok ? "copy-failed" : "copied");
      button.classList.add(stateClass);
      if (label && nextLabel) {
        label.textContent = nextLabel;
      }
      if (status) {
        status.textContent = nextLabel || originalLabel;
      }

      const revert = window.setTimeout(() => {
        if (Number(button.dataset.copyAttempt) !== attempt) {
          return;
        }
        button.classList.remove(stateClass);
        button.removeAttribute("data-copy-revert");
        if (label) {
          label.textContent = originalLabel;
        }
        if (status) {
          status.textContent = "";
        }
      }, ok ? REVERT_MS : FAILED_REVERT_MS);

      button.dataset.copyRevert = String(revert);
    });
  });
}

initCopyButtons();
