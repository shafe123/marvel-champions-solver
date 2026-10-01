export function restoreSwapFocus(container, assignment) {
  const control = [
    ...container.querySelectorAll(".assignment-swap-control"),
  ].find(
    ({ dataset }) =>
      dataset.villain === assignment.villain &&
      dataset.player === assignment.player,
  );
  if (!control) {
    return false;
  }
  control.focus();
  return true;
}
