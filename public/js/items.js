(function () {
  const input = document.getElementById("itemSearch");
  if (!input) return;
  const rows = Array.from(document.querySelectorAll("table.table tbody tr"));
  input.addEventListener("input", () => {
    const term = input.value.trim().toLowerCase();
    rows.forEach((row) => {
      const hay = row.getAttribute("data-search") || "";
      row.style.display = term === "" || hay.includes(term) ? "" : "none";
    });
  });
})();
