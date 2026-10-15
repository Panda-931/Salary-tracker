const STORAGE_KEY = "salary-tracker";
const INCOME_CATEGORIES = ["Зарплата", "Подработка", "Другое"];
const EXPENSE_CATEGORIES = ["Еда", "Транспорт", "Жильё", "Связь", "Другое"];
const CATEGORY_COLORS = ["#e07a62", "#d7b15a", "#7dba8a", "#6aa8c9", "#c48b6a"];

const monthInput = document.getElementById("month-input");
const sumIncome = document.getElementById("sum-income");
const sumExpense = document.getElementById("sum-expense");
const sumBalance = document.getElementById("sum-balance");
const balanceCard = document.querySelector(".card-balance");
const dashEmpty = document.getElementById("dash-empty");
const barsCanvas = document.getElementById("chart-bars");
const catsCanvas = document.getElementById("chart-cats");

const txForm = document.getElementById("tx-form");
const formTitle = document.getElementById("form-title");
const cancelEdit = document.getElementById("cancel-edit");
const txType = document.getElementById("tx-type");
const txAmount = document.getElementById("tx-amount");
const txCategory = document.getElementById("tx-category");
const txDate = document.getElementById("tx-date");
const txNote = document.getElementById("tx-note");
const txSubmit = document.getElementById("tx-submit");
const searchInput = document.getElementById("search-input");
const txBody = document.getElementById("tx-body");
const listEmpty = document.getElementById("list-empty");
const tableWrap = document.querySelector(".table-wrap");

const settingsForm = document.getElementById("settings-form");
const currencyInput = document.getElementById("currency-input");
const settingsStatus = document.getElementById("settings-status");
const confirmDialog = document.getElementById("confirm-dialog");

const state = loadState();
let editingId = null;
let pendingDeleteId = null;
let searchQuery = "";
let statusTimer = 0;

function defaultState() {
  return {
    settings: { currency: "сум" },
    transactions: []
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.transactions)) return defaultState();
    const currency = data.settings && String(data.settings.currency || "").trim();
    return {
      settings: { currency: currency || "сум" },
      transactions: data.transactions.filter(isTransaction)
    };
  } catch {
    return defaultState();
  }
}

function isTransaction(tx) {
  return tx
    && typeof tx.id === "string"
    && (tx.type === "income" || tx.type === "expense")
    && typeof tx.amount === "number"
    && Number.isFinite(tx.amount)
    && typeof tx.category === "string"
    && typeof tx.date === "string"
    && typeof tx.note === "string";
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      /* Открытие файла напрямую не всегда считается безопасным контекстом. */
    }
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

function todayISO() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function currentMonth() {
  return todayISO().slice(0, 7);
}

function formatMoney(value) {
  const formatted = new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2
  }).format(value);
  return `${formatted} ${state.settings.currency}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2
  }).format(value);
}

function formatDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("ru-RU");
}

function categoriesFor(type) {
  return type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

function fillCategories(selected) {
  const list = categoriesFor(txType.value);
  txCategory.replaceChildren();
  list.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    txCategory.append(option);
  });
  if (selected && list.includes(selected)) txCategory.value = selected;
}

function resetForm() {
  editingId = null;
  txForm.reset();
  txType.value = "income";
  fillCategories();
  txDate.value = todayISO();
  formTitle.textContent = "Новая операция";
  txSubmit.textContent = "Добавить";
  cancelEdit.hidden = true;
}

function showView(name) {
  document.querySelectorAll(".view").forEach((view) => {
    const active = view.id === `view-${name}`;
    view.hidden = !active;
    if (!active) return;
    view.classList.remove("is-entering");
    void view.offsetWidth;
    view.classList.add("is-entering");
  });
  document.querySelectorAll(".tab").forEach((tab) => {
    const active = tab.dataset.view === name;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  if (name === "dashboard") renderDashboard();
  if (name === "settings") currencyInput.value = state.settings.currency;
}

function monthTransactions() {
  const month = monthInput.value;
  return state.transactions.filter((tx) => tx.date.startsWith(month));
}

function render() {
  renderDashboard();
  renderList();
}

function renderDashboard() {
  const rows = monthTransactions();
  const income = rows.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + tx.amount, 0);
  const expense = rows.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + tx.amount, 0);
  const balance = income - expense;

  sumIncome.textContent = formatMoney(income);
  sumExpense.textContent = formatMoney(expense);
  sumBalance.textContent = formatMoney(balance);
  balanceCard.classList.toggle("is-negative", balance < 0);
  dashEmpty.hidden = rows.length > 0;

  const byCategory = new Map();
  rows.filter((tx) => tx.type === "expense").forEach((tx) => {
    byCategory.set(tx.category, (byCategory.get(tx.category) || 0) + tx.amount);
  });
  const categories = [...byCategory.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  if (!document.getElementById("view-dashboard").hidden) {
    drawBars(barsCanvas, income, expense);
    drawCategories(catsCanvas, categories, income);
  }
}

function renderList() {
  const query = searchQuery;
  const rows = [...state.transactions]
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .filter((tx) => {
      if (!query) return true;
      return tx.category.toLowerCase().includes(query) || tx.note.toLowerCase().includes(query);
    });

  txBody.replaceChildren();
  const nothing = rows.length === 0;
  listEmpty.hidden = !nothing;
  tableWrap.hidden = nothing;
  if (!state.transactions.length) {
    listEmpty.textContent = "Добавьте первую операцию.";
  } else if (nothing) {
    listEmpty.textContent = "Ничего не найдено.";
  }

  rows.forEach((tx) => {
    const tr = document.createElement("tr");

    const dateCell = document.createElement("td");
    dateCell.textContent = formatDate(tx.date);

    const typeCell = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `badge ${tx.type}`;
    badge.textContent = tx.type === "income" ? "Доход" : "Расход";
    typeCell.append(badge);

    const categoryCell = document.createElement("td");
    categoryCell.textContent = tx.category;

    const noteCell = document.createElement("td");
    noteCell.className = "note-cell";
    noteCell.textContent = tx.note || "—";
    if (tx.note) noteCell.title = tx.note;

    const amountCell = document.createElement("td");
    amountCell.className = `amount ${tx.type}`;
    amountCell.textContent = `${tx.type === "expense" ? "−" : "+"}${formatMoney(tx.amount)}`;

    const actions = document.createElement("td");
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "icon-btn";
    editBtn.textContent = "Изменить";
    editBtn.addEventListener("click", () => startEdit(tx.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "icon-btn";
    deleteBtn.textContent = "Удалить";
    deleteBtn.addEventListener("click", () => askDelete(tx.id));

    actions.append(editBtn, deleteBtn);
    tr.append(dateCell, typeCell, categoryCell, noteCell, amountCell, actions);
    txBody.append(tr);
  });
}

function startEdit(id) {
  const tx = state.transactions.find((item) => item.id === id);
  if (!tx) return;
  editingId = tx.id;
  txType.value = tx.type;
  fillCategories(tx.category);
  txAmount.value = String(tx.amount);
  txDate.value = tx.date;
  txNote.value = tx.note;
  formTitle.textContent = "Изменить операцию";
  txSubmit.textContent = "Сохранить";
  cancelEdit.hidden = false;
  showView("operations");
  txForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function askDelete(id) {
  pendingDeleteId = id;
  confirmDialog.showModal();
}

function fitCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height, 1);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height };
}

function roundRect(ctx, x, y, width, height, radius) {
  if (width <= 0 || height <= 0) return;
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawEmpty(ctx, width, height, pad) {
  ctx.fillStyle = "#8d9b8e";
  ctx.font = "14px Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Нет данных", pad.left + (width - pad.left - pad.right) / 2, pad.top + (height - pad.top - pad.bottom) / 2);
}

function shadeColor(hex, amount) {
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift) => Math.min(255, Math.max(0, ((value >> shift) & 255) + amount));
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

function drawBar3d(ctx, x, y, barWidth, barHeight, color) {
  const depthX = 18;
  const depthY = 14;

  ctx.beginPath();
  ctx.moveTo(x + barWidth, y);
  ctx.lineTo(x + barWidth + depthX, y - depthY);
  ctx.lineTo(x + barWidth + depthX, y + barHeight - depthY);
  ctx.lineTo(x + barWidth, y + barHeight);
  ctx.closePath();
  ctx.fillStyle = shadeColor(color, -42);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + depthX, y - depthY);
  ctx.lineTo(x + barWidth + depthX, y - depthY);
  ctx.lineTo(x + barWidth, y);
  ctx.closePath();
  ctx.fillStyle = shadeColor(color, 38);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.fillRect(x, y, barWidth, barHeight);
}

function drawBars(canvas, income, expense) {
  const { ctx, width, height } = fitCanvas(canvas);
  ctx.clearRect(0, 0, width, height);

  const pad = { left: 72, right: 36, top: 42, bottom: 40 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const max = Math.max(income, expense, 1);

  ctx.strokeStyle = "#2a342c";
  ctx.fillStyle = "#8d9b8e";
  ctx.font = "12px Segoe UI, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 1;

  for (let step = 0; step <= 4; step += 1) {
    const value = (max / 4) * step;
    const y = pad.top + plotHeight - (plotHeight * step) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.fillText(formatNumber(value), pad.left - 8, y);
  }

  if (income === 0 && expense === 0) {
    drawEmpty(ctx, width, height, pad);
    return;
  }

  const bars = [
    { label: "Доход", value: income, color: "#3d8ef0", center: pad.left + plotWidth * 0.33 },
    { label: "Расход", value: expense, color: "#e07a62", center: pad.left + plotWidth * 0.66 }
  ];
  const barWidth = Math.min(78, plotWidth / 5);

  bars.forEach((bar) => {
    const barHeight = (bar.value / max) * (plotHeight - 20);
    const x = bar.center - barWidth / 2;
    const y = pad.top + plotHeight - barHeight;
    if (barHeight > 0) {
      drawBar3d(ctx, x, y, barWidth, barHeight, bar.color);

      ctx.fillStyle = "#e7eee6";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.font = "13px Bahnschrift, Segoe UI, sans-serif";
      ctx.fillText(formatMoney(bar.value), bar.center + 8, Math.max(18, y - 20));
    }

    ctx.fillStyle = "#8d9b8e";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = "13px Segoe UI, sans-serif";
    ctx.fillText(bar.label, bar.center, pad.top + plotHeight + 10);
  });
}

function ellipsePoint(centerX, centerY, radiusX, radiusY, angle) {
  return {
    x: centerX + Math.cos(angle) * radiusX,
    y: centerY + Math.sin(angle) * radiusY
  };
}

function fillExtrusion(ctx, points, thickness, color) {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.forEach((point) => ctx.lineTo(point.x, point.y));
  for (let index = points.length - 1; index >= 0; index -= 1) {
    ctx.lineTo(points[index].x, points[index].y + thickness);
  }
  ctx.closePath();
  ctx.fillStyle = shadeColor(color, -50);
  ctx.fill();
}

function drawSliceSide(ctx, centerX, centerY, radiusX, radiusY, start, end, color, thickness) {
  const steps = Math.max(2, Math.ceil((end - start) / 0.08));
  let points = [];
  const flush = () => {
    fillExtrusion(ctx, points, thickness, color);
    points = [];
  };

  for (let step = 0; step <= steps; step += 1) {
    const angle = start + (end - start) * (step / steps);
    if (Math.sin(angle) > 0) {
      points.push(ellipsePoint(centerX, centerY, radiusX, radiusY, angle));
    } else if (points.length) {
      flush();
    }
  }
  flush();
}

function drawSliceTop(ctx, centerX, centerY, radiusX, radiusY, start, end, color) {
  const steps = Math.max(2, Math.ceil((end - start) / 0.08));
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  for (let step = 0; step <= steps; step += 1) {
    const angle = start + (end - start) * (step / steps);
    const point = ellipsePoint(centerX, centerY, radiusX, radiusY, angle);
    ctx.lineTo(point.x, point.y);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = shadeColor(color, 28);
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawCategories(canvas, items, income) {
  const { ctx, width, height } = fitCanvas(canvas);
  ctx.clearRect(0, 0, width, height);

  const expenseSum = items.reduce((sum, item) => sum + item.value, 0);
  const scaleMax = Math.max(income, expenseSum);
  const slices = items.map((item, index) => ({
    name: item.name,
    value: item.value,
    color: CATEGORY_COLORS[index % CATEGORY_COLORS.length]
  }));
  if (income > expenseSum) {
    slices.push({
      name: "Остаток",
      value: income - expenseSum,
      color: "#2f6d52"
    });
  }

  const scaleWidth = 92;
  const legendWidth = Math.min(156, width * 0.34);
  const thickness = 20;
  const centerX = (scaleWidth + (width - legendWidth)) / 2;
  const centerY = height / 2 - 6;
  const radiusX = Math.max(Math.min((width - legendWidth - scaleWidth) / 2 - 6, (height / 2) - 36), 68);
  const radiusY = radiusX * 0.58;

  if (!scaleMax) {
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "#2a342c";
    ctx.stroke();
    ctx.fillStyle = "#8d9b8e";
    ctx.font = "14px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Нет данных", centerX, centerY);
    return;
  }

  const scaleTop = centerY - radiusY;
  const scaleBottom = centerY + radiusY + thickness;
  const scaleX = scaleWidth - 8;
  ctx.strokeStyle = "#8d9b8e";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(scaleX, scaleTop);
  ctx.lineTo(scaleX, scaleBottom);
  ctx.stroke();
  ctx.fillStyle = "#c5d0c6";
  ctx.font = "11px Segoe UI, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let step = 0; step <= 4; step += 1) {
    const ratio = step / 4;
    const y = scaleBottom - (scaleBottom - scaleTop) * ratio;
    ctx.beginPath();
    ctx.moveTo(scaleX - 5, y);
    ctx.lineTo(scaleX, y);
    ctx.stroke();
    ctx.fillText(formatNumber(scaleMax * ratio), scaleX - 8, y);
  }

  let angle = -Math.PI / 2;
  const prepared = slices.map((slice) => {
    const sweep = (slice.value / scaleMax) * Math.PI * 2;
    const start = angle;
    angle += sweep;
    return { ...slice, start, end: angle };
  });

  ctx.beginPath();
  ctx.ellipse(centerX, scaleBottom + 8, radiusX * 0.92, radiusY * 0.34, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.fill();

  prepared.forEach((slice) => {
    drawSliceSide(ctx, centerX, centerY, radiusX, radiusY, slice.start, slice.end, slice.color, thickness);
  });
  prepared.forEach((slice) => {
    drawSliceTop(ctx, centerX, centerY, radiusX, radiusY, slice.start, slice.end, slice.color);
  });

  const legend = [
    { name: "Доход", value: income, color: "#d7b15a" },
    ...prepared
  ];
  const rowHeight = Math.min(36, (height - 16) / legend.length);
  const legendTop = Math.max(8, (height - rowHeight * legend.length) / 2);
  const legendX = width - legendWidth + 12;
  legend.forEach((item, index) => {
    const y = legendTop + index * rowHeight + rowHeight / 2;
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.arc(legendX, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#c5d0c6";
    ctx.font = "12px Segoe UI, sans-serif";
    ctx.fillText(item.name, legendX + 14, y - 7);
    ctx.fillStyle = "#e7eee6";
    ctx.font = "12px Bahnschrift, Segoe UI, sans-serif";
    ctx.fillText(formatMoney(item.value), legendX + 14, y + 8);
  });
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => showView(tab.dataset.view));
});

monthInput.addEventListener("change", renderDashboard);

txType.addEventListener("change", () => fillCategories());

txForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const amount = Number(txAmount.value);
  if (!Number.isFinite(amount) || amount <= 0) return;

  const transaction = {
    id: editingId || createId(),
    type: txType.value,
    amount,
    category: txCategory.value,
    date: txDate.value,
    note: txNote.value.trim()
  };

  if (editingId) {
    const index = state.transactions.findIndex((tx) => tx.id === editingId);
    if (index >= 0) state.transactions[index] = transaction;
  } else {
    state.transactions.push(transaction);
  }

  saveState();
  resetForm();
  render();
});

cancelEdit.addEventListener("click", resetForm);

searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value.trim().toLowerCase();
  renderList();
});

settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const currency = currencyInput.value.trim();
  if (!currency) return;
  state.settings.currency = currency;
  saveState();
  render();
  settingsStatus.hidden = false;
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => {
    settingsStatus.hidden = true;
  }, 1800);
});

confirmDialog.addEventListener("close", () => {
  if (confirmDialog.returnValue === "ok" && pendingDeleteId) {
    state.transactions = state.transactions.filter((tx) => tx.id !== pendingDeleteId);
    if (editingId === pendingDeleteId) resetForm();
    saveState();
    render();
  }
  pendingDeleteId = null;
});

window.addEventListener("resize", () => {
  if (!document.getElementById("view-dashboard").hidden) renderDashboard();
});

monthInput.value = currentMonth();
currencyInput.value = state.settings.currency;
resetForm();
render();
