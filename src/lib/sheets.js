import { google } from "googleapis";

const REQUIRED_ENV = [
  "GOOGLE_SHEET_ID",
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_PRIVATE_KEY",
];

export const HEADERS = [
  "Worker",
  "Batch No.",
  "File No.",
  "Image Numbers Assigned",
  "WIP",
  "Completed Images",
  "Verified Images",
];

export const FIELD_KEYS = [
  "worker",
  "batchNo",
  "fileNo",
  "assigned",
  "wip",
  "completed",
  "verified",
];

export function getSheetTab() {
  return process.env.GOOGLE_SHEET_TAB || "Data";
}

function assertEnv() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }
}

function assertSheetId() {
  if (!process.env.GOOGLE_SHEET_ID) {
    throw new Error("Missing environment variable: GOOGLE_SHEET_ID");
  }
}

function hasServiceAccountCredentials() {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);
}

function getSheetsClient() {
  assertEnv();

  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

export function rowArrayToObject(values, sheetRowNumber) {
  const padded = [...values, "", "", "", "", "", "", ""].slice(0, 7);

  return FIELD_KEYS.reduce(
    (row, key, index) => ({
      ...row,
      [key]: String(padded[index] ?? ""),
    }),
    { sheetRowNumber }
  );
}

export function rowObjectToArray(row) {
  return FIELD_KEYS.map((key) => String(row?.[key] ?? ""));
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells;
}

function parseCsv(csv) {
  const rows = [];
  let currentLine = "";
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const nextChar = csv[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      currentLine += char + nextChar;
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
      currentLine += char;
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") index += 1;
      rows.push(parseCsvLine(currentLine));
      currentLine = "";
    } else {
      currentLine += char;
    }
  }

  if (currentLine.length > 0) {
    rows.push(parseCsvLine(currentLine));
  }

  return rows;
}

async function readPublicRows() {
  assertSheetId();
  const tab = encodeURIComponent(getSheetTab());
  const sheetId = encodeURIComponent(process.env.GOOGLE_SHEET_ID);
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${tab}&range=A:G`;
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(
      "Unable to read public sheet. Confirm the sheet is shared as Anyone with the link: Viewer."
    );
  }

  const csv = await response.text();
  return parseCsv(csv)
    .slice(1)
    .map((row, index) => rowArrayToObject(row, index + 2));
}

async function readPrivateRows() {
  const sheets = getSheetsClient();
  const tab = getSheetTab();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${tab}!A:G`,
  });

  const values = response.data.values || [];
  return values.slice(1).map((row, index) => rowArrayToObject(row, index + 2));
}

export async function readRows() {
  return hasServiceAccountCredentials() ? readPrivateRows() : readPublicRows();
}

export async function initHeaders() {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${getSheetTab()}!A1:G1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [HEADERS],
    },
  });
}

export async function appendRow(row) {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${getSheetTab()}!A:G`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [rowObjectToArray(row)],
    },
  });

  return response.data;
}

export async function updateRow(sheetRowNumber, row) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${getSheetTab()}!A${sheetRowNumber}:G${sheetRowNumber}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [rowObjectToArray(row)],
    },
  });
}

export async function clearRow(sheetRowNumber) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.clear({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${getSheetTab()}!A${sheetRowNumber}:G${sheetRowNumber}`,
  });
}
