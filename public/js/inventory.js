(function () {
  const input = document.getElementById("inventorySearch");
  if (!input) return;
  const rows = Array.from(document.querySelectorAll("section.card table.table tbody tr"));
  input.addEventListener("input", () => {
    const term = input.value.trim().toLowerCase();
    rows.forEach((row) => {
      const hay = row.getAttribute("data-search") || "";
      row.style.display = term === "" || hay.includes(term) ? "" : "none";
    });
  });
})();
