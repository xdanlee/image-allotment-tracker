"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Filter,
  Layers3,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Shield,
  Table2,
  Trash2,
  Users,
  Wrench,
} from "lucide-react";

const BRAND = {
  studio: "SABAKI STUDIOS",
  product: "Image Allotment Tracker",
};

const QUEUES = [
  { key: "assigned", label: "Assigned", title: "Image Numbers Assigned" },
  { key: "wip", label: "WIP", title: "WIP" },
  { key: "completed", label: "Completed", title: "Completed Images" },
  { key: "verified", label: "Verified", title: "Verified Images" },
];

const QUEUE_PRIORITY = Object.fromEntries(QUEUES.map((queue, index) => [queue.key, index]));

const QUEUE_STYLES = {
  assigned: {
    bar: "bg-slate-400",
    soft: "bg-slate-100 text-slate-700 ring-slate-200",
    dot: "bg-slate-400",
  },
  wip: {
    bar: "bg-sky-500",
    soft: "bg-sky-100 text-sky-800 ring-sky-200",
    dot: "bg-sky-500",
  },
  completed: {
    bar: "bg-amber-500",
    soft: "bg-amber-100 text-amber-800 ring-amber-200",
    dot: "bg-amber-500",
  },
  verified: {
    bar: "bg-emerald-500",
    soft: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    dot: "bg-emerald-500",
  },
};

const COLUMNS = [
  { key: "worker", label: "Worker" },
  { key: "batchNo", label: "Batch No." },
  { key: "fileNo", label: "File No." },
  ...QUEUES.map((queue) => ({ key: queue.key, label: queue.title })),
];

const EMPTY_ROW = {
  worker: "",
  batchNo: "",
  fileNo: "",
  assigned: "",
  wip: "",
  completed: "",
  verified: "",
};

const EXPECTED_IMAGES_PER_FILE = 100;
const EXPECTED_FILES_PER_BATCH = 5;

function parseImages(value) {
  const matches = String(value || "").match(/\d+/g);
  return matches ? matches.map(Number) : [];
}

function formatImages(values) {
  return [...new Set(values.map(Number).filter(Number.isFinite))]
    .sort((a, b) => a - b)
    .join(", ");
}

function queueLabel(queueKey) {
  return QUEUES.find((queue) => queue.key === queueKey)?.label || "Unassigned";
}

function queueStyle(queueKey) {
  return QUEUE_STYLES[queueKey] || QUEUE_STYLES.assigned;
}

function verifiedPercent(item) {
  return item.total ? Math.round((item.verified / item.total) * 100) : 0;
}

function rowIdFor(row) {
  return String(row.sheetRowNumber || row.clientId);
}

function imageKey(record) {
  return `${record.batchNo}::${record.fileNo}::${record.imageNumber}`;
}

function furthestQueue(queueKeys) {
  return [...queueKeys].sort((a, b) => QUEUE_PRIORITY[b] - QUEUE_PRIORITY[a])[0] || "assigned";
}

function enrichRows(rows) {
  let currentWorker = "";

  return rows.map((row) => {
    const explicitWorker = String(row.worker || "").trim();
    if (explicitWorker) currentWorker = explicitWorker;

    return {
      ...row,
      effectiveWorker: explicitWorker || currentWorker || "",
      workerInherited: !explicitWorker && Boolean(currentWorker),
    };
  });
}

function buildImageRecords(rows) {
  return rows.flatMap((row) => {
    const imageQueues = new Map();

    QUEUES.forEach((queue) => {
      parseImages(row[queue.key]).forEach((imageNumber) => {
        const queues = imageQueues.get(imageNumber) || new Set();
        queues.add(queue.key);
        imageQueues.set(imageNumber, queues);
      });
    });

    return [...imageQueues.entries()].map(([imageNumber, queues]) => ({
      id: `${row.sheetRowNumber || "new"}-${imageNumber}`,
      worker: row.effectiveWorker || row.worker,
      explicitWorker: row.worker,
      workerInherited: row.workerInherited,
      batchNo: row.batchNo,
      fileNo: row.fileNo,
      imageNumber,
      status: furthestQueue(queues),
      rawQueues: [...queues],
      hasQueueConflict: queues.size > 1,
      sheetRowNumber: row.sheetRowNumber,
    }));
  });
}

function collapseRecordsByImage(records) {
  const byImage = new Map();

  records.forEach((record) => {
    const key = `${record.batchNo}::${record.fileNo}::${record.imageNumber}`;
    const existing = byImage.get(key);
    if (!existing || QUEUE_PRIORITY[record.status] > QUEUE_PRIORITY[existing.status]) {
      byImage.set(key, record);
    }
  });

  return [...byImage.values()];
}

function groupRecordsByImage(records) {
  const groups = new Map();

  records.forEach((record) => {
    const key = imageKey(record);
    const current =
      groups.get(key) ||
      {
        key,
        batchNo: record.batchNo,
        fileNo: record.fileNo,
        imageNumber: record.imageNumber,
        records: [],
      };
    current.records.push(record);
    groups.set(key, current);
  });

  return [...groups.values()];
}

function getCrossRowIssues(records) {
  return groupRecordsByImage(records)
    .map((group) => {
      const rows = new Set(group.records.map((record) => record.sheetRowNumber));
      const workers = new Set(group.records.map((record) => record.worker || "Unassigned"));
      return { ...group, rows: [...rows], workers: [...workers] };
    })
    .filter((group) => group.rows.length > 1 || group.workers.length > 1)
    .sort((a, b) => a.batchNo.localeCompare(b.batchNo) || a.fileNo.localeCompare(b.fileNo) || a.imageNumber - b.imageNumber);
}

function getSameRowQueueIssues(records) {
  return records
    .filter((record) => record.hasQueueConflict)
    .sort(
      (a, b) =>
        a.batchNo.localeCompare(b.batchNo) ||
        a.fileNo.localeCompare(b.fileNo) ||
        a.sheetRowNumber - b.sheetRowNumber ||
        a.imageNumber - b.imageNumber
    );
}

function chooseCanonicalRecord(records) {
  return [...records].sort(
    (a, b) =>
      QUEUE_PRIORITY[b.status] - QUEUE_PRIORITY[a.status] ||
      Number(a.sheetRowNumber || 999999) - Number(b.sheetRowNumber || 999999)
  )[0];
}

function removeImageFromRow(row, imageNumber) {
  const nextRow = { ...row };
  QUEUES.forEach((queue) => {
    nextRow[queue.key] = formatImages(parseImages(nextRow[queue.key]).filter((value) => value !== imageNumber));
  });
  return nextRow;
}

function setImageInRowQueue(row, imageNumber, queueKey) {
  const nextRow = removeImageFromRow(row, imageNumber);
  nextRow[queueKey] = formatImages([...parseImages(nextRow[queueKey]), imageNumber]);
  return nextRow;
}

function resolveCrossRowDuplicates(rows) {
  const enrichedRows = enrichRows(rows);
  const records = buildImageRecords(enrichedRows);
  const duplicateGroups = getCrossRowIssues(records);
  const rowsById = new Map(rows.map((row) => [rowIdFor(row), { ...row }]));
  const changedIds = new Set();

  duplicateGroups.forEach((group) => {
    const winner = chooseCanonicalRecord(group.records);

    group.records.forEach((record) => {
      const id = String(record.sheetRowNumber);
      const currentRow = rowsById.get(id);
      if (!currentRow) return;

      if (record.sheetRowNumber === winner.sheetRowNumber) {
        rowsById.set(id, setImageInRowQueue(currentRow, record.imageNumber, winner.status));
      } else {
        rowsById.set(id, removeImageFromRow(currentRow, record.imageNumber));
      }
      changedIds.add(id);
    });
  });

  return {
    rows: rows.map((row) => rowsById.get(rowIdFor(row)) || row),
    changedIds,
  };
}

function buildHierarchy(records) {
  const batches = new Map();

  records.forEach((record) => {
    const batchKey = record.batchNo || "Unassigned";
    const fileKey = record.fileNo || "Unassigned";
    const batch =
      batches.get(batchKey) ||
      {
        batchNo: batchKey,
        files: new Map(),
        assigned: 0,
        wip: 0,
        completed: 0,
        verified: 0,
        total: 0,
      };
    const file =
      batch.files.get(fileKey) ||
      {
        batchNo: batchKey,
        fileNo: fileKey,
        workers: new Map(),
        assigned: 0,
        wip: 0,
        completed: 0,
        verified: 0,
        total: 0,
      };
    const worker =
      file.workers.get(record.worker || "Unassigned") ||
      {
        worker: record.worker || "Unassigned",
        assigned: 0,
        wip: 0,
        completed: 0,
        verified: 0,
        total: 0,
      };

    [batch, file, worker].forEach((item) => {
      item[record.status] += 1;
      item.total += 1;
    });

    file.workers.set(worker.worker, worker);
    batch.files.set(fileKey, file);
    batches.set(batchKey, batch);
  });

  return [...batches.values()]
    .map((batch) => ({
      ...batch,
      files: [...batch.files.values()].map((file) => ({
        ...file,
        workers: [...file.workers.values()].sort((a, b) => a.worker.localeCompare(b.worker)),
      })),
    }))
    .sort((a, b) => a.batchNo.localeCompare(b.batchNo));
}

function buildPerspectiveStats(records, perspective) {
  const groups = new Map();

  records.forEach((record) => {
    const key =
      perspective === "batch"
        ? record.batchNo || "Unassigned"
        : perspective === "file"
          ? `Batch ${record.batchNo || "-"} / File ${record.fileNo || "-"}`
          : record.worker || "Unassigned";
    const current =
      groups.get(key) ||
      {
        label: key,
        assigned: 0,
        wip: 0,
        completed: 0,
        verified: 0,
        total: 0,
      };
    current[record.status] += 1;
    current.total += 1;
    groups.set(key, current);
  });

  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function buildCoverage(records, rows) {
  const files = new Map();
  const batches = new Map();

  rows.forEach((row) => {
    if (!row.batchNo || !row.fileNo) return;
    const batchNo = row.batchNo;
    const fileNo = row.fileNo;
    const key = `${batchNo}::${fileNo}`;
    if (!files.has(key)) {
      files.set(key, {
        key,
        batchNo,
        fileNo,
        images: new Set(),
      });
    }
    const fileSet = batches.get(batchNo) || new Set();
    fileSet.add(fileNo);
    batches.set(batchNo, fileSet);
  });

  records.forEach((record) => {
    const key = `${record.batchNo}::${record.fileNo}`;
    const file =
      files.get(key) ||
      {
        key,
        batchNo: record.batchNo,
        fileNo: record.fileNo,
        images: new Set(),
      };
    file.images.add(record.imageNumber);
    files.set(key, file);
  });

  const fileCoverage = [...files.values()]
    .map((file) => {
      const present = [...file.images].filter((imageNumber) => imageNumber >= 1 && imageNumber <= EXPECTED_IMAGES_PER_FILE);
      const missing = [];
      for (let imageNumber = 1; imageNumber <= EXPECTED_IMAGES_PER_FILE; imageNumber += 1) {
        if (!file.images.has(imageNumber)) missing.push(imageNumber);
      }
      const outOfRange = [...file.images].filter(
        (imageNumber) => imageNumber < 1 || imageNumber > EXPECTED_IMAGES_PER_FILE
      );

      return {
        ...file,
        present: present.length,
        missing,
        outOfRange,
        coveragePercent: Math.round((present.length / EXPECTED_IMAGES_PER_FILE) * 100),
      };
    })
    .sort((a, b) => a.batchNo.localeCompare(b.batchNo) || Number(a.fileNo) - Number(b.fileNo));

  const batchCoverage = [...batches.entries()]
    .map(([batchNo, fileSet]) => {
      const numericFiles = [...fileSet].map(Number).filter(Number.isFinite);
      const missingFiles = [];
      for (let fileNo = 1; fileNo <= EXPECTED_FILES_PER_BATCH; fileNo += 1) {
        if (!numericFiles.includes(fileNo)) missingFiles.push(fileNo);
      }
      return {
        batchNo,
        filesPresent: fileSet.size,
        missingFiles,
      };
    })
    .sort((a, b) => a.batchNo.localeCompare(b.batchNo));

  return { fileCoverage, batchCoverage };
}

function BrandMark() {
  return (
    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-slate-950 bg-white shadow-sm">
      <div className="absolute left-0 top-0 h-full w-1/2 bg-slate-950" />
      <div className="absolute left-1/2 top-0 h-1/2 w-1/2 -translate-x-1/2 rounded-full bg-slate-950" />
      <div className="absolute left-1/2 bottom-0 h-1/2 w-1/2 -translate-x-1/2 rounded-full bg-white" />
      <div className="absolute left-1/2 top-[22%] h-2 w-2 -translate-x-1/2 rounded-full bg-white" />
      <div className="absolute left-1/2 bottom-[22%] h-2 w-2 -translate-x-1/2 rounded-full bg-slate-950" />
    </div>
  );
}

function QueuePill({ queueKey }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${queueStyle(queueKey).soft}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${queueStyle(queueKey).dot}`} />
      {queueLabel(queueKey)}
    </span>
  );
}

function StageBar({ item, compact = false }) {
  const total = Math.max(item.total || 0, 1);

  return (
    <div className={compact ? "w-40" : "w-full"}>
      <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
        {QUEUES.map((queue) => {
          const width = ((item[queue.key] || 0) / total) * 100;
          return <div key={queue.key} className={queueStyle(queue.key).bar} style={{ width: `${width}%` }} />;
        })}
      </div>
    </div>
  );
}

function SectionHeader({ eyebrow, title, action }) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 md:flex-row md:items-center md:justify-between">
      <div>
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{eyebrow}</p>}
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function getQaStats(rows) {
  let duplicateWithinQueue = 0;
  let multipleQueues = 0;
  const crossRowSeen = new Map();

  rows.forEach((row) => {
    const rowQueueHits = new Map();

    QUEUES.forEach((queue) => {
      const images = parseImages(row[queue.key]);
      const countByImage = new Map();

      images.forEach((imageNumber) => {
        countByImage.set(imageNumber, (countByImage.get(imageNumber) || 0) + 1);
        const queues = rowQueueHits.get(imageNumber) || new Set();
        queues.add(queue.key);
        rowQueueHits.set(imageNumber, queues);

        const crossKey = `${row.batchNo}::${row.fileNo}::${imageNumber}`;
        const rowSet = crossRowSeen.get(crossKey) || new Set();
        rowSet.add(row.sheetRowNumber);
        crossRowSeen.set(crossKey, rowSet);
      });

      duplicateWithinQueue += [...countByImage.values()].filter((count) => count > 1).length;
    });

    multipleQueues += [...rowQueueHits.values()].filter((queues) => queues.size > 1).length;
  });

  return {
    duplicateWithinQueue,
    multipleQueues,
    crossRowDuplicates: [...crossRowSeen.values()].filter((rowsWithImage) => rowsWithImage.size > 1).length,
    inheritedWorkerRows: rows.filter((row) => row.workerInherited).length,
    blankRows: rows.filter((row) => !COLUMNS.some((column) => row[column.key])).length,
  };
}

function buildFileProgress(records) {
  const files = new Map();

  records.forEach((record) => {
    const key = `${record.worker || "Unassigned"}::${record.batchNo}::${record.fileNo}`;
    const current =
      files.get(key) ||
      {
        worker: record.worker || "Unassigned",
        batchNo: record.batchNo,
        fileNo: record.fileNo,
        assigned: 0,
        wip: 0,
        completed: 0,
        verified: 0,
        total: 0,
      };

    current[record.status] += 1;
    current.total += 1;
    files.set(key, current);
  });

  return [...files.values()].sort(
    (a, b) => a.worker.localeCompare(b.worker) || a.batchNo.localeCompare(b.batchNo) || a.fileNo.localeCompare(b.fileNo)
  );
}

function getQaFlags(rows) {
  const flags = [];
  const crossRowSeen = new Map();

  rows.forEach((row, rowIndex) => {
    const label = `Row ${row.sheetRowNumber || rowIndex + 1}`;
    const rowQueueHits = new Map();

    QUEUES.forEach((queue) => {
      const images = parseImages(row[queue.key]);
      const countByImage = new Map();

      images.forEach((imageNumber) => {
        countByImage.set(imageNumber, (countByImage.get(imageNumber) || 0) + 1);
        const queues = rowQueueHits.get(imageNumber) || new Set();
        queues.add(queue.key);
        rowQueueHits.set(imageNumber, queues);

        const crossKey = `${row.batchNo}::${row.fileNo}::${imageNumber}`;
        const existing = crossRowSeen.get(crossKey) || [];
        existing.push({ row: label, queue: queue.label });
        crossRowSeen.set(crossKey, existing);
      });

      countByImage.forEach((count, imageNumber) => {
        if (count > 1) {
          flags.push({
            type: "Duplicate in queue",
            message: `${label}: image ${imageNumber} appears ${count} times in ${queue.label}.`,
          });
        }
      });
    });

    rowQueueHits.forEach((queues, imageNumber) => {
      if (queues.size > 1) {
        flags.push({
          type: "Multiple queues",
          message: `${label}: image ${imageNumber} appears in ${[...queues].map(queueLabel).join(", ")}.`,
        });
      }
    });
  });

  crossRowSeen.forEach((entries, key) => {
    const uniqueRows = new Set(entries.map((entry) => entry.row));
    if (uniqueRows.size > 1) {
      const [batchNo, fileNo, imageNumber] = key.split("::");
      flags.push({
        type: "Cross-row duplicate",
        message: `Batch ${batchNo || "blank"} / File ${fileNo || "blank"} / Image ${imageNumber} appears in ${[
          ...uniqueRows,
        ].join(", ")}.`,
      });
    }
  });

  return flags;
}

function moveImagesInRow(row, targetQueue, input) {
  const imagesToMove = new Set(parseImages(input));
  if (imagesToMove.size === 0) return row;

  const nextRow = { ...row };
  QUEUES.forEach((queue) => {
    const remaining = parseImages(nextRow[queue.key]).filter((imageNumber) => !imagesToMove.has(imageNumber));
    nextRow[queue.key] = formatImages(remaining);
  });

  const targetImages = [...parseImages(nextRow[targetQueue]), ...imagesToMove];
  nextRow[targetQueue] = formatImages(targetImages);
  return normalizeRow(nextRow);
}

function normalizeRow(row) {
  const normalized = { ...EMPTY_ROW, ...row };
  const imageQueue = new Map();

  QUEUES.forEach((queue) => {
    parseImages(normalized[queue.key]).forEach((imageNumber) => {
      imageQueue.set(imageNumber, queue.key);
    });
  });

  QUEUES.forEach((queue) => {
    const images = [...imageQueue.entries()]
      .filter(([, queueKey]) => queueKey === queue.key)
      .map(([imageNumber]) => imageNumber);
    normalized[queue.key] = formatImages(images);
  });

  return normalized;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState("overview");
  const [rows, setRows] = useState([]);
  const [adminToken, setAdminToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingCleanupIds, setPendingCleanupIds] = useState(new Set());
  const [statsPerspective, setStatsPerspective] = useState("batch");
  const [filters, setFilters] = useState({
    worker: "",
    batchNo: "",
    fileNo: "",
    imageNumber: "",
    status: "",
    search: "",
  });
  const [moveTool, setMoveTool] = useState({
    rowId: "",
    targetQueue: "wip",
    imageNumbers: "",
  });

  async function fetchRows() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/tracker", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load rows.");
      setRows(data.rows || []);
      setNotice("Tracker data refreshed.");
    } catch (fetchError) {
      setError(fetchError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRows();
  }, []);

  const enrichedRows = useMemo(() => enrichRows(rows), [rows]);
  const imageRecords = useMemo(() => buildImageRecords(enrichedRows), [enrichedRows]);
  const uniqueImageRecords = useMemo(() => collapseRecordsByImage(imageRecords), [imageRecords]);
  const qaFlags = useMemo(() => getQaFlags(enrichedRows), [enrichedRows]);
  const qaStats = useMemo(() => getQaStats(enrichedRows), [enrichedRows]);
  const fileProgress = useMemo(() => buildFileProgress(imageRecords), [imageRecords]);
  const hierarchy = useMemo(() => buildHierarchy(uniqueImageRecords), [uniqueImageRecords]);
  const coverage = useMemo(() => buildCoverage(uniqueImageRecords, enrichedRows), [enrichedRows, uniqueImageRecords]);
  const perspectiveStats = useMemo(
    () => buildPerspectiveStats(uniqueImageRecords, statsPerspective),
    [statsPerspective, uniqueImageRecords]
  );
  const crossRowIssues = useMemo(() => getCrossRowIssues(imageRecords), [imageRecords]);
  const sameRowQueueIssues = useMemo(() => getSameRowQueueIssues(imageRecords), [imageRecords]);

  const kpis = useMemo(() => {
    const workers = new Set(enrichedRows.map((row) => row.effectiveWorker).filter(Boolean));
    const queueCounts = Object.fromEntries(
      QUEUES.map((queue) => [
        queue.key,
        uniqueImageRecords.filter((record) => record.status === queue.key).length,
      ])
    );
    return {
      total: uniqueImageRecords.length,
      workers: workers.size,
      ...queueCounts,
    };
  }, [enrichedRows, uniqueImageRecords]);

  const workerProgress = useMemo(() => {
    const progress = new Map();
    imageRecords.forEach((record) => {
      const worker = record.worker || "Unassigned";
      const current = progress.get(worker) || {
        worker,
        assigned: 0,
        wip: 0,
        completed: 0,
        verified: 0,
        total: 0,
      };
      current[record.status] += 1;
      current.total += 1;
      progress.set(worker, current);
    });
    return [...progress.values()].sort((a, b) => a.worker.localeCompare(b.worker));
  }, [imageRecords]);

  const filteredRecords = useMemo(() => {
    const imageFilter = Number(filters.imageNumber);
    return imageRecords.filter((record) => {
      const rowText =
        `${record.worker} ${record.batchNo} ${record.fileNo} ${record.imageNumber} ${queueLabel(record.status)} ${record.rawQueues
          .map(queueLabel)
          .join(" ")}`.toLowerCase();
      return (
        (!filters.worker || String(record.worker || "").toLowerCase().includes(filters.worker.toLowerCase())) &&
        (!filters.batchNo || record.batchNo.toLowerCase().includes(filters.batchNo.toLowerCase())) &&
        (!filters.fileNo || record.fileNo.toLowerCase().includes(filters.fileNo.toLowerCase())) &&
        (!filters.status || record.status === filters.status) &&
        (!filters.imageNumber || record.imageNumber === imageFilter) &&
        (!filters.search || rowText.includes(filters.search.toLowerCase()))
      );
    });
  }, [filters, imageRecords]);

  function updateLocalRow(rowId, key, value) {
    setRows((currentRows) =>
      currentRows.map((row) => (String(row.sheetRowNumber || row.clientId) === String(rowId) ? { ...row, [key]: value } : row))
    );
  }

  async function postAction(payload, saveKey) {
    setSavingKey(saveKey);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/tracker", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-dashboard-token": adminToken,
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Update failed.");
      setNotice("Saved.");
      await fetchRows();
    } catch (postError) {
      setError(postError.message);
    } finally {
      setSavingKey("");
    }
  }

  function addLocalRow() {
    const clientId = `new-${Date.now()}`;
    setRows((currentRows) => [...currentRows, { ...EMPTY_ROW, clientId }]);
    setActiveTab("editor");
  }

  function applyMove() {
    setRows((currentRows) =>
      currentRows.map((row) => {
        const rowId = String(row.sheetRowNumber || row.clientId);
        return rowId === String(moveTool.rowId)
          ? moveImagesInRow(row, moveTool.targetQueue, moveTool.imageNumbers)
          : row;
      })
    );
    setNotice("Move applied locally. Save the row to commit it.");
  }

  function normalizeLocalRow(rowId) {
    setRows((currentRows) =>
      currentRows.map((row) => (String(row.sheetRowNumber || row.clientId) === String(rowId) ? normalizeRow(row) : row))
    );
    setPendingCleanupIds((currentIds) => new Set([...currentIds, String(rowId)]));
    setNotice("Row normalized locally. Save it to commit the cleanup.");
  }

  function normalizeAllRows() {
    setRows((currentRows) => {
      setPendingCleanupIds(new Set(currentRows.map(rowIdFor)));
      return currentRows.map(normalizeRow);
    });
    setNotice("All rows normalized locally. Save changed rows to commit cleanup.");
  }

  function resolveCrossWorkerDuplicates() {
    setRows((currentRows) => {
      const result = resolveCrossRowDuplicates(currentRows);
      setPendingCleanupIds((currentIds) => new Set([...currentIds, ...result.changedIds]));
      return result.rows;
    });
    setNotice("Cross-row duplicates resolved locally. Commit cleanup to write changes to the sheet.");
  }

  async function commitCleanupRows() {
    if (pendingCleanupIds.size === 0) {
      setNotice("No cleanup changes to commit.");
      return;
    }

    setSavingKey("cleanup");
    setError("");
    setNotice("");

    try {
      const rowsToSave = rows.filter((row) => pendingCleanupIds.has(rowIdFor(row)) && row.sheetRowNumber);
      for (const row of rowsToSave) {
        const response = await fetch("/api/tracker", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-dashboard-token": adminToken,
          },
          body: JSON.stringify({
            action: "update_row",
            sheetRowNumber: row.sheetRowNumber,
            row: normalizeRow(row),
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `Failed to save row ${row.sheetRowNumber}.`);
      }
      setPendingCleanupIds(new Set());
      setNotice(`Committed cleanup for ${rowsToSave.length} rows.`);
      await fetchRows();
    } catch (commitError) {
      setError(commitError.message);
    } finally {
      setSavingKey("");
    }
  }

  async function saveRow(row) {
    const cleanRow = normalizeRow(row);
    if (row.sheetRowNumber) {
      await postAction(
        { action: "update_row", sheetRowNumber: row.sheetRowNumber, row: cleanRow },
        `save-${row.sheetRowNumber}`
      );
      return;
    }
    await postAction({ action: "append_row", row: cleanRow }, `save-${row.clientId}`);
  }

  async function clearSheetRow(row) {
    if (!row.sheetRowNumber) {
      setRows((currentRows) => currentRows.filter((currentRow) => currentRow.clientId !== row.clientId));
      return;
    }
    await postAction({ action: "clear_row", sheetRowNumber: row.sheetRowNumber }, `clear-${row.sheetRowNumber}`);
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#f3f4f6_48%,#eef2f7_100%)]">
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="flex items-center gap-4">
              <BrandMark />
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{BRAND.studio}</p>
                <h1 className="mt-1 text-3xl font-semibold text-slate-950">{BRAND.product}</h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={fetchRows}
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("editor")}
                className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                <Shield className="h-4 w-4" />
                Editor
              </button>
            </div>
          </div>
          <nav className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
            {[
              { key: "overview", label: "Overview", icon: BarChart3 },
              { key: "hierarchy", label: "Hierarchy", icon: Layers3 },
              { key: "cleanup", label: "Cleanup", icon: Wrench },
              { key: "editor", label: "Editor", icon: Table2 },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium ${
                  activeTab === tab.key ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:bg-white"
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {(error || notice) && (
          <div
            className={`mb-5 rounded-md border px-4 py-3 text-sm ${
              error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {error || notice}
          </div>
        )}

        {activeTab === "overview" && (
          <TrackerTab
            filteredRecords={filteredRecords}
            filters={filters}
            kpis={kpis}
            loading={loading}
            qaStats={qaStats}
            qaFlags={qaFlags}
            setFilters={setFilters}
            fileProgress={fileProgress}
            coverage={coverage}
            workerProgress={workerProgress}
          />
        )}

        {activeTab === "hierarchy" && (
          <HierarchyTab
            hierarchy={hierarchy}
            coverage={coverage}
            perspectiveStats={perspectiveStats}
            setStatsPerspective={setStatsPerspective}
            statsPerspective={statsPerspective}
          />
        )}

        {activeTab === "cleanup" && (
          <CleanupTab
            adminToken={adminToken}
            commitCleanupRows={commitCleanupRows}
            crossRowIssues={crossRowIssues}
            coverage={coverage}
            normalizeAllRows={normalizeAllRows}
            pendingCleanupCount={pendingCleanupIds.size}
            qaFlags={qaFlags}
            qaStats={qaStats}
            resolveCrossWorkerDuplicates={resolveCrossWorkerDuplicates}
            sameRowQueueIssues={sameRowQueueIssues}
            savingKey={savingKey}
            setAdminToken={setAdminToken}
            setActiveTab={setActiveTab}
          />
        )}

        {activeTab === "editor" && (
          <EditorTab
            addLocalRow={addLocalRow}
            adminToken={adminToken}
            applyMove={applyMove}
            clearSheetRow={clearSheetRow}
            moveTool={moveTool}
            normalizeAllRows={normalizeAllRows}
            normalizeLocalRow={normalizeLocalRow}
            rows={enrichedRows}
            saveRow={saveRow}
            savingKey={savingKey}
            setAdminToken={setAdminToken}
            setMoveTool={setMoveTool}
            updateLocalRow={updateLocalRow}
          />
        )}
      </div>
    </main>
  );
}

function TrackerTab({ coverage, fileProgress, filteredRecords, filters, kpis, loading, qaFlags, qaStats, setFilters, workerProgress }) {
  const kpiCards = [
    { label: "Total Images", value: kpis.total, icon: ClipboardList, tone: "border-slate-200" },
    { label: "Assigned", value: kpis.assigned, icon: ClipboardList, tone: "border-slate-300" },
    { label: "WIP", value: kpis.wip, icon: Loader2, tone: "border-sky-300" },
    { label: "Completed", value: kpis.completed, icon: CheckCircle2, tone: "border-amber-300" },
    { label: "Verified", value: kpis.verified, icon: Shield, tone: "border-emerald-300" },
    { label: "Workers", value: kpis.workers, icon: Users, tone: "border-slate-200" },
  ];
  const totalQueueItem = {
    total: kpis.total,
    assigned: kpis.assigned,
    wip: kpis.wip,
    completed: kpis.completed,
    verified: kpis.verified,
  };

  return (
    <div className="space-y-6">
      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Production Snapshot</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">{verifiedPercent(totalQueueItem)}% verified overall</h2>
          </div>
          <div className="min-w-72 flex-1 lg:max-w-xl">
            <StageBar item={totalQueueItem} />
            <div className="mt-3 flex flex-wrap gap-2">
              {QUEUES.map((queue) => (
                <QueuePill key={queue.key} queueKey={queue.key} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {kpiCards.map((card) => (
          <div key={card.label} className={`rounded-md border-l-4 ${card.tone} border-y border-r bg-white p-4 shadow-panel`}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-500">{card.label}</p>
              <card.icon className="h-5 w-5 text-slate-400" />
            </div>
            <p className="mt-3 text-3xl font-semibold text-slate-950">{card.value || 0}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-5">
        {[
          { label: "Multi-stage Images", value: qaStats.multipleQueues },
          { label: "Queue Duplicates", value: qaStats.duplicateWithinQueue },
          { label: "Cross-row Conflicts", value: qaStats.crossRowDuplicates },
          {
            label: "Missing Images",
            value: coverage.fileCoverage.reduce((total, file) => total + file.missing.length, 0),
          },
          { label: "Inherited Worker Rows", value: qaStats.inheritedWorkerRows },
        ].map((item) => (
          <div key={item.label} className="rounded-md border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-800">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold text-amber-950">{item.value || 0}</p>
          </div>
        ))}
      </section>

      <section className="rounded-md border border-slate-200 bg-white shadow-panel">
        <SectionHeader eyebrow="Worker View" title="Worker Progress" />
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                {["Worker", "Flow", "Assigned", "WIP", "Completed", "Verified", "Total", "Verified %"].map((heading) => (
                  <th key={heading} className="px-4 py-3">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {workerProgress.map((worker) => {
                const percent = verifiedPercent(worker);
                return (
                  <tr key={worker.worker}>
                    <td className="px-4 py-3 font-medium text-slate-900">{worker.worker}</td>
                    <td className="px-4 py-3"><StageBar item={worker} compact /></td>
                    <td className="px-4 py-3">{worker.assigned}</td>
                    <td className="px-4 py-3">{worker.wip}</td>
                    <td className="px-4 py-3">{worker.completed}</td>
                    <td className="px-4 py-3">{worker.verified}</td>
                    <td className="px-4 py-3">{worker.total}</td>
                    <td className="px-4 py-3">
                      <div className="flex min-w-36 items-center gap-3">
                        <div className="h-2 flex-1 rounded-full bg-slate-100">
                          <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${percent}%` }} />
                        </div>
                        <span className="w-10 text-right text-slate-600">{percent}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white shadow-panel">
        <SectionHeader eyebrow="File View" title="Worker File Breakdown" />
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                {["Worker", "Batch", "File", "Flow", "Assigned", "WIP", "Completed", "Verified", "Total"].map((heading) => (
                  <th key={heading} className="px-4 py-3">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fileProgress.map((file) => (
                <tr key={`${file.worker}-${file.batchNo}-${file.fileNo}`}>
                  <td className="px-4 py-3 font-medium text-slate-900">{file.worker}</td>
                  <td className="px-4 py-3">{file.batchNo}</td>
                  <td className="px-4 py-3">{file.fileNo}</td>
                  <td className="px-4 py-3"><StageBar item={file} compact /></td>
                  <td className="px-4 py-3">{file.assigned}</td>
                  <td className="px-4 py-3">{file.wip}</td>
                  <td className="px-4 py-3">{file.completed}</td>
                  <td className="px-4 py-3">{file.verified}</td>
                  <td className="px-4 py-3">{file.total}</td>
                </tr>
              ))}
              {fileProgress.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={9}>
                    No file progress yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <CoverageSection coverage={coverage} />

      <section className="rounded-md border border-slate-200 bg-white shadow-panel">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-4 py-4">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-slate-400" />
            <h2 className="text-lg font-semibold text-slate-950">Image Task List</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <FilterInput icon={Search} label="Search" value={filters.search} onChange={(value) => setFilters({ ...filters, search: value })} />
            <FilterInput label="Worker" value={filters.worker} onChange={(value) => setFilters({ ...filters, worker: value })} />
            <FilterInput label="Batch" value={filters.batchNo} onChange={(value) => setFilters({ ...filters, batchNo: value })} />
            <FilterInput label="File" value={filters.fileNo} onChange={(value) => setFilters({ ...filters, fileNo: value })} />
            <FilterInput
              label="Image No."
              type="number"
              value={filters.imageNumber}
              onChange={(value) => setFilters({ ...filters, imageNumber: value })}
            />
            <select
              aria-label="Status"
              value={filters.status}
              onChange={(event) => setFilters({ ...filters, status: event.target.value })}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
            >
              <option value="">All statuses</option>
              {QUEUES.map((queue) => (
                <option key={queue.key} value={queue.key}>
                  {queue.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                {["Worker", "Batch", "File", "Image", "Latest Status", "Raw Queues", "Sheet Row"].map((heading) => (
                  <th key={heading} className="px-4 py-3">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRecords.map((record) => (
                <tr key={record.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{record.worker || "Unassigned"}</td>
                  <td className="px-4 py-3">{record.batchNo}</td>
                  <td className="px-4 py-3">{record.fileNo}</td>
                  <td className="px-4 py-3">{record.imageNumber}</td>
                  <td className="px-4 py-3">
                    <QueuePill queueKey={record.status} />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        record.hasQueueConflict ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {record.rawQueues.map(queueLabel).join(", ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">{record.sheetRowNumber}</td>
                </tr>
              ))}
              {!loading && filteredRecords.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={7}>
                    No matching tasks.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white shadow-panel">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <h2 className="text-lg font-semibold text-slate-950">QA Flags</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {qaFlags.map((flag, index) => (
            <div key={`${flag.type}-${index}`} className="px-4 py-3 text-sm">
              <p className="font-medium text-slate-900">{flag.type}</p>
              <p className="text-slate-600">{flag.message}</p>
            </div>
          ))}
          {qaFlags.length === 0 && <p className="px-4 py-6 text-sm text-slate-500">No QA flags found.</p>}
        </div>
      </section>
    </div>
  );
}

function HierarchyTab({ coverage, hierarchy, perspectiveStats, setStatsPerspective, statsPerspective }) {
  return (
    <div className="space-y-6">
      <section className="rounded-md border border-slate-200 bg-white shadow-panel">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Batch / File / Worker</p>
            <h2 className="text-lg font-semibold text-slate-950">Master Hierarchy</h2>
          </div>
          <div className="inline-flex rounded-md border border-slate-300 bg-white p-1">
            {["batch", "file", "worker"].map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => setStatsPerspective(view)}
                className={`rounded px-3 py-1.5 text-sm font-medium capitalize ${
                  statsPerspective === view ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {view}
              </button>
            ))}
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {hierarchy.map((batch) => (
            <div key={batch.batchNo} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-950">Batch {batch.batchNo}</h3>
                    <p className="text-sm text-slate-500">
                      {batch.files.length} files, {batch.total} unique images
                    </p>
                  </div>
                <div className="min-w-72">
                  <StageBar item={batch} />
                  <div className="mt-2"><QueueMiniStats item={batch} /></div>
                </div>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {batch.files.map((file) => (
                  <div key={`${batch.batchNo}-${file.fileNo}`} className="rounded-md border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">File {file.fileNo}</p>
                        <p className="text-sm text-slate-500">{file.total} images across {file.workers.length} workers</p>
                      </div>
                      <StageBar item={file} compact />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {file.workers.map((worker) => (
                        <span key={worker.worker} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                          {worker.worker}: {worker.total}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {hierarchy.length === 0 && <p className="p-6 text-sm text-slate-500">No hierarchy data yet.</p>}
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white shadow-panel">
        <SectionHeader eyebrow={`${statsPerspective} perspective`} title="Perspective Stats" />
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                {["Name", "Flow", "Assigned", "WIP", "Completed", "Verified", "Total", "Verified %"].map((heading) => (
                  <th key={heading} className="px-4 py-3">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {perspectiveStats.map((item) => {
                const percent = verifiedPercent(item);
                return (
                  <tr key={item.label}>
                    <td className="px-4 py-3 font-medium text-slate-900">{item.label}</td>
                    <td className="px-4 py-3"><StageBar item={item} compact /></td>
                    <td className="px-4 py-3">{item.assigned}</td>
                    <td className="px-4 py-3">{item.wip}</td>
                    <td className="px-4 py-3">{item.completed}</td>
                    <td className="px-4 py-3">{item.verified}</td>
                    <td className="px-4 py-3">{item.total}</td>
                    <td className="px-4 py-3">{percent}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <CoverageSection coverage={coverage} />
    </div>
  );
}

function CoverageSection({ coverage }) {
  const totalMissing = coverage.fileCoverage.reduce((total, file) => total + file.missing.length, 0);

  return (
    <section className="rounded-md border border-slate-200 bg-white shadow-panel">
      <SectionHeader
        eyebrow={`${EXPECTED_IMAGES_PER_FILE} images expected per file`}
        title="File Coverage"
        action={<span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">{totalMissing} missing</span>}
      />
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              {["Batch", "File", "Coverage", "Present", "Missing Count", "Missing Images", "Out of Range"].map((heading) => (
                <th key={heading} className="px-4 py-3">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {coverage.fileCoverage.map((file) => (
              <tr key={file.key}>
                <td className="px-4 py-3 font-medium text-slate-900">{file.batchNo}</td>
                <td className="px-4 py-3">{file.fileNo}</td>
                <td className="px-4 py-3">
                  <div className="flex min-w-40 items-center gap-3">
                    <div className="h-2 flex-1 rounded-full bg-slate-100">
                      <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${file.coveragePercent}%` }} />
                    </div>
                    <span className="w-10 text-right text-slate-600">{file.coveragePercent}%</span>
                  </div>
                </td>
                <td className="px-4 py-3">{file.present}/100</td>
                <td className="px-4 py-3">{file.missing.length}</td>
                <td className="max-w-md px-4 py-3 text-slate-600">
                  {file.missing.length ? file.missing.join(", ") : "None"}
                </td>
                <td className="px-4 py-3 text-slate-600">{file.outOfRange.length ? file.outOfRange.join(", ") : "None"}</td>
              </tr>
            ))}
            {coverage.fileCoverage.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500" colSpan={7}>
                  No file rows found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-200 px-4 py-3">
        <p className="text-sm font-medium text-slate-700">Batch file coverage</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {coverage.batchCoverage.map((batch) => (
            <span key={batch.batchNo} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
              Batch {batch.batchNo}: {batch.filesPresent}/{EXPECTED_FILES_PER_BATCH} files
              {batch.missingFiles.length ? `, missing files ${batch.missingFiles.join(", ")}` : ""}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function QueueMiniStats({ item }) {
  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      {QUEUES.map((queue) => (
        <span key={queue.key} className="rounded-full border border-slate-200 px-2 py-1 text-slate-600">
          {queue.label}: {item[queue.key] || 0}
        </span>
      ))}
    </div>
  );
}

function CleanupTab({
  adminToken,
  commitCleanupRows,
  coverage,
  crossRowIssues,
  normalizeAllRows,
  pendingCleanupCount,
  qaFlags,
  qaStats,
  resolveCrossWorkerDuplicates,
  sameRowQueueIssues,
  savingKey,
  setAdminToken,
  setActiveTab,
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Data Quality</p>
            <h2 className="text-xl font-semibold text-slate-950">Cleanup Workbench</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {qaStats.multipleQueues + crossRowIssues.length + qaStats.duplicateWithinQueue > 0 ? (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800">
                Review needed
              </span>
            ) : (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800">
                Clean
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Same-row multi-stage", value: qaStats.multipleQueues },
          { label: "Duplicate in queue", value: qaStats.duplicateWithinQueue },
          { label: "Cross-worker conflicts", value: crossRowIssues.length },
          {
            label: "Missing images",
            value: coverage.fileCoverage.reduce((total, file) => total + file.missing.length, 0),
          },
        ].map((item) => (
          <div key={item.label} className="rounded-md border border-slate-200 bg-white p-4 shadow-panel">
            <p className="text-sm font-medium text-slate-500">{item.label}</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{item.value || 0}</p>
          </div>
        ))}
      </section>

      <CoverageSection coverage={coverage} />

      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-panel">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto_auto_auto] lg:items-end">
          <label>
            <span className="text-sm font-medium text-slate-700">Admin password</span>
            <input
              type="password"
              value={adminToken}
              onChange={(event) => setAdminToken(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Required to commit cleanup"
            />
          </label>
          <button
            type="button"
            onClick={normalizeAllRows}
            className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
          >
            Normalize stages locally
          </button>
          <button
            type="button"
            onClick={resolveCrossWorkerDuplicates}
            className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
          >
            Resolve cross-worker locally
          </button>
          <button
            type="button"
            onClick={commitCleanupRows}
            disabled={!adminToken || pendingCleanupCount === 0 || savingKey === "cleanup"}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {savingKey === "cleanup" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Commit cleanup
          </button>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white shadow-panel">
        <SectionHeader
          eyebrow="Ownership"
          title="Cross-worker / Cross-row Conflicts"
          action={
            <button type="button" onClick={() => setActiveTab("editor")} className="text-sm font-medium text-slate-700 hover:text-slate-950">
              Open editor
            </button>
          }
        />
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                {["Batch", "File", "Image", "Workers", "Rows", "Statuses"].map((heading) => (
                  <th key={heading} className="px-4 py-3">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {crossRowIssues.map((issue) => (
                <tr key={issue.key}>
                  <td className="px-4 py-3">{issue.batchNo}</td>
                  <td className="px-4 py-3">{issue.fileNo}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{issue.imageNumber}</td>
                  <td className="px-4 py-3">{issue.workers.join(", ")}</td>
                  <td className="px-4 py-3">{issue.rows.join(", ")}</td>
                  <td className="px-4 py-3">{[...new Set(issue.records.map((record) => queueLabel(record.status)))].join(", ")}</td>
                </tr>
              ))}
              {crossRowIssues.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={6}>
                    No cross-row conflicts.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white shadow-panel">
        <SectionHeader eyebrow="Workflow" title="Same-row Multi-stage Images" />
        <div className="divide-y divide-slate-100">
          {sameRowQueueIssues.slice(0, 40).map((issue) => (
            <div key={`${issue.sheetRowNumber}-${issue.imageNumber}`} className="px-4 py-3 text-sm">
              <p className="font-medium text-slate-900">
                Row {issue.sheetRowNumber}: Batch {issue.batchNo} / File {issue.fileNo} / Image {issue.imageNumber}
              </p>
              <p className="text-slate-600">
                Present in {issue.rawQueues.map(queueLabel).join(", ")}. Cleanup keeps {queueLabel(issue.status)}.
              </p>
            </div>
          ))}
          {sameRowQueueIssues.length === 0 && <p className="px-4 py-6 text-sm text-slate-500">No same-row multi-stage issues.</p>}
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white shadow-panel">
        <SectionHeader eyebrow="Audit" title="All QA Flags" />
        <div className="divide-y divide-slate-100">
          {qaFlags.map((flag, index) => (
            <div key={`${flag.type}-${index}`} className="px-4 py-3 text-sm">
              <p className="font-medium text-slate-900">{flag.type}</p>
              <p className="text-slate-600">{flag.message}</p>
            </div>
          ))}
          {qaFlags.length === 0 && <p className="px-4 py-6 text-sm text-slate-500">No QA flags found.</p>}
        </div>
      </section>
    </div>
  );
}

function FilterInput({ icon: Icon, label, onChange, type = "text", value }) {
  return (
    <label className="relative block">
      {Icon && <Icon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />}
      <span className="sr-only">{label}</span>
      <input
        type={type}
        placeholder={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-md border border-slate-300 bg-white py-2 text-sm text-slate-800 placeholder:text-slate-400 ${
          Icon ? "pl-9 pr-3" : "px-3"
        }`}
      />
    </label>
  );
}

function EditorTab({
  addLocalRow,
  adminToken,
  applyMove,
  clearSheetRow,
  moveTool,
  normalizeAllRows,
  normalizeLocalRow,
  rows,
  saveRow,
  savingKey,
  setAdminToken,
  setMoveTool,
  updateLocalRow,
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-panel">
        <label className="block max-w-xl">
          <span className="text-sm font-medium text-slate-700">Admin password</span>
          <input
            type="password"
            value={adminToken}
            onChange={(event) => setAdminToken(event.target.value)}
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Required for saving changes"
          />
        </label>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-panel">
        <div className="grid gap-4 lg:grid-cols-[1fr_180px_1fr_auto_auto]">
          <label>
            <span className="text-sm font-medium text-slate-700">Row</span>
            <select
              value={moveTool.rowId}
              onChange={(event) => setMoveTool({ ...moveTool, rowId: event.target.value })}
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Select row</option>
              {rows.map((row) => {
                const rowId = String(row.sheetRowNumber || row.clientId);
                return (
                  <option key={rowId} value={rowId}>
                    Row {row.sheetRowNumber || "new"} - {row.effectiveWorker || "Unassigned"} / Batch {row.batchNo || "-"} /
                    File {row.fileNo || "-"}
                  </option>
                );
              })}
            </select>
          </label>
          <label>
            <span className="text-sm font-medium text-slate-700">Target queue</span>
            <select
              value={moveTool.targetQueue}
              onChange={(event) => setMoveTool({ ...moveTool, targetQueue: event.target.value })}
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {QUEUES.map((queue) => (
                <option key={queue.key} value={queue.key}>
                  {queue.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-sm font-medium text-slate-700">Image numbers</span>
            <input
              value={moveTool.imageNumbers}
              onChange={(event) => setMoveTool({ ...moveTool, imageNumbers: event.target.value })}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="1001, 1002 1003-1004"
            />
          </label>
          <button
            type="button"
            onClick={applyMove}
            disabled={!moveTool.rowId || !moveTool.imageNumbers}
            className="self-end rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Apply move
          </button>
          <button
            type="button"
            onClick={() => normalizeLocalRow(moveTool.rowId)}
            disabled={!moveTool.rowId}
            className="self-end rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
          >
            Normalize row
          </button>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-950">Editable Rows</h2>
          <button
            type="button"
            onClick={addLocalRow}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" />
            Add row
          </button>
          <button
            type="button"
            onClick={normalizeAllRows}
            className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
          >
            <CheckCircle2 className="h-4 w-4" />
            Normalize all locally
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1200px] divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3">Sheet Row</th>
                <th className="px-3 py-3">Effective Worker</th>
                {COLUMNS.map((column) => (
                  <th key={column.key} className="px-3 py-3">
                    {column.label}
                  </th>
                ))}
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const rowId = String(row.sheetRowNumber || row.clientId);
                return (
                  <tr key={rowId}>
                    <td className="px-3 py-3 text-slate-500">{row.sheetRowNumber || "New"}</td>
                    <td className="px-3 py-3">
                      <div className="font-medium text-slate-900">{row.effectiveWorker || "Unassigned"}</div>
                      {row.workerInherited && <div className="text-xs text-slate-500">Inherited from row above</div>}
                    </td>
                    {COLUMNS.map((column) => (
                      <td key={column.key} className="px-3 py-3">
                        <input
                          value={row[column.key] || ""}
                          onChange={(event) => updateLocalRow(rowId, column.key, event.target.value)}
                          className="w-full min-w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                        />
                      </td>
                    ))}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => saveRow(row)}
                          disabled={!adminToken || savingKey === `save-${row.sheetRowNumber || row.clientId}`}
                          className="inline-flex items-center gap-1.5 rounded-md bg-slate-950 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          {savingKey === `save-${row.sheetRowNumber || row.clientId}` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Save className="h-3.5 w-3.5" />
                          )}
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => clearSheetRow(row)}
                          disabled={Boolean(row.sheetRowNumber && (!adminToken || savingKey === `clear-${row.sheetRowNumber}`))}
                          className="inline-flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Clear
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={10}>
                    No rows loaded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
