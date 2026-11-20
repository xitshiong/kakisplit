import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createWorker } from 'tesseract.js';
import { prepareReceiptPart, prepareReceiptParts, rotateDataUrl } from './receiptPrep.js';

vi.mock('tesseract.js', () => ({
  createWorker: vi.fn(),
  OEM: { LSTM_ONLY: 1 },
  PSM: { AUTO: 3 },
}));

const original = {
  dataUrl: 'data:image/jpeg;base64,b3JpZ2luYWw=',
  b64: 'b3JpZ2luYWw=',
  width: 800,
  height: 1200,
};
const rotated = 'data:image/jpeg;base64,cm90YXRlZA==';
const word = { text: 'Receipt', confidence: 90 };
let worker;

beforeEach(() => {
  vi.useFakeTimers();
  worker = {
    setParameters: vi.fn().mockResolvedValue(undefined),
    detect: vi.fn().mockResolvedValue({ data: { orientation_degrees: 0 } }),
    recognize: vi.fn().mockResolvedValue({
      data: { blocks: [{ paragraphs: [{ lines: [{ words: Array(8).fill(word) }] }] }] },
    }),
    terminate: vi.fn().mockResolvedValue(undefined),
  };
  vi.mocked(createWorker).mockReset().mockResolvedValue(worker);
});

afterEach(() => vi.useRealTimers());

function mockRotation() {
  vi.stubGlobal('Image', class {
    width = original.width;
    height = original.height;
    set src(_value) { this.onload(); }
  });
  const context = { translate: vi.fn(), rotate: vi.fn(), drawImage: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
  const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(rotated);
  return { context, encode };
}

it('corrects a confident quarter turn and probes the rotated image', async () => {
  const { context, encode } = mockRotation();
  worker.detect.mockResolvedValue({ data: { orientation_degrees: 90, orientation_confidence: 1.5 } });
  const result = await prepareReceiptPart(original);
  expect(result).toEqual({
    width: 1200, height: 800, dataUrl: rotated, b64: 'cm90YXRlZA==',
    prep: { engine: 'tesseract.js', rotatedBy: 270, meanConfidence: 90, wordCount: 8, warnings: ['rotated'], ok: true },
  });
  expect(context.translate).toHaveBeenCalledWith(600, 400);
  expect(context.rotate).toHaveBeenCalledWith(1.5 * Math.PI);
  expect(encode).toHaveBeenCalledWith('image/jpeg', 0.92);
  expect(worker.recognize).toHaveBeenCalledWith(rotated, {}, { text: true, blocks: true });
  expect(worker.terminate).toHaveBeenCalledOnce();
});

it('leaves an uncertain orientation alone and accepts a base64-only input', async () => {
  worker.detect.mockResolvedValue({ data: { orientation_degrees: 90, orientation_confidence: 1 } });
  const result = await prepareReceiptPart({ b64: original.b64 });
  expect(result.dataUrl).toBe(original.dataUrl);
  expect(result.prep).toMatchObject({ rotatedBy: 0, warnings: [], ok: true });
  expect(worker.recognize).toHaveBeenCalledWith(original.dataUrl, expect.anything(), expect.anything());
});

it('probes the original photo when orientation fails and tolerates a failed probe', async () => {
  worker.detect.mockRejectedValue(new Error('OSD unavailable'));
  worker.recognize.mockRejectedValue(new Error('No text'));
  const result = await prepareReceiptPart(original);
  expect(result).toMatchObject({
    ...original,
    prep: { ok: false, rotatedBy: 0, wordCount: 0, warnings: ['little_text'] },
  });
  expect(worker.recognize).toHaveBeenCalledWith(original.dataUrl, expect.anything(), expect.anything());
  expect(worker.terminate).toHaveBeenCalledOnce();
});

it('continues past a timed-out orientation probe', async () => {
  worker.detect.mockReturnValue(new Promise(() => {}));
  const result = prepareReceiptPart(original);
  await vi.advanceTimersByTimeAsync(25_000);
  expect(await result).toMatchObject({ ...original, prep: { rotatedBy: 0, ok: true } });
  expect(worker.terminate).toHaveBeenCalledOnce();
});

it('keeps the original first photo when the worker fails and still checks the next photo', async () => {
  vi.mocked(createWorker).mockRejectedValueOnce(new Error('Worker unavailable'));
  const second = { ...original, width: 600 };
  const onProgress = vi.fn();
  const results = await prepareReceiptParts([original, second], { onProgress });
  expect(results[0]).toMatchObject({ ...original, prep: { skipped: true, ok: true } });
  expect(results[1]).toMatchObject({ ...second, prep: { wordCount: 8, ok: true } });
  expect(onProgress.mock.calls).toEqual([
    ['preparing', 'Checking photo 1 of 2'],
    ['preparing', 'Checking photo 2 of 2'],
  ]);
  expect(worker.terminate).toHaveBeenCalledOnce();
});

it('returns without creating a worker for empty input and skips a no-op rotation', async () => {
  const onProgress = vi.fn();
  expect(await prepareReceiptParts([], { onProgress })).toEqual([]);
  await expect(prepareReceiptPart({})).rejects.toThrow('No receipt image to prepare');
  expect(await rotateDataUrl(original.dataUrl, 360)).toBeNull();
  expect(createWorker).not.toHaveBeenCalled();
  expect(onProgress).not.toHaveBeenCalled();
});
