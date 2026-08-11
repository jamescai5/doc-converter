import { useCallback, useMemo, useRef, useState } from "react";
import {
  DetectedType,
  FORMATS,
  FormatId,
  SourceKind,
  detectType,
  targetsFor,
} from "./lib/formats";
import { convert, zipFiles } from "./lib/convert";
import { track } from "./lib/analytics";

const MAX_FILES = 20;

type Status = "idle" | "converting" | "done" | "error";

interface Item {
  id: string;
  file: File;
  previewUrl?: string;
  detecting: boolean;
  source: SourceKind;
  sourceLabel: string;
  target: FormatId | "";
  status: Status;
  result?: { blob: Blob; name: string };
  error?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

function baseName(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? name : name.slice(0, dot);
}

function outputName(originalName: string, ext: string): string {
  return `${baseName(originalName)}.${ext}`;
}

export default function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const incoming = Array.from(files);
      setItems((prev) => {
        const room = MAX_FILES - prev.length;
        const accepted = incoming.slice(0, Math.max(0, room));
        if (accepted.length > 0) track("upload", accepted.length);
        const newItems: Item[] = accepted.map((file) => ({
          id: crypto.randomUUID(),
          file,
          // HEIC/HEIF can't be shown in an <img>, so skip the preview for them.
          previewUrl:
            file.type.startsWith("image/") && file.type !== "image/heic" && file.type !== "image/heif"
              ? URL.createObjectURL(file)
              : undefined,
          detecting: true,
          source: "unknown",
          sourceLabel: "Detecting…",
          target: "",
          status: "idle",
        }));

        // Detect each new file's type asynchronously and patch it into state.
        newItems.forEach((item) => {
          detectType(item.file).then((detected: DetectedType) => {
            setItems((cur) =>
              cur.map((it) =>
                it.id === item.id
                  ? {
                      ...it,
                      detecting: false,
                      source: detected.kind,
                      sourceLabel: detected.label,
                      target: targetsFor(detected.kind)[0] ?? "",
                    }
                  : it,
              ),
            );
          });
        });

        return [...prev, ...newItems];
      });
    },
    [],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  const setTarget = (id: string, target: FormatId) => {
    setItems((cur) =>
      cur.map((it) =>
        it.id === id ? { ...it, target, status: it.status === "error" ? "idle" : it.status } : it,
      ),
    );
  };

  const removeItem = (id: string) => {
    setItems((cur) => {
      const gone = cur.find((it) => it.id === id);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return cur.filter((it) => it.id !== id);
    });
  };

  const clearAll = () => {
    items.forEach((it) => it.previewUrl && URL.revokeObjectURL(it.previewUrl));
    setItems([]);
  };

  const runConvert = useCallback(async (item: Item) => {
    if (!item.target || item.source === "unknown") return;
    setItems((cur) => cur.map((it) => (it.id === item.id ? { ...it, status: "converting", error: undefined } : it)));
    try {
      const { blob, ext } = await convert(item.file, item.source, item.target as FormatId);
      const name = outputName(item.file.name, ext);
      track("conversion", 1);
      setItems((cur) =>
        cur.map((it) => (it.id === item.id ? { ...it, status: "done", result: { blob, name } } : it)),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Conversion failed";
      setItems((cur) => cur.map((it) => (it.id === item.id ? { ...it, status: "error", error: message } : it)));
    }
  }, []);

  // Snapshot the latest items when "Convert all" runs, then convert each pending row.
  const convertAll = useCallback(() => {
    setItems((cur) => {
      cur
        .filter((it) => it.target && it.source !== "unknown" && it.status !== "done" && it.status !== "converting")
        .forEach((it) => void runConvert(it));
      return cur;
    });
  }, [runConvert]);

  const downloadBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadAll = useCallback(async () => {
    const done = items.filter((it) => it.status === "done" && it.result);
    if (done.length === 0) return;
    track("download", done.length);
    if (done.length === 1) {
      downloadBlob(done[0].result!.blob, done[0].result!.name);
      return;
    }
    const zip = await zipFiles(done.map((it) => ({ name: it.result!.name, blob: it.result!.blob })));
    downloadBlob(zip, "converted-files.zip");
  }, [items]);

  const stats = useMemo(() => {
    const doneCount = items.filter((it) => it.status === "done").length;
    const pending = items.filter(
      (it) => it.target && it.source !== "unknown" && it.status !== "done" && it.status !== "converting",
    ).length;
    return { doneCount, pending };
  }, [items]);

  const atCapacity = items.length >= MAX_FILES;

  return (
    <div className="page">
      <div className="aurora" aria-hidden />
      <header className="hero">
        <div className="logo">
          <span className="logo-mark">◆</span> File Converter
        </div>
        <h1>
          Free Image &amp; PDF <span className="grad">Converter</span>
        </h1>
        <p className="tagline">
          Convert PNG, JPG, WebP, HEIC, AVIF, GIF, BMP, SVG, and PDF files online. Drop up to{" "}
          {MAX_FILES} files, pick a target format, and download.
        </p>
      </header>

      <main className="stage">
        <label
          className={`dropzone${dragging ? " dragging" : ""}${atCapacity ? " disabled" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            if (!atCapacity) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,application/pdf"
            hidden
            disabled={atCapacity}
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <div className="dz-icon">⬆</div>
          <div className="dz-title">{atCapacity ? "File limit reached" : "Drag & drop files here"}</div>
          <div className="dz-sub">
            {atCapacity ? (
              <>Remove a file to add more · max {MAX_FILES}</>
            ) : (
              <>
                or <span className="dz-browse">browse</span> · images &amp; PDFs · up to {MAX_FILES}
              </>
            )}
          </div>
        </label>

        {items.length > 0 && (
          <section className="panel">
            <div className="panel-head">
              <div className="counter">
                <strong>{items.length}</strong> / {MAX_FILES} files
                {stats.doneCount > 0 && <span className="counter-done"> · {stats.doneCount} converted</span>}
              </div>
              <div className="panel-actions">
                <button className="btn ghost" onClick={clearAll}>
                  Clear all
                </button>
                <button className="btn secondary" onClick={convertAll} disabled={stats.pending === 0}>
                  Convert all{stats.pending > 0 ? ` (${stats.pending})` : ""}
                </button>
                <button className="btn primary" onClick={downloadAll} disabled={stats.doneCount === 0}>
                  ⤓ Download all
                </button>
              </div>
            </div>

            <ul className="rows">
              {items.map((item) => (
                <FileRow
                  key={item.id}
                  item={item}
                  onTarget={setTarget}
                  onConvert={runConvert}
                  onDownload={() => {
                    if (!item.result) return;
                    track("download", 1);
                    downloadBlob(item.result.blob, item.result.name);
                  }}
                  onRemove={removeItem}
                />
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

interface RowProps {
  item: Item;
  onTarget: (id: string, t: FormatId) => void;
  onConvert: (item: Item) => void;
  onDownload: () => void;
  onRemove: (id: string) => void;
}

function FileRow({ item, onTarget, onConvert, onDownload, onRemove }: RowProps) {
  const targets = targetsFor(item.source);
  const canConvert = !!item.target && item.source !== "unknown" && item.status !== "converting";
  const isDone = item.status === "done";

  return (
    <li className={`row status-${item.status}`}>
      <div className="thumb">
        {item.previewUrl ? (
          <img src={item.previewUrl} alt="" />
        ) : (
          <span className="thumb-glyph">
            {item.source === "pdf" ? "PDF" : item.source === "heic" ? "HEIC" : "?"}
          </span>
        )}
      </div>

      <div className="meta">
        <div className="name" title={item.file.name}>
          {item.file.name}
        </div>
        <div className="sub">
          <span className={`badge${item.detecting ? " badge-loading" : ""}`}>{item.sourceLabel}</span>
          <span className="size">{formatBytes(item.file.size)}</span>
          {item.status === "error" && <span className="err">⚠ {item.error}</span>}
        </div>
      </div>

      <div className="controls">
        {item.source === "unknown" && !item.detecting ? (
          <span className="unsupported">Unsupported type</span>
        ) : (
          <div className="convert-to">
            <span className="arrow">→</span>
            <select
              className="select"
              value={item.target}
              disabled={item.detecting || targets.length === 0}
              onChange={(e) => onTarget(item.id, e.target.value as FormatId)}
            >
              {item.detecting && <option>…</option>}
              {targets.map((t) => (
                <option key={t} value={t}>
                  {FORMATS[t].label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="row-actions">
        {isDone ? (
          <button className="btn primary sm" onClick={onDownload}>
            ⤓ Download
          </button>
        ) : (
          <>
            <button className="btn secondary sm" disabled={!canConvert} onClick={() => onConvert(item)}>
              {item.status === "converting" ? <span className="spinner" /> : "Convert"}
            </button>
            <button className="btn primary sm" disabled title="Convert first to enable download">
              ⤓ Download
            </button>
          </>
        )}
        <button className="icon-btn" title="Remove" onClick={() => onRemove(item.id)}>
          ✕
        </button>
      </div>
    </li>
  );
}
