import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  // Every test gets a fresh browser-persistence boundary. Several workspace
  // suites deliberately exercise onboarding and saved experiments; allowing
  // those keys to leak made the result depend on file execution order.
  localStorage.clear();
  sessionStorage.clear();
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: ResizeObserverStub,
});

Object.defineProperty(globalThis, "requestAnimationFrame", {
  configurable: true,
  value: vi.fn(() => 1),
});

Object.defineProperty(globalThis, "cancelAnimationFrame", {
  configurable: true,
  value: vi.fn(),
});

if (!HTMLElement.prototype.setPointerCapture) {
  HTMLElement.prototype.setPointerCapture = () => {};
}

// jsdom intentionally leaves canvas rendering unimplemented and otherwise
// emits a noisy "not implemented" warning when Pixi performs feature
// detection. Rendering behavior is covered through the Pixi graphics stubs;
// returning null here matches a browser without an available drawing context.
Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  value: vi.fn(() => null),
});
