/** A bounded, non-sensitive error that may be shown to an operator or caller. */
export class CrowboError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrowboError";
  }
}

/** A validation failure raised inside a schema; surfaced to callers as a schema error. */
export class ContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractError";
  }
}
