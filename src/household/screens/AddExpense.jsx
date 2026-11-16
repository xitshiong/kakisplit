import { useMemo, useRef, useState } from "react";
import {
  Avatar,
  Card,
  ErrorBox,
  Spinner,
  todayISO,
} from "../components/common.jsx";
import { CATEGORIES, categoryMeta, saveExpense } from "../lib/db.js";
import { CURRENCIES, bakeExtras, fmt, fmtPlain, toCents } from "../lib/money.js";
import { prepareImage, scanReceipt, thumbnail } from "../lib/ocr.js";
import { prepWarningMessage } from "../lib/receiptPrepCore.js";

const STEPS = ["Receipt", "Check", "Split", "Save"];

const SCAN_STAGES = [
  { id: "preparing", label: "Checking photo quality" },
  { id: "reading", label: "Reading every line" },
  { id: "cross-checking", label: "Second reader cross-checking" },
  { id: "verifying", label: "Checking the maths" },
];

export default function AddExpense({ household, members, currentMember, user, onCancel, onSaved }) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");

  // Receipt capture
  const [parts, setParts] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [stage, setStage] = useState(null);
  const fileRef = useRef();

  // Extracted / entered data
  const [items, setItems] = useState([]);
  const [totalCents, setTotalCents] = useState(0);
  const [report, setReport] = useState(null);
  const [receiptImage, setReceiptImage] = useState(null);
  const [taxCents, setTaxCents] = useState(0);
  const [serviceCents, setServiceCents] = useState(0);
  const [discountCents, setDiscountCents] = useState(0);
  const [roundingCents, setRoundingCents] = useState(0);

  // Split
  const [splitBy, setSplitBy] = useState("equal"); // "equal" | "items"
  const [included, setIncluded] = useState(() => new Set(members.map((m) => m.id)));

  // Meta
  const [title, setTitle] = useState("");
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState("groceries");
  const [expenseDate, setExpenseDate] = useState(todayISO());
  const [paidBy, setPaidBy] = useState(currentMember?.id || members[0]?.id || "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // The grand total is the source of truth: it is printed on the receipt. Tax,
  // service and discounts are re-spread across items whenever a line is
  // edited, so the parts always add back up to the whole.
  const baked = useMemo(() => {
    const spread = bakeExtras(items.map((i) => i.lineCents), totalCents);
    return items.map((item, i) => ({ ...item, ...spread[i] }));
  }, [items, totalCents]);

  const lineSum = baked.reduce((s, i) => s + i.lineCents, 0);
  const extrasCents = totalCents - lineSum;
  const explainedCents = taxCents + serviceCents - discountCents + roundingCents;
  const unexplainedCents = extrasCents - explainedCents;

  const addFiles = async (files) => {
    setError("");
    try {
      const prepared = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        prepared.push(await prepareImage(file));
      }
      if (prepared.length) setParts((prev) => [...prev, ...prepared]);
    } catch (e) {
      setError(e.message || "Couldn't read that image.");
    }
  };

  const runScan = async () => {
    setScanning(true);
    setError("");
    setStage("preparing");
    try {
      const result = await scanReceipt(parts, { onProgress: (s) => setStage(s) });

      setItems(
        result.items.map((item, i) => ({
          id: `i${i}`,
          name: item.name,
          qty: item.qty,
          unit: item.unit,
          unitCents: item.unitCents,
          lineCents: item.lineCents,
          category: item.category,
          confidence: item.confidence,
          flags: item.flags,
          alternative: item.alternative,
          memberIds: [],
        }))
      );
      setTotalCents(result.totalCents);
      setTaxCents(result.taxCents);
      setServiceCents(result.serviceCents);
      setDiscountCents(result.discountCents);
      setRoundingCents(result.roundingCents);
      setReport(result.report);
      setMerchant(result.merchant || "");
      setTitle(result.merchant || "Groceries");
      if (result.receiptDate) setExpenseDate(result.receiptDate);
      setReceiptImage(await thumbnail(parts[0].dataUrl));
      setStep(1);
    } catch (e) {
      setError(e.message || "Couldn't read that receipt.");
    }
    setScanning(false);
    setStage(null);
  };

  const startManual = () => {
    setItems([]);
    setReport(null);
    setTitle("");
    setStep(1);
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const memberIds = members.map((m) => m.id);
      const includedIds = memberIds.filter((id) => included.has(id));
      const weights = Object.fromEntries(
        memberIds.map((id) => [id, included.has(id) ? 1 : 0])
      );
      const everyone = includedIds.length === memberIds.length;

      await saveExpense({
        household,
        memberIds,
        // Line items are kept even on an even split, so the expense detail
        // still shows what was actually bought.
        items: baked,
        expense: {
          title: title.trim() || categoryMeta(category).label,
          merchant: merchant.trim() || null,
          category,
          expenseDate,
          paidBy,
          subtotalCents: lineSum,
          taxCents,
          serviceCents,
          discountCents,
          roundingCents,
          totalCents,
          splitMode: splitBy === "items" ? "items" : everyone ? "equal" : "shares",
          weights,
          receiptImage,
          ocr: report,
          note: note.trim() || null,
          createdBy: user?.id || null,
        },
      });
      onSaved();
    } catch (e) {
      setError(e.message || "Couldn't save that expense.");
      setSaving(false);
    }
  };

  const canContinueFromReview = totalCents > 0 && (splitBy === "equal" || items.length > 0);

  return (
    <div className="hh-app no-nav">
      <div className="hh-header">
        <div className="hh-header-main">
          <div className="hh-house-name">New expense</div>
          <div className="hh-house-sub">
            Step {step + 1} of {STEPS.length} · {STEPS[step]}
          </div>
        </div>
        <button className="hh-icon-btn" onClick={onCancel} aria-label="Cancel">
          ✕
        </button>
      </div>

      {step === 0 && (
        scanning ? (
          <Card perforated>
            <ScanProgress stage={stage} partCount={parts.length} />
          </Card>
        ) : (
          <CaptureStep
            parts={parts}
            dragging={dragging}
            setDragging={setDragging}
            fileRef={fileRef}
            onFiles={addFiles}
            onRemove={(i) => setParts((p) => p.filter((_, idx) => idx !== i))}
            onScan={runScan}
            onManual={startManual}
            error={error}
          />
        )
      )}

      {step === 1 && (
        <ReviewStep
          household={household}
          items={baked}
          report={report}
          totalCents={totalCents}
          taxCents={taxCents}
          serviceCents={serviceCents}
          discountCents={discountCents}
          roundingCents={roundingCents}
          extrasCents={extrasCents}
          unexplainedCents={unexplainedCents}
          onChangeItems={setItems}
          onChangeTotal={setTotalCents}
          onChangeTax={setTaxCents}
          onChangeService={setServiceCents}
          onChangeDiscount={setDiscountCents}
          error={error}
          onBack={() => setStep(0)}
          onNext={() => setStep(2)}
          canNext={canContinueFromReview}
        />
      )}

      {step === 2 && (
        <SplitStep
          household={household}
          members={members}
          items={baked}
          totalCents={totalCents}
          splitBy={splitBy}
          setSplitBy={setSplitBy}
          included={included}
          setIncluded={setIncluded}
          onChangeItems={setItems}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}

      {step === 3 && (
        <ConfirmStep
          household={household}
          members={members}
          title={title}
          setTitle={setTitle}
          merchant={merchant}
          setMerchant={setMerchant}
          category={category}
          setCategory={setCategory}
          expenseDate={expenseDate}
          setExpenseDate={setExpenseDate}
          paidBy={paidBy}
          setPaidBy={setPaidBy}
          note={note}
          setNote={setNote}
          totalCents={totalCents}
          saving={saving}
          error={error}
          onBack={() => setStep(2)}
          onSave={save}
        />
      )}
    </div>
  );
}

// ── STEP 0: CAPTURE ───────────────────────────────────────────

function CaptureStep({ parts, dragging, setDragging, fileRef, onFiles, onRemove, onScan, onManual, error }) {
  return (
    <>
      <Card perforated>
        <div className="hh-section-title">Snap the receipt</div>
        <hr className="hh-divider" />

        <button
          type="button"
          className={`hh-drop ${dragging ? "over" : ""}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            onFiles(e.dataTransfer.files);
          }}
        >
          <span className="hh-drop-icon">🧾</span>
          <div className="hh-drop-title">
            {parts.length ? "Add another photo" : "Take or choose a photo"}
          </div>
          <div className="hh-drop-hint">
            Lay the receipt flat, fill the frame, and keep the total in shot.
          </div>
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          hidden
          onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }}
        />

        {parts.length > 0 && (
          <>
            <div className="hh-parts hh-mt">
              {parts.map((part, i) => (
                <div className="hh-part" key={i}>
                  <img src={part.preview} alt={`Receipt part ${i + 1}`} />
                  <span className="hh-part-no">{i + 1}</span>
                  <button className="hh-part-x" onClick={() => onRemove(i)} aria-label="Remove">
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <p className="hh-tiny hh-muted">
              Long grocery receipt? Photograph it in sections, top to bottom, and
              add each one here. They get read as one receipt.
            </p>
          </>
        )}

        <ErrorBox>{error}</ErrorBox>

        <div className="hh-mt">
          <button className="hh-btn hh-btn-neon" disabled={!parts.length} onClick={onScan}>
            Scan {parts.length > 1 ? `${parts.length} photos` : "receipt"}
          </button>
        </div>
      </Card>

      <button className="hh-action on-dark wide" onClick={onManual}>
        No receipt? Enter it manually
      </button>
    </>
  );
}

function ScanProgress({ stage, partCount }) {
  const activeIndex = SCAN_STAGES.findIndex((s) => s.id === stage);
  return (
    <div className="hh-scanning">
      <div className="hh-scan-bars">
        <i /><i /><i /><i /><i />
      </div>
      <div className="hh-scan-title">Reading your receipt</div>
      <div className="hh-scan-note">
        First the photo is checked and straightened locally, then two AI readers
        go through {partCount > 1 ? `all ${partCount} photos` : "it"} separately
        and the numbers are checked against the printed total.
      </div>
      <ul className="hh-steps">
        {SCAN_STAGES.map((s, i) => (
          <li
            key={s.id}
            className={i < activeIndex ? "done" : i === activeIndex ? "active" : ""}
          >
            <span className="dot" />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── STEP 1: REVIEW ────────────────────────────────────────────

function ReviewStep({
  household, items, report, totalCents, taxCents, serviceCents, discountCents,
  roundingCents, extrasCents, unexplainedCents, onChangeItems, onChangeTotal,
  onChangeTax, onChangeService, onChangeDiscount, error, onBack, onNext, canNext,
}) {
  const [editingId, setEditingId] = useState(null);
  const currency = household.currency;

  const patchItem = (id, patch) =>
    onChangeItems(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const removeItem = (id) => onChangeItems(items.filter((i) => i.id !== id));

  const addItem = () => {
    const id = `n${Date.now()}`;
    onChangeItems([
      ...items,
      { id, name: "", qty: 1, unit: "ea", unitCents: 0, lineCents: 0, flags: ["added"], confidence: 1, memberIds: [] },
    ]);
    setEditingId(id);
  };

  const flagged = items.filter((i) => i.flags?.length || i.confidence < 0.9);

  return (
    <>
      {report && <Verdict report={report} currency={currency} unexplainedCents={unexplainedCents} />}

      <Card perforated>
        <div className="hh-section-title">
          <span>{items.length ? `${items.length} items` : "Amount"}</span>
          {items.length > 0 && (
            <button className="hh-action accent" onClick={addItem}>+ Add line</button>
          )}
        </div>
        <hr className="hh-divider" />

        {items.length === 0 ? (
          <div className="hh-field">
            <label className="hh-label" htmlFor="hh-total">Total amount</label>
            <input
              id="hh-total"
              className="hh-input amount"
              inputMode="decimal"
              value={fmtPlain(totalCents)}
              onChange={(e) => onChangeTotal(toCents(e.target.value))}
              onFocus={(e) => e.target.select()}
            />
          </div>
        ) : (
          <>
            {items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                currency={currency}
                editing={editingId === item.id}
                onEdit={() => setEditingId(editingId === item.id ? null : item.id)}
                onPatch={(patch) => patchItem(item.id, patch)}
                onRemove={() => removeItem(item.id)}
              />
            ))}

            <hr className="hh-divider" />

            <div className="hh-totals-row">
              <span>Items</span>
              <span>{fmt(totalCents - extrasCents, currency)}</span>
            </div>
            <EditableTotal label="Tax" cents={taxCents} currency={currency} onChange={onChangeTax} />
            <EditableTotal label="Service charge" cents={serviceCents} currency={currency} onChange={onChangeService} />
            <EditableTotal label="Discount" cents={-discountCents} currency={currency} onChange={(c) => onChangeDiscount(Math.abs(c))} />
            {roundingCents !== 0 && (
              <div className="hh-totals-row">
                <span>Rounding</span>
                <span>{fmt(roundingCents, currency)}</span>
              </div>
            )}

            <div className="hh-totals-row grand">
              <span>Total</span>
              <input
                className="hh-input inline-edit price"
                aria-label="Total amount"
                style={{
                  width: 128,
                  fontFamily: "var(--font-display)",
                  fontSize: "var(--fs-xl)",
                  fontWeight: 900,
                  letterSpacing: "-0.035em",
                }}
                inputMode="decimal"
                value={fmtPlain(totalCents)}
                onChange={(e) => onChangeTotal(toCents(e.target.value))}
                onFocus={(e) => e.target.select()}
              />
            </div>

            <p className="hh-tiny hh-muted hh-mt-sm">
              {extrasCents === 0
                ? "Item prices already include everything."
                : `${fmt(extrasCents, currency)} of tax and charges is spread across the items by value, so every share adds back up to the total.`}
            </p>
          </>
        )}

        <ErrorBox>{error}</ErrorBox>
      </Card>

      {flagged.length > 0 && (
        <p className="hh-tiny hh-center" style={{ color: "rgba(245,240,232,0.55)" }}>
          {flagged.length} line{flagged.length > 1 ? "s" : ""} highlighted above.
          Worth a glance before you split.
        </p>
      )}

      <div className="hh-btn-row">
        <button className="hh-btn hh-btn-ghost" onClick={onBack}>Back</button>
        <button className="hh-btn hh-btn-primary" onClick={onNext} disabled={!canNext}>
          Split it
        </button>
      </div>
    </>
  );
}

function EditableTotal({ label, cents, currency, onChange }) {
  if (cents === 0) return null;
  const negative = cents < 0;
  const id = `hh-extra-${label.replace(/\s+/g, "-").toLowerCase()}`;
  const symbol = CURRENCIES[currency]?.symbol ?? currency;
  return (
    <div className="hh-totals-row">
      <label htmlFor={id}>{label}</label>
      <span className="hh-inline-amount">
        <span className="hh-inline-amount-affix">{negative ? `-${symbol}` : symbol}</span>
        <input
          id={id}
          className="hh-input inline-edit price"
          style={{ width: 80 }}
          inputMode="decimal"
          value={fmtPlain(Math.abs(cents))}
          onChange={(e) => onChange(toCents(e.target.value) * (negative ? -1 : 1))}
          onFocus={(e) => e.target.select()}
        />
      </span>
    </div>
  );
}

const FLAG_LABELS = {
  price: "price differs",
  name: "name differs",
  qty: "qty differs",
  only_one_reader: "only one reader saw this",
  added: "added by you",
};

function ItemRow({ item, currency, editing, onEdit, onPatch, onRemove }) {
  const flags = (item.flags || []).filter((f) => FLAG_LABELS[f]);
  const uncertain = item.confidence < 0.9;

  if (editing) {
    return (
      <div className="hh-line editing">
        <div className="hh-line-body">
          <input
            className="hh-input inline-edit"
            value={item.name}
            placeholder="Item name"
            onChange={(e) => onPatch({ name: e.target.value })}
            autoFocus
          />
          <div className="hh-row hh-mt-sm">
            <input
              className="hh-input inline-edit price hh-grow"
              inputMode="decimal"
              value={fmtPlain(item.lineCents)}
              onChange={(e) => onPatch({ lineCents: toCents(e.target.value) })}
              onFocus={(e) => e.target.select()}
            />
            <button className="hh-action danger" onClick={onRemove}>Delete</button>
            <button className="hh-action accent" onClick={onEdit}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`hh-line ${flags.length || uncertain ? "flagged" : ""}`}
      onClick={onEdit}
      aria-label={`Edit ${item.name || "untitled item"}`}
    >
      <div className="hh-line-body">
        <div className="hh-line-name">{item.name || "Untitled item"}</div>
        {item.qty > 1 && (
          <div className="hh-line-sub">
            {item.qty} {item.unit === "ea" ? "×" : item.unit} @ {fmt(item.unitCents, currency)}
          </div>
        )}
        {item.alternative && (
          <div className="hh-line-sub">
            Other reader saw “{item.alternative.name}” at {fmt(item.alternative.lineCents, currency)}
          </div>
        )}
        {flags.map((f) => (
          <span className="hh-chip-flag" key={f}>{FLAG_LABELS[f]}</span>
        ))}
      </div>
      <div className="hh-line-amount">{fmt(item.totalCents ?? item.lineCents, currency)}</div>
    </button>
  );
}

function Verdict({ report, currency, unexplainedCents }) {
  const problems = report.problems || [];
  const prepWarnings = [...new Set(
    (report.prep || [])
      .flatMap((p) => p?.warnings || [])
      .filter((code) => code && code !== "rotated")
  )];
  const rotated = (report.prep || []).some((p) => (p?.rotatedBy || 0) > 0);
  const ok = report.verified && Math.abs(unexplainedCents) <= 2;

  if (ok) {
    return (
      <div className="hh-verdict pass">
        <span className="hh-verdict-icon">✓</span>
        <div>
          <div className="hh-verdict-title">Verified</div>
          {report.readers.length > 1
            ? "Two independent readers agreed on every line, and the items add up to the printed total exactly."
            : "Every line adds up to the printed total exactly."}
          {report.printedItemCount ? ` The receipt's own count of ${report.printedItemCount} items matches.` : ""}
          {rotated ? " The photo was auto-rotated before reading." : ""}
          {prepWarnings.length > 0 ? (
            <ul>
              {prepWarnings.map((code) => (
                <li key={code}>{prepWarningMessage(code)}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="hh-verdict warn">
      <span className="hh-verdict-icon">!</span>
      <div>
        <div className="hh-verdict-title">Worth a check</div>
        The scan couldn't fully verify itself. Highlighted lines below are the
        ones to look at.
        <ul>
          {Math.abs(unexplainedCents) > 2 && (
            <li>
              {fmt(Math.abs(unexplainedCents), currency)} isn't explained by tax,
              service or discounts.
            </li>
          )}
          {rotated && <li>{prepWarningMessage("rotated")}</li>}
          {prepWarnings.map((code) => (
            <li key={code}>{prepWarningMessage(code)}</li>
          ))}
          {problems
            .filter((p) => p.code !== "unbalanced")
            .slice(0, 4)
            .map((p, i) => (
              <li key={i}>{p.message}</li>
            ))}
        </ul>
      </div>
    </div>
  );
}

// ── STEP 2: SPLIT ─────────────────────────────────────────────

function SplitStep({
  household, members, items, totalCents, splitBy, setSplitBy,
  included, setIncluded, onChangeItems, onBack, onNext,
}) {
  const currency = household.currency;
  const includedMembers = members.filter((m) => included.has(m.id));

  const toggleMember = (id) => {
    const next = new Set(included);
    if (next.has(id)) {
      if (next.size === 1) return; // someone has to pay for it
      next.delete(id);
    } else {
      next.add(id);
    }
    setIncluded(next);
  };

  const toggleItemMember = (itemId, memberId) => {
    onChangeItems(
      items.map((item) => {
        if (item.id !== itemId) return item;
        const current = new Set(
          item.memberIds?.length ? item.memberIds : members.map((m) => m.id)
        );
        if (current.has(memberId)) current.delete(memberId);
        else current.add(memberId);
        const next = [...current];
        return { ...item, memberIds: next.length === members.length ? [] : next };
      })
    );
  };

  const preview = useMemo(() => {
    const totals = new Map(members.map((m) => [m.id, 0]));
    if (splitBy === "items") {
      for (const item of items) {
        const ids = item.memberIds?.length ? item.memberIds : members.map((m) => m.id);
        const each = Math.floor(item.totalCents / ids.length);
        let remainder = item.totalCents - each * ids.length;
        ids.forEach((id) => {
          totals.set(id, (totals.get(id) || 0) + each + (remainder-- > 0 ? 1 : 0));
        });
      }
    } else {
      const ids = includedMembers.map((m) => m.id);
      const each = Math.floor(totalCents / (ids.length || 1));
      let remainder = totalCents - each * ids.length;
      ids.forEach((id) => {
        totals.set(id, each + (remainder-- > 0 ? 1 : 0));
      });
    }
    return totals;
  }, [splitBy, items, members, includedMembers, totalCents]);

  return (
    <>
      <Card perforated>
        <div className="hh-section-title">How to split it</div>
        <hr className="hh-divider" />

        <div className="hh-chips">
          <button
            className={`hh-chip ${splitBy === "equal" ? "on" : ""}`}
            onClick={() => setSplitBy("equal")}
          >
            Evenly
          </button>
          <button
            className={`hh-chip ${splitBy === "items" ? "on" : ""}`}
            onClick={() => setSplitBy("items")}
            disabled={!items.length}
          >
            Item by item
          </button>
        </div>

        {splitBy === "equal" ? (
          <>
            <p className="hh-tiny hh-muted hh-mt">
              Tap anyone who wasn't in on this one to leave them out.
            </p>
            <div className="hh-split-picker hh-mt">
              {members.map((m) => (
                <button
                  key={m.id}
                  className={`hh-split-pill ${included.has(m.id) ? "on" : ""}`}
                  onClick={() => toggleMember(m.id)}
                >
                  <Avatar member={m} size="sm" />
                  {m.display_name}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="hh-tiny hh-muted hh-mt">
            Every line is shared by the whole house unless you say otherwise.
            Tap the faces under an item to make it just theirs. Handy for the
            protein powder nobody else touches.
          </p>
        )}
      </Card>

      {splitBy === "items" && (
        <Card>
          <div className="hh-section-title">Who gets what</div>
          <hr className="hh-divider" />
          {items.map((item) => {
            const assigned = item.memberIds?.length ? item.memberIds : members.map((m) => m.id);
            const shared = assigned.length === members.length;
            return (
              <div
                key={item.id}
                style={{
                  padding: "var(--sp-3) 0",
                  borderBottom: "1px dotted rgba(140,123,101,0.4)",
                }}
              >
                <div className="hh-row-between">
                  <div className="hh-line-name hh-grow">{item.name}</div>
                  <div className="hh-line-amount">{fmt(item.totalCents, currency)}</div>
                </div>
                <div className="hh-split-picker" style={{ marginTop: "var(--sp-2)" }}>
                  {members.map((m) => (
                    <button
                      key={m.id}
                      className={`hh-split-pill ${assigned.includes(m.id) ? "on" : ""}`}
                      onClick={() => toggleItemMember(item.id, m.id)}
                    >
                      <Avatar member={m} size="sm" />
                      {m.display_name.split(" ")[0]}
                    </button>
                  ))}
                </div>
                <div className="hh-line-sub" style={{ marginTop: "var(--sp-2)" }}>
                  {shared
                    ? `Whole house · ${fmt(Math.round(item.totalCents / members.length), currency)} each`
                    : `${assigned.length} of ${members.length} · ${fmt(Math.round(item.totalCents / assigned.length), currency)} each`}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <Card>
        <div className="hh-section-title">Everyone's share</div>
        <hr className="hh-divider" />
        {members.map((m) => {
          const amount = preview.get(m.id) || 0;
          return (
            <div className="hh-member-row" key={m.id}>
              <Avatar member={m} muted={amount === 0} />
              <div className="hh-member-name">{m.display_name}</div>
              <div className={`hh-member-amount ${amount === 0 ? "settled" : ""}`}>
                {fmt(amount, currency)}
              </div>
            </div>
          );
        })}
        <hr className="hh-divider" />
        <div className="hh-totals-row grand">
          <span>Total</span>
          <span>{fmt(totalCents, currency)}</span>
        </div>
      </Card>

      <div className="hh-btn-row">
        <button className="hh-btn hh-btn-ghost" onClick={onBack}>Back</button>
        <button className="hh-btn hh-btn-primary" onClick={onNext}>Continue</button>
      </div>
    </>
  );
}

// ── STEP 3: CONFIRM ───────────────────────────────────────────

function ConfirmStep({
  household, members, title, setTitle, merchant, setMerchant, category, setCategory,
  expenseDate, setExpenseDate, paidBy, setPaidBy, note, setNote, totalCents,
  saving, error, onBack, onSave,
}) {
  return (
    <>
      <Card perforated>
        <div className="hh-section-title">Last details</div>
        <hr className="hh-divider" />

        <div className="hh-field">
          <label className="hh-label" htmlFor="hh-title">What was it</label>
          <input
            id="hh-title"
            className="hh-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Woolworths run"
            maxLength={80}
          />
        </div>

        <div className="hh-field">
          <span className="hh-label">Category</span>
          <div className="hh-chips">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                className={`hh-chip ${category === c.id ? "on" : ""}`}
                onClick={() => setCategory(c.id)}
              >
                <span>{c.icon}</span>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="hh-field">
          <span className="hh-label">Who paid</span>
          <div className="hh-split-picker">
            {members.map((m) => (
              <button
                key={m.id}
                className={`hh-split-pill ${paidBy === m.id ? "on" : ""}`}
                onClick={() => setPaidBy(m.id)}
              >
                <Avatar member={m} size="sm" />
                {m.display_name}
              </button>
            ))}
          </div>
        </div>

        <div className="hh-field">
          <label className="hh-label" htmlFor="hh-date">Date</label>
          <input
            id="hh-date"
            className="hh-input"
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
          />
        </div>

        {merchant && (
          <div className="hh-field">
            <label className="hh-label" htmlFor="hh-merchant">Shop</label>
            <input
              id="hh-merchant"
              className="hh-input"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              maxLength={80}
            />
          </div>
        )}

        <div className="hh-field">
          <label className="hh-label" htmlFor="hh-note">Note (optional)</label>
          <textarea
            id="hh-note"
            className="hh-textarea"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything the others should know"
            maxLength={280}
          />
        </div>

        <ErrorBox>{error}</ErrorBox>
      </Card>

      <div className="hh-btn-row">
        <button className="hh-btn hh-btn-ghost" onClick={onBack} disabled={saving}>
          Back
        </button>
        <button
          className="hh-btn hh-btn-neon"
          onClick={onSave}
          disabled={saving || !paidBy || totalCents <= 0}
        >
          {saving ? <Spinner /> : `Save ${fmt(totalCents, household.currency)}`}
        </button>
      </div>
    </>
  );
}
