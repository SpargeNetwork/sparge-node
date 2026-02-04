import path from "path";
import express, { Request, Response, NextFunction } from "express";
import session from "express-session";
import bcrypt from "bcryptjs";
import {
  readData,
  updateData,
  nextId,
  DataStore,
  POStatus,
  StockMovementType,
  Item,
  Supplier,
  PurchaseOrder,
} from "./store";

const app = express();

const PO_STATUS: Record<string, POStatus> = {
  CONCEPT: "CONCEPT",
  OPEN: "OPEN",
  PARTIAL: "PARTIAL",
  RECEIVED: "RECEIVED",
};

const STOCK_MOVEMENT: Record<string, StockMovementType> = {
  IN: "IN",
  OUT: "OUT",
  ADJUSTMENT: "ADJUSTMENT",
  PRODUCTION: "PRODUCTION",
};

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "src", "views"));
app.use(express.static(path.join(__dirname, "..", "public")));
app.use(express.urlencoded({ extended: true }));
app.use((_req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self'"
  );
  next();
});

app.use(
  session({
    secret: process.env.SESSION_SECRET || "boecht-dev-secret",
    resave: false,
    saveUninitialized: false,
  })
);

app.use((req, res, next) => {
  res.locals.userId = req.session.userId;
  next();
});

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.redirect("/login");
  }
  return next();
}

function parseQty(value: string) {
  const normalized = String(value ?? "").replace(",", ".");
  const parsed = Number(normalized);
  if (Number.isNaN(parsed)) {
    return 0;
  }
  return parsed;
}

function parseOptionalRate(value: string) {
  const trimmed = String(value ?? "").trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  if (Number.isNaN(parsed)) {
    throw new Error("Invalid VAT rate");
  }
  return parsed;
}

function logPo(
  data: DataStore,
  poId: number,
  userId: number | null | undefined,
  action: string,
  details: string
) {
  data.poLogs.push({
    id: nextId(data.poLogs),
    purchaseOrderId: poId,
    userId: userId ?? null,
    action,
    details,
    createdAt: new Date().toISOString(),
  });
}

function logReceipt(
  data: DataStore,
  receiptId: number,
  userId: number | null | undefined,
  action: string,
  details: string,
  relatedReceiptId?: number | null
) {
  data.receiptLogs.push({
    id: nextId(data.receiptLogs),
    receiptId,
    userId: userId ?? null,
    action,
    details,
    createdAt: new Date().toISOString(),
    relatedReceiptId: relatedReceiptId ?? null,
  });
}

function todayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function statusLabel(status: POStatus) {
  if (status === PO_STATUS.CONCEPT) return "Concept";
  if (status === PO_STATUS.RECEIVED) return "Ontvangen";
  if (status === PO_STATUS.PARTIAL) return "Deels ontvangen";
  return "Besteld";
}

function generatePoNumber(data: DataStore) {
  let max = 0;
  for (const po of data.purchaseOrders) {
    const match = /^PO-(\d+)$/.exec(po.poNumber);
    if (match) {
      const num = Number(match[1]);
      if (num > max) max = num;
    }
  }
  const next = String(max + 1).padStart(4, "0");
  return `PO-${next}`;
}

function generateReceiptNumber(data: DataStore) {
  let max = 0;
  for (const receipt of data.goodsReceipts) {
    const match = /^IN\/(\d+)$/.exec(receipt.deliveryNoteNo || "");
    if (match) {
      const num = Number(match[1]);
      if (num > max) max = num;
    }
  }
  const next = String(max + 1).padStart(3, "0");
  return `IN/${next}`;
}

function parseExpiryDate(value: string) {
  const trimmed = String(value || "").trim();
  if (trimmed === "0") return "0";
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    throw new Error("Expiry date must be YYYY-MM-DD or 0");
  }
  return trimmed;
}

function isExpired(expiryDate: string, now: Date) {
  if (expiryDate === "0") return false;
  const parsed = Date.parse(expiryDate);
  if (Number.isNaN(parsed)) return false;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return parsed < todayStart;
}

function slugifySku(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 24);
}

function generateGroupSku(data: DataStore, name: string, excludeId?: number) {
  const base = `GRP-${slugifySku(name) || "ITEM"}`;
  let candidate = base;
  let counter = 2;
  const exists = (sku: string) =>
    data.items.some((item) => item.sku === sku && item.id !== excludeId);
  while (exists(candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  return candidate;
}

function ensureItem(data: DataStore, itemId: number): Item {
  return (
    data.items.find((item) => item.id === itemId) || {
      id: itemId,
      sku: "UNKNOWN",
      name: "Unknown item",
      category: null,
      manufacturer: null,
      supplierId: null,
      parentItemId: null,
      purchasePrice: 0,
      baseUnit: "",
      allowedDecimals: 2,
      minStock: 0,
    }
  );
}

function ensureSupplier(data: DataStore, supplierId: number): Supplier {
  return (
    data.suppliers.find((supplier) => supplier.id === supplierId) || {
      id: supplierId,
      name: "Unknown supplier",
      email: null,
      phone: null,
      address: null,
    }
  );
}

function ensurePurchaseOrder(data: DataStore, poId: number) {
  return (
    data.purchaseOrders.find((po) => po.id === poId) || {
      id: poId,
      poNumber: "Unknown",
      supplierId: 0,
      status: PO_STATUS.OPEN,
      createdAt: new Date().toISOString(),
    }
  );
}

function ensureBOM(data: DataStore, bomId: number) {
  return (
    data.boms.find((bom) => bom.id === bomId) || {
      id: bomId,
      name: "Unknown BOM",
      finishedItemId: 0,
      outputQty: 0,
      outputUnit: "",
    }
  );
}

function getUnitFactor(data: DataStore, itemId: number, unitName: string) {
  const item = data.items.find((i) => i.id === itemId);
  if (!item) {
    throw new Error("Item not found");
  }
  if (String(unitName).trim().toLowerCase() === String(item.baseUnit).trim().toLowerCase()) {
    return 1;
  }
  const normalized = String(unitName).trim().toLowerCase();
  const conversion = data.unitConversions.find((c) => {
    if (c.itemId !== itemId) return false;
    return String(c.unitName).trim().toLowerCase() === normalized;
  });
  if (!conversion) {
    throw new Error(`Missing conversion for ${unitName}`);
  }
  return Number(conversion.toBaseFactor);
}

function updatePOStatus(data: DataStore, poId: number) {
  const po = data.purchaseOrders.find((order) => order.id === poId);
  if (!po) return;
  if (po.status === PO_STATUS.CONCEPT) return;

  const lines = data.purchaseOrderLines.filter((line) => line.purchaseOrderId === poId);

  let anyReceived = false;
  let allComplete = true;

  for (const line of lines) {
    let orderedFactor = 1;
    try {
      orderedFactor = getUnitFactor(data, line.itemId, line.unit);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`Missing unit conversion for PO line ${line.id}`);
      allComplete = false;
      continue;
    }

    const orderedBase = Number(line.quantity) * orderedFactor;
    const receivedLines = data.goodsReceiptLines.filter((r) => r.poLineId === line.id);

    let receivedBase = 0;
    for (const receiptLine of receivedLines) {
      try {
        const receivedFactor = getUnitFactor(data, receiptLine.itemId, receiptLine.unit);
        receivedBase += Number(receiptLine.quantity) * receivedFactor;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`Missing unit conversion for receipt line ${receiptLine.id}`);
        allComplete = false;
      }
    }

    if (receivedBase > 0) {
      anyReceived = true;
    }

    if (receivedBase + 1e-6 < orderedBase) {
      allComplete = false;
    }
  }

  let status = PO_STATUS.OPEN;
  if (anyReceived && !allComplete) status = PO_STATUS.PARTIAL;
  if (allComplete && lines.length > 0) status = PO_STATUS.RECEIVED;

  po.status = status;
  if (status === PO_STATUS.RECEIVED) {
    const receipts = data.goodsReceipts.filter((r) => r.purchaseOrderId === poId);
    if (receipts.length > 0) {
      po.receivedDate = receipts[receipts.length - 1].receivedAt.slice(0, 10);
    }
  } else {
    po.receivedDate = null;
  }
}

async function ensureAdminUser() {
  const username = "admin";
  await updateData(async (data) => {
    const existing = data.users.find((user) => user.username === username);
    if (!existing) {
      const password = process.env.ADMIN_PASSWORD || "admin";
      const passwordHash = await bcrypt.hash(password, 10);
      data.users.push({
        id: nextId(data.users),
        username,
        passwordHash,
        createdAt: new Date().toISOString(),
      });
      // eslint-disable-next-line no-console
      console.log(`Admin user created. Username: admin Password: ${password}`);
    }
  });
}

app.get("/login", (_req, res) => {
  res.render("login", { error: null });
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await readData((data) =>
    data.users.find((entry) => entry.username === username)
  );
  if (!user) {
    return res.render("login", { error: "Invalid credentials" });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.render("login", { error: "Invalid credentials" });
  }
  req.session.userId = user.id;
  return res.redirect("/dashboard");
});

app.post("/logout", requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

app.get("/", (_req, res) => res.redirect("/dashboard"));

app.get("/dashboard", requireAuth, async (_req, res) => {
  const counts = await readData((data) => ({
    itemCount: data.items.length,
    supplierCount: data.suppliers.length,
    poCount: data.purchaseOrders.length,
    bomCount: data.boms.length,
  }));
  res.render("dashboard", counts);
});

app.get("/items", requireAuth, async (_req, res) => {
  const { items, stockMap, supplierMap, parentMap } = await readData((data) => {
    const map = new Map<number, number>();
    for (const movement of data.stockMovements) {
      map.set(movement.itemId, (map.get(movement.itemId) || 0) + movement.quantity);
    }
    const suppliers = new Map<number, string>();
    for (const supplier of data.suppliers) {
      suppliers.set(supplier.id, supplier.name);
    }
    const parents = new Map<number, string>();
    for (const item of data.items) {
      parents.set(item.id, item.name);
    }
    return {
      items: [...data.items].sort((a, b) => a.name.localeCompare(b.name)),
      stockMap: map,
      supplierMap: suppliers,
      parentMap: parents,
    };
  });
  res.render("items/index", { items, stockMap, supplierMap, parentMap });
});

app.get("/items/new", requireAuth, (_req, res) => {
  readData((data) =>
    res.render("items/new", {
      suppliers: [...data.suppliers].sort((a, b) => a.name.localeCompare(b.name)),
      parentItems: data.items
        .filter((item) => item.parentItemId == null)
        .sort((a, b) => a.name.localeCompare(b.name)),
    })
  );
});

app.post("/items", requireAuth, async (req, res) => {
  const {
    sku,
    name,
    category,
    manufacturer,
    supplierId,
    parentItemId,
    purchasePrice,
    baseUnit,
    allowedDecimals,
    minStock,
  } = req.body;
  try {
    await updateData((data) => {
      const parentId = parentItemId ? Number(parentItemId) : null;
      if (parentId) {
        const parent = data.items.find((item) => item.id === parentId);
        if (!parent) throw new Error("Parent item not found");
        if (parent.baseUnit !== baseUnit) {
          throw new Error("Parent item base unit must match");
        }
      }
      const trimmedSku = String(sku || "").trim();
      const finalSku =
        parentId === null && trimmedSku === ""
          ? generateGroupSku(data, name)
          : trimmedSku;
      if (parentId !== null && finalSku === "") {
        throw new Error("Child items require a SKU");
      }
      if (finalSku !== "" && data.items.some((item) => item.sku === finalSku)) {
        throw new Error("SKU already exists");
      }
      data.items.push({
        id: nextId(data.items),
        sku: finalSku,
        name,
        category: category || null,
        manufacturer: manufacturer || null,
        supplierId: supplierId ? Number(supplierId) : null,
        parentItemId: parentId,
        purchasePrice: parseQty(purchasePrice),
        baseUnit,
        allowedDecimals: Number(allowedDecimals),
        minStock: parseQty(minStock),
      });
    });
  } catch (err) {
    return res.status(400).render("error", { message: (err as Error).message });
  }
  res.redirect("/items");
});

app.get("/items/:id/edit", requireAuth, async (req, res) => {
  const result = await readData((data) => {
    const item = data.items.find((i) => i.id === Number(req.params.id));
    if (!item) return null;
    return {
      item,
      suppliers: [...data.suppliers].sort((a, b) => a.name.localeCompare(b.name)),
      parentItems: data.items
        .filter((entry) => entry.parentItemId == null && entry.id !== item.id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
  if (!result) return res.redirect("/items");
  res.render("items/edit", result);
});

app.post("/items/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const {
    sku,
    name,
    category,
    manufacturer,
    supplierId,
    parentItemId,
    purchasePrice,
    baseUnit,
    allowedDecimals,
    minStock,
  } = req.body;
  try {
    await updateData((data) => {
      const parentId = parentItemId ? Number(parentItemId) : null;
      if (parentId === id) {
        throw new Error("Item cannot be its own parent");
      }
      if (parentId) {
        const parent = data.items.find((item) => item.id === parentId);
        if (!parent) throw new Error("Parent item not found");
        if (parent.baseUnit !== baseUnit) {
          throw new Error("Parent item base unit must match");
        }
      }
      const item = data.items.find((i) => i.id === id);
      if (!item) return;
      const trimmedSku = String(sku || "").trim();
      const finalSku =
        parentId === null && trimmedSku === ""
          ? generateGroupSku(data, name, id)
          : trimmedSku;
      if (parentId !== null && finalSku === "") {
        throw new Error("Child items require a SKU");
      }
      if (
        finalSku !== "" &&
        data.items.some((entry) => entry.sku === finalSku && entry.id !== id)
      ) {
        throw new Error("SKU already exists");
      }
      item.sku = finalSku;
      item.name = name;
      item.category = category || null;
      item.manufacturer = manufacturer || null;
      item.supplierId = supplierId ? Number(supplierId) : null;
      item.parentItemId = parentId;
      item.purchasePrice = parseQty(purchasePrice);
      item.baseUnit = baseUnit;
      item.allowedDecimals = Number(allowedDecimals);
      item.minStock = parseQty(minStock);
    });
  } catch (err) {
    return res.status(400).render("error", { message: (err as Error).message });
  }
  res.redirect("/items");
});

app.post("/items/:id/delete", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  await updateData((data) => {
    data.items = data.items.filter((i) => i.id !== id);
    data.unitConversions = data.unitConversions.filter((c) => c.itemId !== id);
  });
  res.redirect("/items");
});

app.get("/items/:id/conversions", requireAuth, async (req, res) => {
  const itemId = Number(req.params.id);
  const { item, conversions } = await readData((data) => ({
    item: data.items.find((i) => i.id === itemId),
    conversions: data.unitConversions
      .filter((c) => c.itemId === itemId)
      .sort((a, b) => a.unitName.localeCompare(b.unitName)),
  }));
  if (!item) return res.redirect("/items");
  res.render("items/conversions", { item, conversions });
});

app.post("/items/:id/conversions", requireAuth, async (req, res) => {
  const itemId = Number(req.params.id);
  const { unitName, toBaseFactor } = req.body;
  await updateData((data) => {
    data.unitConversions.push({
      id: nextId(data.unitConversions),
      itemId,
      unitName,
      toBaseFactor: parseQty(toBaseFactor),
    });
  });
  res.redirect(`/items/${itemId}/conversions`);
});

app.get("/items/:id/conversions/:cid/edit", requireAuth, async (req, res) => {
  const conversion = await readData((data) => {
    const entry = data.unitConversions.find((c) => c.id === Number(req.params.cid));
    if (!entry) return null;
    return { ...entry, item: ensureItem(data, entry.itemId) };
  });
  if (!conversion) return res.redirect("/items");
  res.render("items/conversion_edit", { conversion });
});

app.post("/items/:id/conversions/:cid", requireAuth, async (req, res) => {
  const { unitName, toBaseFactor } = req.body;
  const id = Number(req.params.cid);
  const conversion = await updateData((data) => {
    const entry = data.unitConversions.find((c) => c.id === id);
    if (!entry) return null;
    entry.unitName = unitName;
    entry.toBaseFactor = parseQty(toBaseFactor);
    return entry;
  });
  if (!conversion) return res.redirect("/items");
  res.redirect(`/items/${conversion.itemId}/conversions`);
});

app.post("/items/:id/conversions/:cid/delete", requireAuth, async (req, res) => {
  const id = Number(req.params.cid);
  const conversion = await updateData((data) => {
    const entry = data.unitConversions.find((c) => c.id === id);
    data.unitConversions = data.unitConversions.filter((c) => c.id !== id);
    return entry;
  });
  if (!conversion) return res.redirect("/items");
  res.redirect(`/items/${conversion.itemId}/conversions`);
});

app.get("/suppliers", requireAuth, async (_req, res) => {
  const suppliers = await readData((data) =>
    [...data.suppliers].sort((a, b) => a.name.localeCompare(b.name))
  );
  res.render("suppliers/index", { suppliers });
});

app.get("/suppliers/new", requireAuth, (_req, res) => {
  res.render("suppliers/new");
});

app.post("/suppliers", requireAuth, async (req, res) => {
  const { name, email, phone, address } = req.body;
  await updateData((data) => {
    data.suppliers.push({
      id: nextId(data.suppliers),
      name,
      email: email || null,
      phone: phone || null,
      address: address || null,
    });
  });
  res.redirect("/suppliers");
});

app.get("/suppliers/:id/edit", requireAuth, async (req, res) => {
  const supplier = await readData((data) =>
    data.suppliers.find((s) => s.id === Number(req.params.id))
  );
  if (!supplier) return res.redirect("/suppliers");
  res.render("suppliers/edit", { supplier });
});

app.post("/suppliers/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { name, email, phone, address } = req.body;
  await updateData((data) => {
    const supplier = data.suppliers.find((s) => s.id === id);
    if (!supplier) return;
    supplier.name = name;
    supplier.email = email || null;
    supplier.phone = phone || null;
    supplier.address = address || null;
  });
  res.redirect("/suppliers");
});

app.post("/suppliers/:id/delete", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  await updateData((data) => {
    data.suppliers = data.suppliers.filter((s) => s.id !== id);
  });
  res.redirect("/suppliers");
});

app.get("/pos", requireAuth, async (_req, res) => {
  const pos = await readData((data) =>
    data.purchaseOrders
      .map((po) => ({
        ...po,
        supplier: ensureSupplier(data, po.supplierId),
        statusLabel: statusLabel(po.status),
        createdAt: new Date(po.createdAt),
      }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  );
  res.render("pos/index", { pos });
});

app.get("/pos/new", requireAuth, async (_req, res) => {
  const suppliers = await readData((data) =>
    [...data.suppliers].sort((a, b) => a.name.localeCompare(b.name))
  );
  res.render("pos/new", { suppliers, today: todayIso() });
});

app.post("/pos", requireAuth, async (req, res) => {
  const { poNumber, supplierId, orderDate, transportCost } = req.body;
  const po = await updateData((data) => {
    const trimmedPo = String(poNumber || "").trim();
    const finalPo = trimmedPo === "" ? generatePoNumber(data) : trimmedPo;
    if (data.purchaseOrders.some((entry) => entry.poNumber === finalPo)) {
      throw new Error("PO number already exists");
    }
    const entry = {
      id: nextId(data.purchaseOrders),
      poNumber: finalPo,
      supplierId: Number(supplierId),
      status: PO_STATUS.CONCEPT,
      createdAt: new Date().toISOString(),
      createdByUserId: req.session.userId ?? null,
      orderDate: String(orderDate || "").trim() || todayIso(),
      receivedDate: null,
      transportCost: parseQty(transportCost),
      vatRateDefault: null,
    };
    data.purchaseOrders.push(entry);
    logPo(
      data,
      entry.id,
      req.session.userId ?? null,
      "created",
      `PO ${entry.poNumber} created`
    );
    return entry;
  });
  res.redirect(`/pos/${po.id}`);
});

app.get("/pos/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const result = await readData((data) => {
    const po = data.purchaseOrders.find((entry) => entry.id === id);
    if (!po) return null;
    const lines = data.purchaseOrderLines
      .filter((line) => line.purchaseOrderId === id)
      .map((line) => ({ ...line, item: ensureItem(data, line.itemId) }));
    const receipts = data.goodsReceipts
      .filter((receipt) => receipt.purchaseOrderId === id)
      .map((receipt) => ({
        ...receipt,
        receivedAt: receipt.receivedAt ? new Date(receipt.receivedAt) : null,
        createdAt: receipt.createdAt ? new Date(receipt.createdAt) : null,
      }));
    const usersById = new Map(data.users.map((user) => [user.id, user.username]));
    const logs = data.poLogs
      .filter((entry) => entry.purchaseOrderId === id)
      .map((entry) => ({
        ...entry,
        createdAt: new Date(entry.createdAt),
        username: entry.userId ? usersById.get(entry.userId) || "Unknown" : "Unknown",
      }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return {
      po: {
        ...po,
        supplier: ensureSupplier(data, po.supplierId),
        statusLabel: statusLabel(po.status),
        lines,
        receipts,
        createdByName: po.createdByUserId
          ? usersById.get(po.createdByUserId) || "Unknown"
          : "-",
      },
      logs,
      items: [...data.items].sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
  if (!result) return res.redirect("/pos");
  res.render("pos/show", result);
});

app.post("/pos/:id/confirm", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  try {
    await updateData((data) => {
      const po = data.purchaseOrders.find((entry) => entry.id === id);
      if (!po) return;
      if (po.status !== PO_STATUS.CONCEPT) {
        throw new Error("PO already confirmed");
      }
      const lines = data.purchaseOrderLines.filter((line) => line.purchaseOrderId === id);
      if (lines.length === 0) {
        throw new Error("Add at least one line before confirming");
      }
      po.status = PO_STATUS.OPEN;
      if (!po.orderDate) {
        po.orderDate = todayIso();
      }
      logPo(data, id, req.session.userId ?? null, "confirmed", "PO confirmed");
    });
  } catch (err) {
    return res.status(400).render("error", { message: (err as Error).message });
  }
  res.redirect(`/pos/${id}`);
});

app.get("/pos/:id/edit", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  let result: { po: PurchaseOrder & { statusLabel: string }; suppliers: Supplier[] } | null =
    null;
  try {
    result = await readData((data) => {
      const po = data.purchaseOrders.find((entry) => entry.id === id);
      if (!po) return null;
      if (po.status !== PO_STATUS.CONCEPT) {
        throw new Error("Only Concept PO can be edited");
      }
      return {
        po: { ...po, statusLabel: statusLabel(po.status) },
        suppliers: [...data.suppliers].sort((a, b) => a.name.localeCompare(b.name)),
      };
    });
  } catch (err) {
    return res.status(400).render("error", { message: (err as Error).message });
  }
  if (!result) return res.redirect("/pos");
  res.render("pos/edit", result);
});

app.post("/pos/:id/update", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { poNumber, supplierId, orderDate, transportCost } = req.body;
  try {
    await updateData((data) => {
      const po = data.purchaseOrders.find((entry) => entry.id === id);
      if (!po) return;
      if (po.status !== PO_STATUS.CONCEPT) {
        throw new Error("Only Concept PO can be edited");
      }
    const trimmedPo = String(poNumber || "").trim();
    const finalPo = trimmedPo === "" ? generatePoNumber(data) : trimmedPo;
    if (data.purchaseOrders.some((entry) => entry.poNumber === finalPo && entry.id !== id)) {
      throw new Error("PO number already exists");
    }
      po.poNumber = finalPo;
      po.supplierId = Number(supplierId);
      po.orderDate = String(orderDate || "").trim() || po.orderDate;
      po.transportCost = parseQty(transportCost);
      logPo(data, id, req.session.userId ?? null, "updated", "PO details updated");
    });
  } catch (err) {
    return res.status(400).render("error", { message: (err as Error).message });
  }
  res.redirect(`/pos/${id}`);
});

app.post("/pos/:id/vat", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { vatRateDefault } = req.body;
  try {
    await updateData((data) => {
      const po = data.purchaseOrders.find((entry) => entry.id === id);
      if (!po) return;
      if (po.status !== PO_STATUS.CONCEPT) {
        throw new Error("Only Concept PO can be edited");
      }
      const parsedRate = parseOptionalRate(vatRateDefault);
      po.vatRateDefault = parsedRate;
      logPo(
        data,
        id,
        req.session.userId ?? null,
        "vat-updated",
        parsedRate == null ? "PO VAT cleared" : `PO VAT set to ${parsedRate}%`
      );
    });
  } catch (err) {
    return res.status(400).render("error", { message: (err as Error).message });
  }
  res.redirect(`/pos/${id}`);
});

app.post("/pos/:id/clear-line-vat", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  try {
    await updateData((data) => {
      const po = data.purchaseOrders.find((entry) => entry.id === id);
      if (!po) return;
      if (po.status !== PO_STATUS.CONCEPT) {
        throw new Error("Only Concept PO can be edited");
      }
      for (const line of data.purchaseOrderLines) {
        if (line.purchaseOrderId === id) {
          line.vatRate = null;
        }
      }
      logPo(data, id, req.session.userId ?? null, "vat-cleared", "Cleared VAT on all lines");
    });
  } catch (err) {
    return res.status(400).render("error", { message: (err as Error).message });
  }
  res.redirect(`/pos/${id}`);
});

app.post("/pos/:id/lines", requireAuth, async (req, res) => {
  const purchaseOrderId = Number(req.params.id);
  const { itemId, quantity, unit, unitPrice, vatRate } = req.body;
  try {
    await updateData((data) => {
      const po = data.purchaseOrders.find((entry) => entry.id === purchaseOrderId);
      if (!po) return;
      if (po.status !== PO_STATUS.CONCEPT) {
        throw new Error("Only Concept PO can be edited");
      }
      const lineRate = parseOptionalRate(vatRate);
      const item = ensureItem(data, Number(itemId));
      data.purchaseOrderLines.push({
        id: nextId(data.purchaseOrderLines),
        purchaseOrderId,
        itemId: Number(itemId),
        quantity: parseQty(quantity),
        unit,
        unitPrice: parseQty(unitPrice),
        vatRate: lineRate ?? po.vatRateDefault ?? null,
      });
      logPo(
        data,
        purchaseOrderId,
        req.session.userId ?? null,
        "line-added",
        `Added ${quantity} ${unit} ${item.name}`
      );
      updatePOStatus(data, purchaseOrderId);
    });
  } catch (err) {
    return res.status(400).render("error", { message: (err as Error).message });
  }
  res.redirect(`/pos/${purchaseOrderId}`);
});

app.post("/pos/:id/lines/:lineId/delete", requireAuth, async (req, res) => {
  const lineId = Number(req.params.lineId);
  let line = null;
  try {
    line = await updateData((data) => {
    const entry = data.purchaseOrderLines.find((l) => l.id === lineId);
      if (!entry) return null;
      const po = data.purchaseOrders.find((order) => order.id === entry.purchaseOrderId);
      if (!po) return null;
      if (po.status !== PO_STATUS.CONCEPT) {
        throw new Error("Only Concept PO can be edited");
      }
    data.purchaseOrderLines = data.purchaseOrderLines.filter((l) => l.id !== lineId);
    if (entry) updatePOStatus(data, entry.purchaseOrderId);
    if (entry) {
      const item = ensureItem(data, entry.itemId);
      logPo(
        data,
        entry.purchaseOrderId,
        req.session.userId ?? null,
        "line-removed",
        `Removed ${entry.quantity} ${entry.unit} ${item.name}`
      );
    }
    return entry;
    });
  } catch (err) {
    return res.status(400).render("error", { message: (err as Error).message });
  }
  if (!line) return res.redirect("/pos");
  res.redirect(`/pos/${line.purchaseOrderId}`);
});

app.post("/pos/:id/delete", requireAuth, async (req, res) => {
  const poId = Number(req.params.id);
  try {
    await updateData((data) => {
      const po = data.purchaseOrders.find((order) => order.id === poId);
      if (!po) return;
      if (po.status !== PO_STATUS.CONCEPT) {
        throw new Error("Only Concept PO can be deleted");
      }
    const receipts = data.goodsReceipts.filter((r) => r.purchaseOrderId === poId);
    for (const receipt of receipts) {
      data.stockMovements = data.stockMovements.filter(
        (m) => !(m.referenceType === "GOODS_RECEIPT" && m.referenceId === receipt.id)
      );
      data.goodsReceiptLines = data.goodsReceiptLines.filter(
        (l) => l.goodsReceiptId !== receipt.id
      );
    }
    data.goodsReceipts = data.goodsReceipts.filter((r) => r.purchaseOrderId !== poId);
    data.purchaseOrderLines = data.purchaseOrderLines.filter(
      (l) => l.purchaseOrderId !== poId
    );
    data.purchaseOrders = data.purchaseOrders.filter((po) => po.id !== poId);
    logPo(data, poId, req.session.userId ?? null, "deleted", "PO deleted");
    });
  } catch (err) {
    return res.status(400).render("error", { message: (err as Error).message });
  }
  res.redirect("/pos");
});

app.get("/receipts", requireAuth, async (_req, res) => {
  const receipts = await readData((data) =>
    data.goodsReceipts
      .map((receipt) => ({
        ...receipt,
        purchaseOrder: {
          ...ensurePurchaseOrder(data, receipt.purchaseOrderId),
          statusLabel: statusLabel(ensurePurchaseOrder(data, receipt.purchaseOrderId).status),
        },
        receivedAt: receipt.receivedAt ? new Date(receipt.receivedAt) : null,
        createdAt: receipt.createdAt ? new Date(receipt.createdAt) : null,
      }))
      .sort((a, b) => {
        const aTime = a.receivedAt?.getTime() || a.createdAt?.getTime() || 0;
        const bTime = b.receivedAt?.getTime() || b.createdAt?.getTime() || 0;
        return bTime - aTime;
      })
  );
  res.render("receipts/index", { receipts });
});

app.get("/receipts/new", requireAuth, async (_req, res) => {
  const result = await readData((data) => ({
    pos: data.purchaseOrders
      .map((po) => ({
        ...po,
        supplier: ensureSupplier(data, po.supplierId),
        statusLabel: statusLabel(po.status),
      }))
      .filter((po) => po.status !== PO_STATUS.CONCEPT),
    nextDeliveryNote: generateReceiptNumber(data),
  }));
  res.render("receipts/new", result);
});

app.post("/receipts", requireAuth, async (req, res) => {
  const { purchaseOrderId, deliveryNoteNo } = req.body;
  const receipt = await updateData((data) => {
    const po = data.purchaseOrders.find((entry) => entry.id === Number(purchaseOrderId));
    if (!po) throw new Error("PO not found");
    if (po.status === PO_STATUS.CONCEPT) {
      throw new Error("Cannot receive goods for a Concept PO");
    }
    const trimmedNote = String(deliveryNoteNo || "").trim();
    const entry = {
      id: nextId(data.goodsReceipts),
      purchaseOrderId: Number(purchaseOrderId),
      deliveryNoteNo: trimmedNote === "" ? generateReceiptNumber(data) : trimmedNote,
      createdAt: new Date().toISOString(),
      receivedAt: null,
      status: "DRAFT",
      parentReceiptId: null,
    };
    data.goodsReceipts.push(entry);
    logReceipt(
      data,
      entry.id,
      req.session.userId ?? null,
      "created",
      `Receipt ${entry.deliveryNoteNo} created`
    );
    return entry;
  });
  res.redirect(`/receipts/${receipt.id}`);
});

app.get("/receipts/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const receipt = await readData((data) => {
    const entry = data.goodsReceipts.find((r) => r.id === id);
    if (!entry) return null;
    const po = data.purchaseOrders.find((p) => p.id === entry.purchaseOrderId);
    if (!po) return null;
    const status = entry.status || (entry.receivedAt ? "RECEIVED" : "DRAFT");
    const poLines = data.purchaseOrderLines
      .filter((line) => line.purchaseOrderId === po.id)
      .map((line) => ({
        ...line,
        item: ensureItem(data, line.itemId),
      }));
    const lines = data.goodsReceiptLines
      .filter((line) => line.goodsReceiptId === id)
      .map((line) => ({ ...line, item: ensureItem(data, line.itemId) }));
    const usersById = new Map(data.users.map((user) => [user.id, user.username]));
    const logs = data.receiptLogs
      .filter((log) => log.receiptId === id)
      .map((log) => ({
        ...log,
        createdAt: new Date(log.createdAt),
        username: log.userId ? usersById.get(log.userId) || "Unknown" : "Unknown",
      }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const createdAt = entry.createdAt || entry.receivedAt || new Date().toISOString();
    const receivedAt = entry.receivedAt ? new Date(entry.receivedAt) : null;
    const backorders = data.goodsReceipts
      .filter((r) => r.parentReceiptId === id)
      .map((r) => ({ ...r }));

    return {
      receipt: {
        ...entry,
        status,
        createdAt: new Date(createdAt),
        receivedAt,
        purchaseOrder: {
          ...po,
          supplier: ensureSupplier(data, po.supplierId),
          lines: poLines,
        },
        lines,
      },
      logs,
      backorders,
    };
  });
  if (!receipt) return res.redirect("/receipts");
  res.render("receipts/show", receipt);
});

app.get("/receipts/:id/edit", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const receipt = await readData((data) => {
    const entry = data.goodsReceipts.find((r) => r.id === id);
    if (!entry) return null;
    const po = data.purchaseOrders.find((p) => p.id === entry.purchaseOrderId);
    if (!po) return null;
    return {
      receipt: {
        ...entry,
        purchaseOrder: po,
      },
    };
  });
  if (!receipt) return res.redirect("/receipts");
  res.render("receipts/edit", receipt);
});

app.post("/receipts/:id/update", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { deliveryNoteNo } = req.body;
  await updateData((data) => {
    const receipt = data.goodsReceipts.find((r) => r.id === id);
    if (!receipt) return;
    receipt.deliveryNoteNo = deliveryNoteNo;
  });
  res.redirect(`/receipts/${id}`);
});

app.post("/receipts/:id/confirm", requireAuth, async (req, res) => {
  const receiptId = Number(req.params.id);
  let receivedQty = (req.body.receivedQty || {}) as Record<string, string>;
  if (!receivedQty || Object.keys(receivedQty).length === 0) {
    receivedQty = {};
  }
  for (const [key, value] of Object.entries(req.body)) {
    let match = /^receivedQty_(\d+)$/.exec(key);
    if (!match) {
      match = /^receivedQty\[(\d+)\]$/.exec(key);
    }
    if (match) {
      receivedQty[match[1]] = String(value ?? "");
    }
  }
  try {
    await updateData((data) => {
      const receipt = data.goodsReceipts.find((r) => r.id === receiptId);
      if (!receipt) return;
      if (receipt.status === "RECEIVED" || receipt.receivedAt) {
        throw new Error("Receipt already confirmed");
      }
      const po = data.purchaseOrders.find((p) => p.id === receipt.purchaseOrderId);
      if (!po) throw new Error("PO not found");
      const poLines = data.purchaseOrderLines.filter((line) => line.purchaseOrderId === po.id);
      const now = new Date().toISOString();

      let createdCount = 0;
      let hasShortage = false;
      const shortages: { line: PurchaseOrderLine; missingQty: number }[] = [];
      for (const line of poLines) {
        const raw = receivedQty[String(line.id)];
        const qty = parseQty(raw);
        if (qty <= 0) {
          if (Number(line.quantity) > 0) {
            hasShortage = true;
            shortages.push({ line, missingQty: Number(line.quantity) });
          }
          continue;
        }
        if (qty + 1e-6 < Number(line.quantity)) {
          hasShortage = true;
          shortages.push({ line, missingQty: Number(line.quantity) - qty });
        }
        const batchNumber = `IN-${receipt.id}-${line.id}-${createdCount + 1}`;
        const unit = line.unit;
        const factor = getUnitFactor(data, line.itemId, unit);
        data.goodsReceiptLines.push({
          id: nextId(data.goodsReceiptLines),
          goodsReceiptId: receipt.id,
          itemId: line.itemId,
          poLineId: line.id,
          quantity: qty,
          unit,
          batchNumber,
          expiryDate: "0",
        });
        data.stockMovements.push({
          id: nextId(data.stockMovements),
          itemId: line.itemId,
          quantity: qty * factor,
          type: STOCK_MOVEMENT.IN,
          referenceType: "GOODS_RECEIPT",
          referenceId: receipt.id,
          createdAt: now,
        });
        createdCount += 1;
      }

      if (createdCount === 0) {
        throw new Error("Enter at least one received quantity");
      }

      let backorderReceipt = null;
      if (hasShortage) {
        const backorder = {
          id: nextId(data.goodsReceipts),
          purchaseOrderId: po.id,
          deliveryNoteNo: generateReceiptNumber(data),
          createdAt: now,
          receivedAt: null,
          status: "DRAFT",
          parentReceiptId: receipt.id,
        };
        data.goodsReceipts.push(backorder);
        logReceipt(
          data,
          backorder.id,
          req.session.userId ?? null,
          "backorder-from",
          `Backorder from ${receipt.deliveryNoteNo}`,
          receipt.id
        );
        backorderReceipt = backorder;
      }

      receipt.status = "RECEIVED";
      receipt.receivedAt = now;
      if (!receipt.createdAt) receipt.createdAt = now;
      updatePOStatus(data, po.id);
      logReceipt(
        data,
        receipt.id,
        req.session.userId ?? null,
        "confirmed",
        `Confirmed receipt with ${createdCount} lines`
      );
      if (backorderReceipt) {
        logReceipt(
          data,
          receipt.id,
          req.session.userId ?? null,
          "backorder-created",
          `Backorder created: ${backorderReceipt.deliveryNoteNo}`,
          backorderReceipt.id
        );
      }
    });
  } catch (err) {
    return res.status(400).render("error", { message: (err as Error).message });
  }
  res.redirect(`/receipts/${receiptId}`);
});

app.post("/receipts/:id/draft", requireAuth, async (req, res) => {
  const receiptId = Number(req.params.id);
  try {
    await updateData((data) => {
      const receipt = data.goodsReceipts.find((r) => r.id === receiptId);
      if (!receipt) return;
      if (receipt.status !== "RECEIVED" && !receipt.receivedAt) {
        return;
      }
      data.stockMovements = data.stockMovements.filter(
        (m) => !(m.referenceType === "GOODS_RECEIPT" && m.referenceId === receiptId)
      );
      data.goodsReceiptLines = data.goodsReceiptLines.filter(
        (l) => l.goodsReceiptId !== receiptId
      );
      receipt.status = "DRAFT";
      receipt.receivedAt = null;
      updatePOStatus(data, receipt.purchaseOrderId);
      logReceipt(
        data,
        receiptId,
        req.session.userId ?? null,
        "reverted",
        "Receipt reverted to draft"
      );
    });
  } catch (err) {
    return res.status(400).render("error", { message: (err as Error).message });
  }
  res.redirect(`/receipts/${receiptId}`);
});

app.post("/receipts/:id/lines", requireAuth, async (req, res) => {
  const goodsReceiptId = Number(req.params.id);
  const { poLineId, itemId, quantity, unit, batchNumber, expiryDate } = req.body;
  try {
    await updateData((data) => {
      const trimmedBatch = String(batchNumber || "").trim();
      if (trimmedBatch === "") {
        throw new Error("Batch number is required");
      }
      const receipt = data.goodsReceipts.find((r) => r.id === goodsReceiptId);
      if (receipt && (receipt.status === "RECEIVED" || receipt.receivedAt)) {
        throw new Error("Receipt already confirmed");
      }
      const parsedExpiry = parseExpiryDate(expiryDate);
      const factor = getUnitFactor(data, Number(itemId), unit);
      const lineId = nextId(data.goodsReceiptLines);
      data.goodsReceiptLines.push({
        id: lineId,
        goodsReceiptId,
        itemId: Number(itemId),
        poLineId: poLineId ? Number(poLineId) : null,
        quantity: parseQty(quantity),
        unit,
        batchNumber: trimmedBatch,
        expiryDate: parsedExpiry,
      });
      // Stock is posted on confirm.
    });
  } catch (err) {
    return res.status(400).render("error", { message: (err as Error).message });
  }

  res.redirect(`/receipts/${goodsReceiptId}`);
});

app.post("/receipts/:id/lines/:lineId/delete", requireAuth, async (req, res) => {
  const lineId = Number(req.params.lineId);
  await updateData((data) => {
    const line = data.goodsReceiptLines.find((l) => l.id === lineId);
    data.goodsReceiptLines = data.goodsReceiptLines.filter((l) => l.id !== lineId);
    if (!line) return;
    let factor = 1;
    try {
      factor = getUnitFactor(data, line.itemId, line.unit);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`Missing unit conversion when deleting receipt line ${line.id}`);
    }
    const baseQty = Number(line.quantity) * factor;
    data.stockMovements = data.stockMovements.filter(
      (m) =>
        !(
          m.referenceType === "GOODS_RECEIPT" &&
          m.referenceId === line.goodsReceiptId &&
          m.itemId === line.itemId &&
          m.quantity === baseQty &&
          m.type === STOCK_MOVEMENT.IN
        )
    );
    const receipt = data.goodsReceipts.find((r) => r.id === line.goodsReceiptId);
    if (receipt) updatePOStatus(data, receipt.purchaseOrderId);
  });
  res.redirect(`/receipts/${req.params.id}`);
});

app.post("/receipts/:id/delete", requireAuth, async (req, res) => {
  const receiptId = Number(req.params.id);
  await updateData((data) => {
    data.stockMovements = data.stockMovements.filter(
      (m) => !(m.referenceType === "GOODS_RECEIPT" && m.referenceId === receiptId)
    );
    data.goodsReceiptLines = data.goodsReceiptLines.filter(
      (l) => l.goodsReceiptId !== receiptId
    );
    data.goodsReceipts = data.goodsReceipts.filter((r) => r.id !== receiptId);
  });
  res.redirect("/receipts");
});

app.get("/boms", requireAuth, async (_req, res) => {
  const boms = await readData((data) =>
    data.boms
      .map((bom) => ({ ...bom, finishedItem: ensureItem(data, bom.finishedItemId) }))
      .sort((a, b) => a.name.localeCompare(b.name))
  );
  res.render("boms/index", { boms });
});

app.get("/boms/new", requireAuth, async (_req, res) => {
  const items = await readData((data) =>
    [...data.items].sort((a, b) => a.name.localeCompare(b.name))
  );
  res.render("boms/new", { items });
});

app.post("/boms", requireAuth, async (req, res) => {
  const { name, finishedItemId, outputQty, outputUnit } = req.body;
  const bom = await updateData((data) => {
    const entry = {
      id: nextId(data.boms),
      name,
      finishedItemId: Number(finishedItemId),
      outputQty: parseQty(outputQty),
      outputUnit,
    };
    data.boms.push(entry);
    return entry;
  });
  res.redirect(`/boms/${bom.id}`);
});

app.get("/boms/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const result = await readData((data) => {
    const bom = data.boms.find((entry) => entry.id === id);
    if (!bom) return null;
    const lines = data.bomLines
      .filter((line) => line.bomId === id)
      .map((line) => ({ ...line, item: ensureItem(data, line.itemId) }));
    return {
      bom: {
        ...bom,
        finishedItem: ensureItem(data, bom.finishedItemId),
        lines,
      },
      items: [...data.items].sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
  if (!result) return res.redirect("/boms");
  res.render("boms/show", result);
});

app.get("/boms/:id/edit", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const result = await readData((data) => {
    const bom = data.boms.find((entry) => entry.id === id);
    if (!bom) return null;
    return {
      bom,
      items: [...data.items].sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
  if (!result) return res.redirect("/boms");
  res.render("boms/edit", result);
});

app.post("/boms/:id/update", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { name, finishedItemId, outputQty, outputUnit } = req.body;
  await updateData((data) => {
    const bom = data.boms.find((entry) => entry.id === id);
    if (!bom) return;
    bom.name = name;
    bom.finishedItemId = Number(finishedItemId);
    bom.outputQty = parseQty(outputQty);
    bom.outputUnit = outputUnit;
  });
  res.redirect(`/boms/${id}`);
});

app.post("/boms/:id/lines", requireAuth, async (req, res) => {
  const bomId = Number(req.params.id);
  const { itemId, quantity, unit } = req.body;
  await updateData((data) => {
    data.bomLines.push({
      id: nextId(data.bomLines),
      bomId,
      itemId: Number(itemId),
      quantity: parseQty(quantity),
      unit,
    });
  });
  res.redirect(`/boms/${bomId}`);
});

app.post("/boms/:id/lines/:lineId/delete", requireAuth, async (req, res) => {
  const lineId = Number(req.params.lineId);
  const line = await updateData((data) => {
    const entry = data.bomLines.find((l) => l.id === lineId);
    data.bomLines = data.bomLines.filter((l) => l.id !== lineId);
    return entry;
  });
  if (!line) return res.redirect("/boms");
  res.redirect(`/boms/${line.bomId}`);
});

app.post("/boms/:id/delete", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  await updateData((data) => {
    data.bomLines = data.bomLines.filter((line) => line.bomId !== id);
    data.boms = data.boms.filter((bom) => bom.id !== id);
  });
  res.redirect("/boms");
});

app.get("/production", requireAuth, async (_req, res) => {
  const batches = await readData((data) =>
    data.productionBatches
      .map((batch) => ({
        ...batch,
        bom: ensureBOM(data, batch.bomId),
        item: ensureItem(data, batch.itemId),
        createdAt: new Date(batch.createdAt),
      }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  );
  res.render("production/index", { batches });
});

app.get("/production/new", requireAuth, async (_req, res) => {
  const boms = await readData((data) =>
    data.boms.map((bom) => ({
      ...bom,
      finishedItem: ensureItem(data, bom.finishedItemId),
    }))
  );
  res.render("production/new", { boms });
});

app.post("/production", requireAuth, async (req, res) => {
  const { bomId, batchNumber, producedQty, producedUnit } = req.body;
  try {
    await updateData((data) => {
      const bom = data.boms.find((entry) => entry.id === Number(bomId));
      if (!bom) return;
      const now = new Date();
      const expiredItems = new Set<string>();
      for (const line of data.bomLines.filter((entry) => entry.bomId === bom.id)) {
        const lines = data.goodsReceiptLines.filter((receipt) => receipt.itemId === line.itemId);
        if (lines.some((receipt) => isExpired(receipt.expiryDate || "0", now))) {
          expiredItems.add(ensureItem(data, line.itemId).name);
        }
      }
      if (expiredItems.size > 0) {
        throw new Error(
          `Expired stock present for: ${Array.from(expiredItems).join(", ")}`
        );
      }
      const producedFactor = getUnitFactor(data, bom.finishedItemId, producedUnit);
      const bomOutputFactor = getUnitFactor(data, bom.finishedItemId, bom.outputUnit);
      const producedBase = parseQty(producedQty) * producedFactor;
      const bomOutputBase = Number(bom.outputQty) * bomOutputFactor;
      const scale = bomOutputBase === 0 ? 0 : producedBase / bomOutputBase;

      const batch = {
        id: nextId(data.productionBatches),
        bomId: bom.id,
        batchNumber,
        producedQty: parseQty(producedQty),
        producedUnit,
        itemId: bom.finishedItemId,
        createdAt: new Date().toISOString(),
      };
      data.productionBatches.push(batch);

      const bomLines = data.bomLines.filter((line) => line.bomId === bom.id);
      for (const line of bomLines) {
        const factor = getUnitFactor(data, line.itemId, line.unit);
        const consumeBase = Number(line.quantity) * factor * scale;
        data.stockMovements.push({
          id: nextId(data.stockMovements),
          itemId: line.itemId,
          quantity: -consumeBase,
          type: STOCK_MOVEMENT.PRODUCTION,
          referenceType: "PRODUCTION_BATCH",
          referenceId: batch.id,
          createdAt: new Date().toISOString(),
        });
      }

      data.stockMovements.push({
        id: nextId(data.stockMovements),
        itemId: bom.finishedItemId,
        quantity: producedBase,
        type: STOCK_MOVEMENT.PRODUCTION,
        referenceType: "PRODUCTION_BATCH",
        referenceId: batch.id,
        createdAt: new Date().toISOString(),
      });
    });
  } catch (err) {
    return res.status(400).render("error", { message: (err as Error).message });
  }

  res.redirect("/production");
});

app.post("/production/:id/delete", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  await updateData((data) => {
    data.stockMovements = data.stockMovements.filter(
      (m) => !(m.referenceType === "PRODUCTION_BATCH" && m.referenceId === id)
    );
    data.productionBatches = data.productionBatches.filter((batch) => batch.id !== id);
  });
  res.redirect("/production");
});

app.get("/inventory", requireAuth, async (_req, res) => {
  const result = await readData((data) => {
    const byParent = new Map<number, number>();
    const stockMap = new Map<number, number>();
    for (const movement of data.stockMovements) {
      stockMap.set(movement.itemId, (stockMap.get(movement.itemId) || 0) + movement.quantity);
    }
    for (const item of data.items) {
      const parentId = item.parentItemId ?? item.id;
      const current = byParent.get(parentId) || 0;
      byParent.set(parentId, current + (stockMap.get(item.id) || 0));
    }
    const items = data.items
      .filter((item) => item.parentItemId == null)
      .map((item) => ({
        ...item,
        stock: byParent.get(item.id) || 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const movements = data.stockMovements
      .map((m) => ({
        ...m,
        item: ensureItem(data, m.itemId),
        createdAt: new Date(m.createdAt),
      }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 100);
    return { items, stockMap, movements };
  });
  res.render("inventory/index", result);
});

const port = Number(process.env.PORT || 3000);

ensureAdminUser()
  .then(() => {
    app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`Boecht Inventory running on http://localhost:${port}`);
    });
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
