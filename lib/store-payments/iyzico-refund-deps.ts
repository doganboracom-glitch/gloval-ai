import 'server-only'
import { releaseOrderStockSafely } from '@/lib/store-order-stock'
import { notifyOrderAttention, notifyOrderRefunded } from '@/lib/store-order-notifications'
import type { RefundDeps } from '@/lib/store-payments/iyzico-refund'

export const realRefundDeps: RefundDeps = {
  releaseStock: (admin, orderId) => releaseOrderStockSafely(admin, orderId),
  notifyRefunded: notifyOrderRefunded,
  attention: { notifyAttention: (orderId) => notifyOrderAttention(orderId, 'refund') },
}
