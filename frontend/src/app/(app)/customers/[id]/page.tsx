import { CustomerProfileView } from './customer-profile-view';

/**
 * `/customers/[id]` — a single customer's profile and timeline. The app's first
 * dynamic route; in Next 15 `params` is async, so it is awaited before use.
 */
export default async function CustomerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;
  return <CustomerProfileView customerId={id} />;
}
