import { experiences, orders } from './store.mjs';

export function listExperiences() {
  return experiences;
}

export function createOrder(input) {
  if (!input?.experienceSlug) {
    throw new Error('experienceSlug is required');
  }

  const exp = experiences.find((e) => e.slug === input.experienceSlug);
  if (!exp) {
    throw new Error('experience not found');
  }

  const order = {
    id: `ord_${String(orders.length + 1).padStart(4, '0')}`,
    experienceId: exp.id,
    experienceSlug: exp.slug,
    status: 'pending_payment',
    totalTwd: exp.priceTwd
  };

  orders.push(order);
  return order;
}
