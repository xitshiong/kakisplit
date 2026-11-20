import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { ReceiptTransform } from './ReceiptTransform.jsx';

function mockIntersectionObserver() {
  let onIntersect;
  const observe = vi.fn();
  const disconnect = vi.fn();
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback) { onIntersect = callback; }
    observe = observe;
    disconnect = disconnect;
  });
  return { update: isIntersecting => act(() => onIntersect([{ isIntersecting }])), observe, disconnect };
}

it('runs only when visible, and pauses when the figure leaves the viewport or tab is hidden', () => {
  const intersection = mockIntersectionObserver();
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const { container, unmount } = render(<ReceiptTransform />);
  const figure = screen.getByRole('figure', { name: /Snap. Pick. Pay the host./ });
  const scene = container.querySelector('[data-running]');
  expect(intersection.observe).toHaveBeenCalledWith(figure);
  expect(scene).toHaveAttribute('data-running', 'false');
  intersection.update(true);
  expect(scene).toHaveAttribute('data-running', 'true');
  hidden.mockReturnValue(true);
  fireEvent(document, new Event('visibilitychange'));
  expect(scene).toHaveAttribute('data-running', 'false');
  hidden.mockReturnValue(false);
  fireEvent(document, new Event('visibilitychange'));
  expect(scene).toHaveAttribute('data-running', 'true');
  intersection.update(false);
  expect(scene).toHaveAttribute('data-running', 'false');
  unmount();
  expect(intersection.disconnect).toHaveBeenCalledOnce();
});

it('supports pausing, resuming, and replaying without an observer', async () => {
  vi.stubGlobal('IntersectionObserver', undefined);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const user = userEvent.setup();
  const { container } = render(<ReceiptTransform />);
  const scene = container.querySelector('[data-running]');
  expect(scene).toHaveAttribute('data-running', 'true');
  await user.click(screen.getByRole('button', { name: 'Pause receipt animation' }));
  expect(scene).toHaveAttribute('data-running', 'false');
  await user.click(screen.getByRole('button', { name: 'Play receipt animation' }));
  expect(scene).toHaveAttribute('data-running', 'true');
  await user.click(screen.getByRole('button', { name: 'Pause receipt animation' }));
  await user.click(screen.getByRole('button', { name: 'Replay' }));
  expect(scene).not.toBeInTheDocument();
  expect(container.querySelector('[data-running]')).toHaveAttribute('data-running', 'true');
});
