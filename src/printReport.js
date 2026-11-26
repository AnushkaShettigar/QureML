// Opens the browser's print dialog for the current report with a meaningful
// document title, so "Save as PDF" proposes a good file name instead of the
// app's page title. The original title is restored once printing is done.
export function printReport(title) {
  const previous = document.title;
  const safe = String(title || "QureML-Report")
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);

  const restore = () => {
    document.title = previous;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);

  document.title = safe;
  window.print();
}
