export class FeatureNotImplementedError extends Error {
  constructor(feature: string) {
    super(`${feature} is not implemented in phase 1.`);
    this.name = "FeatureNotImplementedError";
  }
}
