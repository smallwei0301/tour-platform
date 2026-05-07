export type AuthenticatedUser = {
  id: string | null;
  email: string | null;
};

export type V2OrderOwnerSnapshot = {
  user_id: string | null;
  contact_email: string;
};

export function isOrderOwner(order: V2OrderOwnerSnapshot, user: AuthenticatedUser): boolean {
  const normalizedOrderEmail = (order.contact_email || '').trim().toLowerCase();
  const normalizedUserEmail = (user.email || '').trim().toLowerCase();

  return (
    (!!order.user_id && order.user_id === user.id) ||
    (!!normalizedOrderEmail && !!normalizedUserEmail && normalizedOrderEmail === normalizedUserEmail)
  );
}
