import { CustomersView } from './customers-view';

/**
 * Customers section. A thin server component that renders the client
 * {@link CustomersView}, which reads the active business from context and loads
 * customers from the API via React Query.
 */
export default function CustomersPage(): React.JSX.Element {
  return <CustomersView />;
}
