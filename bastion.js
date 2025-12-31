/**
 * @typedef {Object} BastionOptions
 * @property {number} [retries]
 * @property {number} [baseDelayMs]
 * @property {number} [maxDelayMs]
 * @property {boolean} [jitter]
 * @property {number[]} [retryStatusCodes]
 * @property {{
*   failureThreshold?: number,
*   resetTimeoutMs?: number
* }} [circuitBreaker]
*/

const sleep = ms => new Promise(r => setTimeout(r, ms))

const computeDelay = (attempt, base, max, jitter) => {
 let delay = Math.min(base * 2 ** attempt, max)
 if (jitter) delay *= Math.random()
 return delay
}

class CircuitBreaker {
 constructor(threshold, resetMs) {
   this.threshold = threshold
   this.resetMs = resetMs
   this.failures = 0
   this.openedAt = 0
 }

 allow() {
   if (this.failures < this.threshold) return true
   return Date.now() - this.openedAt > this.resetMs
 }

 success() {
   this.failures = 0
   this.openedAt = 0
 }

 fail() {
   this.failures++
   if (this.failures === this.threshold) {
     this.openedAt = Date.now()
   }
 }
}

/**
* Attach Bastion to an existing Axios instance.
* Nothing is overridden. Nothing is wrapped.
*
* @param {import('axios').AxiosInstance} axiosInstance
* @param {BastionOptions} options
*/
export function bastion(axiosInstance, options = {}) {
  const {
    retries = 3,
    baseDelayMs = 200,
    maxDelayMs = 5000,
    jitter = true,
    retryStatusCodes = [500, 502, 503, 504],
    circuitBreaker,
    logger
  } = options

  const log =
    typeof logger === 'function'
      ? logger
      : logger
      ? console.log
      : null

  const breaker = circuitBreaker
    ? new CircuitBreaker(
        circuitBreaker.failureThreshold ?? 5,
        circuitBreaker.resetTimeoutMs ?? 10000
      )
    : null

  axiosInstance.interceptors.response.use(
    response => {
      breaker?.success()
      return response
    },
    async error => {
      const config = error.config
      if (!config) throw error

      config.__bastionRetry ??= 0

      if (breaker && !breaker.allow()) {
        log?.(
          `[bastion] circuit open → ${config.method?.toUpperCase()} ${config.url}`
        )
        throw new Error('axios-bastion: circuit breaker open')
      }

      const status = error.response?.status
      const retryable =
        !status || retryStatusCodes.includes(status)

      if (!retryable || config.__bastionRetry >= retries) {
        breaker?.fail()
        log?.(
          `[bastion] failed after ${config.__bastionRetry} retries → ${config.method?.toUpperCase()} ${config.url}`
        )
        throw error
      }

      config.__bastionRetry++
      breaker?.fail()

      const delay = computeDelay(
        config.__bastionRetry,
        baseDelayMs,
        maxDelayMs,
        jitter
      )

      log?.(
        `[bastion] retry ${config.__bastionRetry}/${retries} in ${delay}ms → ${config.method?.toUpperCase()} ${config.url}`
      )

      await sleep(delay)

      return axiosInstance.request(config)
    }
  )
}

