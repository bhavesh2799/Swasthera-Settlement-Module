---
name: Invoice number race condition
description: generateInvoice reads MAX(invoice_number) then inserts — parallel calls collide; always call sequentially.
---

## Rule
Never call `generateInvoice(orderId)` in parallel (e.g. `Promise.all`). Always use a sequential `for` loop.

**Why:** `generateInvoice` computes the next invoice number by querying `MAX(invoice_number)` for the brand, then inserts. If two calls run concurrently they both read the same MAX before either has committed, producing the same invoice number and a unique-constraint violation.

**How to apply:** Any place that needs to generate multiple invoices in one request (batch capture, demo reset, etc.) must await each call before the next:
```ts
for (const orderId of orderIds) {
  await generateInvoice(orderId);
}
```
