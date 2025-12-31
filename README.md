# axios-bastion

A defensive layer for Axios: retries, exponential backoff, and circuit breaker.

## Install

```bash
npm install axios-bastion
```

## Example

```js
import axios from 'axios'
import { bastion } from 'axios-bastion'

const api = axios.create({ baseURL: 'https://api.example.com' })

bastion(api, {
  retries: 3,
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeoutMs: 10000
  }
})

const res = await api.get('/data')
```
