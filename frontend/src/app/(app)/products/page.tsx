import { ProductsView } from './products-view';

/**
 * Products section. A thin server component that renders the client
 * {@link ProductsView}, which reads the active business from context and loads
 * the catalogue from the API via React Query.
 */
export default function ProductsPage(): React.JSX.Element {
  return <ProductsView />;
}
