export class ApiError extends Error {
  constructor(message: string, public status: number = 500) {
    super(message);
    this.name = 'ApiError';
  }
}

export const simulateNetworkDelay = async (min = 350, max = 650) => {
  const ms = Math.floor(min + Math.random() * (max - min));
  await new Promise((resolve) => setTimeout(resolve, ms));
};

export const maybeSimulateError = (failureRate = 0.0) => {
  if (Math.random() < failureRate) {
    throw new ApiError('Simulated network disruption. Tap to retry.', 503);
  }
};
