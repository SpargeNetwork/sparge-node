(function () {
  const filterInput = document.getElementById("itemFilter");
  const select = document.getElementById("itemSelect");
  const priceInput = document.getElementById("unitPrice");
  const qtyInput = document.querySelector('input[name="quantity"]');
  const lineTotalInput = document.getElementById("lineTotal");
  if (!filterInput || !select) return;
  const options = Array.from(select.options);
  function setPriceFromSelection() {
    if (!priceInput) return;
    const selected = options.find((opt) => opt.value === select.value);
    if (!selected) return;
    const price = selected.getAttribute("data-price") || "0";
    priceInput.value = Number(price).toFixed(2);
    updateLineTotal();
  }
  function updateLineTotal() {
    if (!lineTotalInput || !priceInput || !qtyInput) return;
    const qty = Number(qtyInput.value || 0);
    const price = Number(priceInput.value || 0);
    lineTotalInput.value = (qty * price).toFixed(2);
  }
  filterInput.addEventListener("input", () => {
    const term = filterInput.value.trim().toLowerCase();
    options.forEach((opt) => {
      const text = opt.text.toLowerCase();
      const match = term === "" || text.includes(term);
      opt.hidden = !match;
    });
    const firstVisible = options.find((opt) => !opt.hidden);
    if (firstVisible) {
      select.value = firstVisible.value;
      setPriceFromSelection();
    }
  });
  select.addEventListener("change", setPriceFromSelection);
  if (priceInput) priceInput.addEventListener("input", updateLineTotal);
  if (qtyInput) qtyInput.addEventListener("input", updateLineTotal);
  setPriceFromSelection();
})();
