import { PiReviewAgent } from "./pi";
import type { ReviewAgent } from "./types";

export * from "./types";
export { PiReviewAgent } from "./pi";

const AGENT_REGISTRY: Record<string, () => ReviewAgent> = {
  pi: () => new PiReviewAgent(),
};

export function registerReviewAgent(
  name: string,
  factory: () => ReviewAgent,
): void {
  AGENT_REGISTRY[name.toLowerCase()] = factory;
}

export function createReviewAgent(name = "pi"): ReviewAgent {
  const normalized = name.toLowerCase();
  const factory = AGENT_REGISTRY[normalized];

  if (!factory) {
    const available = Object.keys(AGENT_REGISTRY).join(", ");
    throw new Error(
      `Unsupported review agent backend: "${name}". Available backends: ${available}`,
    );
  }

  return factory();
}
