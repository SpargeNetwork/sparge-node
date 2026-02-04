import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";

export type POStatus = "CONCEPT" | "OPEN" | "PARTIAL" | "RECEIVED";
export type StockMovementType = "IN" | "OUT" | "ADJUSTMENT" | "PRODUCTION";

export interface User {
  id: number;
  username: string;
  passwordHash: string;
  createdAt: string;
}

export interface Item {
  id: number;
  sku: string;
  name: string;
  category: string | null;
  manufacturer: string | null;
  supplierId: number | null;
  parentItemId: number | null;
  purchasePrice: number;
  baseUnit: string;
  allowedDecimals: number;
  minStock: number;
}

export interface UnitConversion {
  id: number;
  itemId: number;
  unitName: string;
  toBaseFactor: number;
}

export interface Supplier {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
}

export interface PurchaseOrder {
  id: number;
  poNumber: string;
  supplierId: number;
  status: POStatus;
  createdAt: string;
  createdByUserId?: number | null;
  orderDate: string;
  receivedDate: string | null;
  transportCost: number;
  vatRateDefault?: number | null;
}

export interface PurchaseOrderLine {
  id: number;
  purchaseOrderId: number;
  itemId: number;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number | null;
}

export interface GoodsReceipt {
  id: number;
  purchaseOrderId: number;
  deliveryNoteNo: string;
  createdAt?: string;
  receivedAt?: string | null;
  status?: "DRAFT" | "RECEIVED";
  parentReceiptId?: number | null;
}

export interface GoodsReceiptLine {
  id: number;
  goodsReceiptId: number;
  itemId: number;
  poLineId: number | null;
  quantity: number;
  unit: string;
  batchNumber: string;
  expiryDate: string;
}

export interface StockMovement {
  id: number;
  itemId: number;
  quantity: number;
  type: StockMovementType;
  referenceType: string | null;
  referenceId: number | null;
  createdAt: string;
}

export interface BOM {
  id: number;
  name: string;
  finishedItemId: number;
  outputQty: number;
  outputUnit: string;
}

export interface BOMLine {
  id: number;
  bomId: number;
  itemId: number;
  quantity: number;
  unit: string;
}

export interface ProductionBatch {
  id: number;
  bomId: number;
  batchNumber: string;
  producedQty: number;
  producedUnit: string;
  itemId: number;
  createdAt: string;
}

export interface ReceiptLogEntry {
  id: number;
  receiptId: number;
  userId: number | null;
  action: string;
  details: string;
  createdAt: string;
  relatedReceiptId?: number | null;
}

export interface POLogEntry {
  id: number;
  purchaseOrderId: number;
  userId: number | null;
  action: string;
  details: string;
  createdAt: string;
}

export interface DataStore {
  users: User[];
  items: Item[];
  unitConversions: UnitConversion[];
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  purchaseOrderLines: PurchaseOrderLine[];
  goodsReceipts: GoodsReceipt[];
  goodsReceiptLines: GoodsReceiptLine[];
  stockMovements: StockMovement[];
  boms: BOM[];
  bomLines: BOMLine[];
  productionBatches: ProductionBatch[];
  receiptLogs: ReceiptLogEntry[];
  poLogs: POLogEntry[];
}

const dataDir = path.join(process.cwd(), "data");
const dataFile = path.join(dataDir, "db.json");

let cachedData: DataStore | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function defaultData(): DataStore {
  return {
    users: [],
    items: [],
    unitConversions: [],
    suppliers: [],
    purchaseOrders: [],
    purchaseOrderLines: [],
    goodsReceipts: [],
    goodsReceiptLines: [],
    stockMovements: [],
    boms: [],
    bomLines: [],
    productionBatches: [],
    receiptLogs: [],
    poLogs: [],
  };
}

async function loadDataFile(): Promise<DataStore> {
  if (!existsSync(dataDir)) {
    await fs.mkdir(dataDir, { recursive: true });
  }
  if (!existsSync(dataFile)) {
    const seed = defaultData();
    await fs.writeFile(dataFile, JSON.stringify(seed, null, 2), "utf-8");
    return seed;
  }
  const raw = await fs.readFile(dataFile, "utf-8");
  const cleaned = raw.replace(/^\uFEFF/, "").trim();
  if (cleaned === "") {
    const seed = defaultData();
    await saveDataFile(seed);
    return seed;
  }
  const parsed = JSON.parse(cleaned) as DataStore;
  return { ...defaultData(), ...parsed };
}

async function saveDataFile(data: DataStore): Promise<void> {
  await fs.writeFile(dataFile, JSON.stringify(data, null, 2), "utf-8");
}

export async function getData(): Promise<DataStore> {
  if (!cachedData) {
    cachedData = await loadDataFile();
  }
  return cachedData;
}

export async function readData<T>(fn: (data: DataStore) => T | Promise<T>): Promise<T> {
  const data = await getData();
  return fn(data);
}

export async function updateData<T>(fn: (data: DataStore) => T | Promise<T>): Promise<T> {
  const data = await getData();
  const result = await fn(data);
  writeQueue = writeQueue.then(() => saveDataFile(data));
  await writeQueue;
  return result;
}

export function nextId(list: { id: number }[]): number {
  if (list.length === 0) return 1;
  return Math.max(...list.map((item) => item.id)) + 1;
}
