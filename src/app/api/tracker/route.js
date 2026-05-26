import { NextResponse } from "next/server";
import { appendRow, clearRow, initHeaders, readRows, updateRow } from "@/lib/sheets";

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function isAuthorized(request) {
  const expected = process.env.DASHBOARD_ADMIN_TOKEN;
  const received = request.headers.get("x-dashboard-token");
  return Boolean(expected && received && received === expected);
}

function parseSheetRowNumber(value) {
  const rowNumber = Number(value);
  if (!Number.isInteger(rowNumber) || rowNumber < 2) {
    throw new Error("A valid sheetRowNumber of 2 or greater is required.");
  }
  return rowNumber;
}

export async function GET() {
  try {
    const rows = await readRows();
    return json({ rows });
  } catch (error) {
    return json({ error: error.message || "Unable to read tracker data." }, 500);
  }
}

export async function POST(request) {
  if (!isAuthorized(request)) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await request.json();
    const { action } = body;

    if (action === "init_headers") {
      await initHeaders();
      return json({ ok: true });
    }

    if (action === "append_row") {
      await appendRow(body.row);
      return json({ ok: true });
    }

    if (action === "update_row") {
      await updateRow(parseSheetRowNumber(body.sheetRowNumber), body.row);
      return json({ ok: true });
    }

    if (action === "clear_row") {
      await clearRow(parseSheetRowNumber(body.sheetRowNumber));
      return json({ ok: true });
    }

    return json({ error: "Unsupported action." }, 400);
  } catch (error) {
    return json({ error: error.message || "Unable to update tracker data." }, 500);
  }
}
