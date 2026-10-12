# Financial rules and formulas

All amounts are integer poisha. Debits equal credits for each journal event.

| Event                      | Debit                                 | Credit                                 |
| -------------------------- | ------------------------------------- | -------------------------------------- |
| Monthly invoice            | Tenant receivables                    | Rental income / service / other income |
| Payment, including advance | Cash/bank                             | Tenant receivables                     |
| Unallocated advance refund | Tenant receivables                    | Cash/bank                              |
| Credit note                | Other billed income (contra-income)   | Tenant receivables                     |
| Deposit received           | Cash/bank                             | Refundable deposit liability           |
| Deposit refunded           | Deposit liability                     | Cash/bank                              |
| Paid operating expense     | Operating expense                     | Cash/bank                              |
| Unpaid vendor bill         | Operating expense or property capital | Vendor payable                         |
| Pay vendor bill            | Vendor payable                        | Cash/bank                              |
| Capital spending           | Property capital asset                | Cash/bank                              |
| Loan funded                | Cash/bank                             | Loan liability                         |
| Loan principal repaid      | Loan liability                        | Cash/bank                              |
| Loan interest paid         | Interest expense                      | Cash/bank                              |
| Owner opening cash         | Cash/bank                             | Owner equity                           |
| Internal account transfer  | Receiving cash/bank                   | Sending cash/bank                      |
| Reversal                   | Original credits                      | Original debits                        |

An advance is a credit balance in the tenant subledger (credit receivables), not
recognized income. Its separate unallocated amount is tracked through payments
minus allocation and refund rows. A future accounting version can reclassify
credit receivables into a dedicated tenant-advance liability account; this release
does not assert such reclassification has been implemented. Refundable security
deposits are separately posted liabilities now.

## Green Tower example

October: rent 25,000 + service 2,000 = invoice 27,000. Payments of 20,000 and
2,000 post as two immutable transactions/receipts. October closes at 5,000.
November has a new 27,000 invoice, with the prior 5,000 as an informational
opening/account balance. November billed rental revenue remains 25,000, service
revenue 2,000, and account payable becomes 32,000 before new payments.

## Balance and performance definitions

- Tenant balance = receivable journal debits minus credits for that tenant.
- Invoice due = invoice total minus unreversed allocated payments minus credits.
- Deposit held = deposits received minus deposit refunds.
- Loan outstanding = disbursed principal minus recorded principal repayments.
- Net operating income = billed rent + billed service + other billed income /
  credits minus operating expenses. It excludes capital spending and debt service.
- Income after interest = NOI minus posted interest expense.
- Actual net cash movement = all cash/bank journal debits minus credits, including
  financing, deposits, capital spending and vendor payments. Internal transfers
  net to zero across the portfolio. It is not the same as NOI.
- Posted capital = property-capital journal debit balance, including investment
  spending and capital-classified expenses. Profile purchase-price metadata is
  not included until spending is posted. Do not post the same acquisition twice.
- Estimated value = latest dated valuation on/before the selected end date.
  Missing valuations contribute zero, rather than fabricated appreciation.
- Annualized gross rental yield = (period rent + service) × 365 / selected days /
  posted capital × 100. Service is included explicitly in this release's definition.
- Annualized net operating yield = period NOI × 365 / selected days / posted
  capital × 100.
- Estimated cumulative ROI = (estimated value − posted capital + lifetime NOI −
  lifetime loan interest) / posted capital × 100. It is a capital-based estimated
  metric, not cash-on-cash, realized profit, or a tax return. Property sale/disposal returns and
  cash-on-cash property returns are not implemented. Owner equity movements
  and standalone investment redemptions are supported separately.

Yield denominators use posted capital, not purchase-price text or estimated
value. A zero denominator displays an em dash. Valuation changes never post
revenue or change bank/cash balances. Loan schedules are planning estimates at
fixed rates; payment forms record the lender's actual principal/interest split.

## Proration, schedules and dates

With proration enabled, rent is summed at the dated effective rent rate for each
occupied calendar day, divided by days in that month, rounded to nearest poisha.
Service uses occupied-days/month-days. With proration disabled, a month that
intersects a lease is billed in full using the rate effective at that lease
month's first occupied day. Meter consumption uses whole readings at the meter's
entered per-unit rate. Dates are ISO calendar dates; the business timezone is
used to determine today's calendar date.

Monthly invoices use the lease billing/due day (1–28), adjusted so a mid-month
lease is not billed/due before its start. Billing is not a bank transfer.
FIFO allocations apply oldest invoice first and leave unused amounts as advance.
Allocations are invoice-level; invoice-item allocation is unfinished.

Financial-period reports use journal dates. Reversals affect their posting date
and preserve the original prior-period balance. Current invoice statuses may
differ from historical as-of balances; reports calculate as-of amounts explicitly.
Property purchase values, maintenance estimates and future payment expectations
never become cash or income automatically.

## Corrections

Posted financial rows cannot be edited/deleted. A reversal requires a reason;
it adds the opposite journal and retains the original invoice/payment/receipt.
Payments linked to an invoice must be reversed before that invoice is voided.
Payments already refunded cannot be reversed by this release. Paid vendor bills
need a later documented accounting correction workflow; the simple reversal
form intentionally rejects them.

Credit notes reduce unpaid invoice balances; they do not delete charges. Advance
refunds are limited to unallocated available credit. Deposit refunds cannot
exceed held deposits. Early lease termination retains all records and does not
automatically perform final settlement.

## Owner and financial investment postings (v0.2)

| Event | Debit | Credit |
| --- | --- | --- |
| Owner contribution | Cash/bank | Owner equity |
| Owner distribution | Owner equity | Cash/bank |
| Financial investment purchase | Financial investments | Cash/bank |
| Investment income received | Cash/bank | Investment returns |
| Redemption above cost basis | Cash/bank | Released investment basis and realized gain |
| Redemption below cost basis | Cash/bank and realized loss | Released investment basis |

The redemption cost basis is entered by the owner; the app checks available
principal and the dated principal timeline. It does not infer tax basis or
market prices. A zero-cash redemption of positive basis records a total loss.
Investment returns are separate from rental NOI. Budgets are management plans
and create no accounting entries. Budget actuals use incurred operating
expenses and dated reversals, including unpaid bills.

Cash-flow policy: rental payments/refunds, deposits, operating expenses,
investment income and loan interest are operating; property capital, financial
investment purchases/redemptions and paid capital vendor bills are investing;
loan principal and owner/opening capital are financing. Internal transfers net
to zero over all cash accounts. The classifications reconcile to the cash ledger.
