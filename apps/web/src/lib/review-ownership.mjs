export function isReviewSubmissionAuthorized({
  booking,
  order,
  userId,
  bookingOwned,
  orderOwned,
}) {
  if (!userId) {
    return false;
  }

  if (booking) {
    return bookingOwned ?? booking.traveler_id === userId;
  }

  return orderOwned ?? Boolean(order?.user_id === userId);
}
