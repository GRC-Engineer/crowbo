/**
 * An error whose message is meant for the person using the engine (invalid input, unknown topic,
 * a refused call). Hosts pass these messages through; any other error is reported generically.
 */
export class EngineError extends Error {
  override name = "EngineError";
}
