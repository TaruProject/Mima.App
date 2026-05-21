import { describe, it, expect, vi } from "vitest";

// ==========================================================
// RESILIENCY UTILITIES (Duplicate definition for testing / decoupling)
// ==========================================================

async function runWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelayMs = 5, // Keep delay low for fast test execution
  backoffFactor = 2
): Promise<T> {
  let delay = initialDelayMs;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const errorStr = String(error.message || error).toLowerCase();
      const isRateLimit =
        error.status === 429 ||
        error.statusCode === 429 ||
        error.code === 429 ||
        errorStr.includes("429") ||
        errorStr.includes("rate limit") ||
        errorStr.includes("too many requests") ||
        errorStr.includes("resource exhausted");

      if (!isRateLimit || attempt === maxRetries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= backoffFactor;
    }
  }
  throw new Error("Max retries exceeded");
}

class CircuitBreaker {
  public state: "CLOSED" | "OPEN" | "HALF-OPEN" = "CLOSED";
  public failureCount = 0;
  public successCount = 0;
  private lastStateChange: number = Date.now();

  constructor(
    public failureThreshold = 3,
    public recoveryThreshold = 2,
    public cooldownPeriodMs = 100 // Short cooldown for fast test execution
  ) {}

  getState() {
    this.checkCooldown();
    return this.state;
  }

  private checkCooldown() {
    if (this.state === "OPEN" && Date.now() - this.lastStateChange > this.cooldownPeriodMs) {
      this.state = "HALF-OPEN";
      this.failureCount = 0;
      this.successCount = 0;
      this.lastStateChange = Date.now();
    }
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.checkCooldown();
    if (this.state === "OPEN") {
      throw new Error("CIRCUIT_BREAKER_OPEN");
    }

    try {
      const result = await fn();
      if (this.state === "HALF-OPEN") {
        this.successCount++;
        if (this.successCount >= this.recoveryThreshold) {
          this.state = "CLOSED";
          this.failureCount = 0;
          this.successCount = 0;
          this.lastStateChange = Date.now();
        }
      }
      return result;
    } catch (error: any) {
      if (error.message === "CIRCUIT_BREAKER_OPEN") {
        throw error;
      }
      this.failureCount++;
      if (this.state === "CLOSED" && this.failureCount >= this.failureThreshold) {
        this.state = "OPEN";
        this.lastStateChange = Date.now();
      } else if (this.state === "HALF-OPEN") {
        this.state = "OPEN";
        this.lastStateChange = Date.now();
      }
      throw error;
    }
  }
}

// ==========================================================
// TEST SUITE DEFINITIONS
// ==========================================================

describe("PRD-002: Resiliency Utilities", () => {
  
  describe("runWithBackoff", () => {
    it("should successfully resolve on the first attempt if no error occurs", async () => {
      const task = vi.fn().mockResolvedValue("success");
      const result = await runWithBackoff(task);
      expect(result).toBe("success");
      expect(task).toHaveBeenCalledTimes(1);
    });

    it("should retry if a 429 rate limit is encountered, and eventually succeed", async () => {
      let callCount = 0;
      const task = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          const error: any = new Error("Rate limit hit");
          error.status = 429;
          throw error;
        }
        return "success";
      });

      const result = await runWithBackoff(task, 3, 5, 2);
      expect(result).toBe("success");
      expect(task).toHaveBeenCalledTimes(3);
    });

    it("should fail immediately without retries if a non-429 error occurs", async () => {
      const task = vi.fn().mockRejectedValue(new Error("Generic DB error"));
      await expect(runWithBackoff(task)).rejects.toThrow("Generic DB error");
      expect(task).toHaveBeenCalledTimes(1);
    });

    it("should exhaust all retries and fail if rate limits persist", async () => {
      const task = vi.fn().mockImplementation(async () => {
        const error: any = new Error("Rate limit hit");
        error.status = 429;
        throw error;
      });

      await expect(runWithBackoff(task, 3, 5, 2)).rejects.toThrow("Rate limit hit");
      expect(task).toHaveBeenCalledTimes(3);
    });
  });

  describe("CircuitBreaker", () => {
    it("should execute successfully when state is CLOSED", async () => {
      const cb = new CircuitBreaker(3, 2, 100);
      const task = vi.fn().mockResolvedValue("data");
      const result = await cb.execute(task);
      expect(result).toBe("data");
      expect(cb.state).toBe("CLOSED");
    });

    it("should trip to OPEN after failure threshold is exceeded", async () => {
      const cb = new CircuitBreaker(3, 2, 100);
      const task = vi.fn().mockRejectedValue(new Error("Service down"));

      for (let i = 0; i < 3; i++) {
        await expect(cb.execute(task)).rejects.toThrow("Service down");
      }

      expect(cb.state).toBe("OPEN");
      
      // Subsequent calls should fail fast without running the task
      const anotherTask = vi.fn();
      await expect(cb.execute(anotherTask)).rejects.toThrow("CIRCUIT_BREAKER_OPEN");
      expect(anotherTask).not.toHaveBeenCalled();
    });

    it("should enter HALF-OPEN after cooldown expires and recover to CLOSED after consecutive successes", async () => {
      const cb = new CircuitBreaker(2, 2, 50); // failureThreshold = 2, recoveryThreshold = 2, cooldown = 50ms
      const taskFailure = vi.fn().mockRejectedValue(new Error("Service down"));

      // Trip the circuit
      await expect(cb.execute(taskFailure)).rejects.toThrow("Service down");
      await expect(cb.execute(taskFailure)).rejects.toThrow("Service down");
      expect(cb.state).toBe("OPEN");

      // Wait for cooldown to expire
      await new Promise((resolve) => setTimeout(resolve, 60));

      // This call should trigger checkCooldown() transitioning to HALF-OPEN, and then execute the task
      const taskSuccess = vi.fn().mockResolvedValue("restored");
      const result1 = await cb.execute(taskSuccess);
      expect(result1).toBe("restored");
      expect(cb.state).toBe("HALF-OPEN");

      // Second successful call in HALF-OPEN should recover state to CLOSED
      const result2 = await cb.execute(taskSuccess);
      expect(result2).toBe("restored");
      expect(cb.state).toBe("CLOSED");
    });
  });
});
